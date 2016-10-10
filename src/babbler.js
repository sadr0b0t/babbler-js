
// Будем генерировать события с API EventEmitter
// https://nodejs.org/api/events.html
// https://nodejs.org/api/util.html#util_util_inherits_constructor_superconstructor

// обычная нода
//var EventEmitter = require('events');
//var inherits = require('util').inherits;

// для браузера - порты без глубоких зависимостей
var EventEmitter = require('node-event-emitter');
var inherits = require('inherits');

///////////////////////
// Внутренние константы

/** Ждем ответ не более 5ти секунд, потом игнорируем */
const BBLR_REPLY_TIMEOUT_MILLIS = 5000;

/** 
 * Период выборки команд из очереди на отправку.
 * Оправлять команду на устройство раз в 200 миллисекунд (5 раз в секунду)
 * (на 100 миллисекундах команды начинают склеиваться)
 */
const BBLR_DEQUEUE_PERIOD = 200;

/** Прочищаем зависшие запросы раз в секунду */
const BBLR_VALIDATE_REPLY_CALLBACKS_PERIOD = 1000;


/** Статусы устройства: отключено, подключаемся, подключено */
const DeviceStatus = {
    DISCONNECTED: "disconnected",
    CONNECTING: "connecting",
    CONNECTED: "connected"
};

/** Направление потока данных */
const DataFlow = {
    /** in: с устройства */
    IN: "in",
    /** out: на устройство */
    OUT: "out",
    /** queue: добавлено в очередь на отправку */
    QUEUE: "queue"
};

const BabblerEvent = {
    STATUS: "status",
    DATA: "data",
    DATA_ERROR: "data_error",
}

/** Ошибка команды: таймаут */
const BBLR_ERROR_REPLY_TIMEOUT = "Reply timeout";
/** Ошибка команды: устройство отключено до отпавки */
const BBLR_ERROR_DISCONNECTED_BEFORE = "Device disconnected before cmd was sent";
/** Ошибка команды: устройство отключено после отпавки */
const BBLR_ERROR_DISCONNECTED_AFTER = "Device disconnected after cmd was sent";
/** Ошибка команды: устройство не подключено */
const BBLR_ERROR_DEVICE_NOT_CONNECTED = "Device not connected"
/** Ошибка команды: ошибка записи в порт */
const BBLR_ERROR_WRITING_TO_PORT = "Error writing to port"
/** Неправильное имя порта устройства */
const BBLR_ERROR_INVALID_PORT_NAME = "Invalid port name"

/** Команда ping */
const BBLR_CMD_PING = "ping";


/**
 * Обратный вызов, вызывается при смере статуса подключения к устройству.
 * @typedef {function} statusChangeCallback
 * @param {string} status - статус подключения DeviceStatus: 
 *     'disconnected', 'connecting', 'connected'
 */
 
/**
 * Обратный вызов для реакции на входящие и исходящие данные.
 * @typedef {function} dataCallback
 * @param {string} data - пакет данных
 * @param {string} dir - направление данных DataFlow:
 *     in - данные пришли с устройства, 
 *     out - данные отправлены на устройство,
 *     queue - данные добавлены во внутреннюю очеред на отправку
 */

/**
 * Обратный вызов для реакции на ошибку при отправке и приеме данных.
 * @typedef {function} dataErrorCallback
 * @param {string} data - пакет данных
 * @param {string} dir - направление данных DataFlow:
 *     in - данные пришли с устройства, 
 *     out - данные отправлены на устройство,
 *     queue - данные добавлены во внутреннюю очеред на отправку
 * @param {?error} error - информация об ошибке.
 */
 
/**
 * @typedef {Object} openOptions
 * @property {number} [baudRate=9600] The baud rate of the port to be opened. This 
 *     should match one of commonly available baud rates, such as 110, 300, 1200, 2400, 4800, 9600, 
 *     14400, 19200, 38400, 57600, 115200. There is no guarantee, that the device connected 
 *     to the serial port will support the requested baud rate, even if the port itself supports that baud rate.
 * see https://github.com/EmergingTechnologyAdvisors/node-serialport/blob/master/lib/serialport.js#L68
 */
 

/**
 * Создать экземпляр устройства - плата с прошивкой на основе библиотеки babbler_h, 
 * подключенная через последовательный порт.
 * 
 * https://github.com/1i7/babbler_h
 *
 * @param {module:babbler-js~statusChangeCallback=} onStatusChange - обратный вызов 
 *     для получения обновлений статуса подключения к устройству.
 */
function BabblerDevice(onStatusChange) {
    //http://phrogz.net/js/classes/OOPinJS.html
    
    ///////////////////////////////////////////
    // Статус
    
    /** 
     * Имя устройства, к которому были последний раз 
     * подключены или пытались подключиться.
     */
    var _deviceName = undefined;
    /** Статус подалкючения к устройству */
    var _deviceStatus = DeviceStatus.DISCONNECTED;
    /** Значение ошибки на случай неудачного подключения */
    var _deviceError = undefined;
    /** 
     * Флаг таймаута: 
     * true: устройство подключено, но не прислало ответ 
     *     на последнюю команду вовремя
     * false: устройство подключено, ответ на последнюю 
     *     команду пришел во время 
     */
    var _deviceTimeoutFlag = false;
    
    ///////////////////////////////////////////
    // Слушатели событий
    // подпишем слушателя статуса устройства из конструктора
    if(onStatusChange != undefined) {
        this.on(BabblerEvent.STATUS, onStatusChange);
    }
    
    ///////////////////////////////////////////
    // Внутренняя кухня
    /** Последовательный порт */
    var port = undefined;
    
    /** Очередь команд на отправку */
    var cmdQueue = [];
    
    /**
     * Очередь колбэков для ответов на отправленные команды
     * (по-хорошему, там всегда будет максимум один элемент, если контроллер отвечает
     * достаточно быстро)
     */
    var cmdReplyCallbackQueue = [];
    
    /** Счетчик для генерации идентификаторов отправляемых команд */
    var cmdId = 0;
    
    
    /** на всякий случай прочищаем зависшие запросы раз в секунду */
    var validateIntId;
        
    /** 
     * отправлять команду на устройство раз в 200 миллисекунд (5 раз в секунду)
     * (на 100 миллисекундах команды начинают склеиваться)
     */
    var dequeueIntId;
    
    /** проверять статус устройства раз в 5 секунд */
    var checkAliveIntId;
    
    ///////////////////////////////////////////
    // Всякие методы
    
    /**
     * Вычистить колбэки, которые ожидают в очереди дольше установленного таймаута
     * BBLR_REPLY_TIMEOUT_MILLIS (5ти секунд)
     * @emits module:babbler-js#data_error
     */
    var _validateReplyCallbacks = function() {
        // 
        var toRemove = [];
        for(var i in cmdReplyCallbackQueue) {
            var callback = cmdReplyCallbackQueue[i];
            if(Date.now() - callback.timestamp > BBLR_REPLY_TIMEOUT_MILLIS) {
                toRemove.push(callback);
            }
        }
        for(var i in toRemove) {
            var callback = toRemove[i];
            cmdReplyCallbackQueue.splice(cmdReplyCallbackQueue.indexOf(callback), 1);
            // известим отправившего команду
            callback.onError(callback.cmd, new Error(BBLR_ERROR_REPLY_TIMEOUT));
            // остальных тоже известим, что ответа не дождались
            this.emit(
                BabblerEvent.DATA_ERROR,
                JSON.stringify({cmd: callback.cmd, id: callback.id, params: callback.params}),
                DataFlow.IN,
                new Error(BBLR_ERROR_REPLY_TIMEOUT)
             );
            // выставим флаг таймаута, пока без события
            _deviceTimeoutFlag = true;
        }
    }.bind(this);
    
    /**
     * Проверить, живо ли устройство: если ответило на ping во-время, значит живо,
     * иначе не живо - отключаемся.
     */
    var _checkDeviceAlive = function() {
        _queueCmd(/*cmd*/ BBLR_CMD_PING, /*params*/ [],
            // onReply
            function(cmd, id, reply) {
                // как минимум для последовательного порта
                // здесь это делать не обязательно, т.к.
                // статус "включено" отлавливается в 
                // процессе подключения самого порта
                //_setDeviceStatus(DeviceStatus.CONNECTED);
            },
            // onError
            function(cmd, err) {
                _disconnect(err);
            }
        );
    }
    
    /**
     * Установить статус устройства: отключено, подключено, подключаемся.
     * @emits module:babbler-js#status
     */
    var _setDeviceStatus = function(status, error) {
        _deviceError = error;
        if(_deviceStatus != status) {
            _deviceStatus = status;
            
            // известим слушателей
            this.emit(BabblerEvent.STATUS, status);
        }
    }.bind(this);
    

    /**
     * Подключаемся к устройству на последовательном порте
     * @param {string} portName - имя порта для подключения:
     *     ("/dev/ttyUSB0" в Linux, "COM1", "COM2" и т.п. в Windows)
     * @param {module:babbler-js~openOptions=} options - дополнительное настройки подключения:
     * @param {number} [options.baudRate] - скорость порта
     *     
     */
    this.connect = function(portName, options) {
        // не будем подключаться, если уже подключены
        if(_deviceStatus !== DeviceStatus.DISCONNECTED) return;
        
        _deviceName = portName;
        
        // подключаемся
        _setDeviceStatus(DeviceStatus.CONNECTING);
    
        // некорректное имя порта - засчитаем попытку подключения с ошибкой.
        // проверка на пустую строку: true, если undefined, null, 0, "", " ")
        // http://stackoverflow.com/questions/5515310/is-there-a-standard-function-to-check-for-null-undefined-or-blank-variables-in/21732631#21732631
        if((portName ? portName.trim().length == 0 : true)) {
            _setDeviceStatus(DeviceStatus.DISCONNECTED, new Error(BBLR_ERROR_INVALID_PORT_NAME + ": '" + portName + "'"));
            return;
        }
        
        // https://github.com/EmergingTechnologyAdvisors/node-serialport#usage
        var SerialPort = require('serialport');
        
        // скорость подключения из настроек или по умолчанию 9600
        var baudRate = (options != undefined && typeof options.baudRate === 'number') ? 
            options.baudRate : 9600;

        port = new SerialPort(portName, {
            // скорость
            baudRate:  baudRate,
            // получать данные по одной строке
            parser: SerialPort.parsers.readline('\n'),
            // не открывать порт сразу здесь
            autoOpen: false,
            lock: true
        });

        // 
        // События
        // 

        // порт открылся
        port.on('open', function () {
            // порт открыт, но устройство может еще какое-то время тупить 
            // до того, как начнет отвечать на запросы (или это может быть
            // вообще неправильное устройство)
             
            // поэтому будем считать, что подключены, только после того, 
            // как примем ответ на первый пинг
            
            // прочищаем зависшие запросы раз в секунду
            validateIntId = setInterval(_validateReplyCallbacks, BBLR_VALIDATE_REPLY_CALLBACKS_PERIOD);
            
            // отправляем пинг напрямую, а не через очередь команд, т.к. 
            // очередь в этот момент все равно пустая и не работает
            var firstPing = function() {
                _writeCmd(/*cmd*/ "ping", /*params*/ [],
                    // onReply 
                    function(cmd, id, reply) {
                        // пришел ответ - теперь точно подключены
                        // (вообще, можно было бы проверить, что статус reply=='ok',
                        // а не 'dontundertand' или 'error', но корректно сформированного
                        // ответа, в общем, и так достаточно, будем прощать всякие 
                        // косяки по максимуму)
                        
                        // отправлять команду на устройство раз в 200 миллисекунд (5 раз в секунду)
                        // (на 100 миллисекундах команды начинают склеиваться)
                        dequeueIntId = setInterval(_dequeueCmd, BBLR_DEQUEUE_PERIOD);
                        
                        // проверять статус устройства раз в 5 секунд
                        // (при подключении через последовательный порт - это излишество,
                        // если только обрабатывать случай, когда само устройство повисло
                        // на какую-нибудь долгую задачу и не хочет отправлять ответы в 
                        // установленное время)
                        //checkAliveIntId = setInterval(_checkDeviceAlive, 5000);
                        
                        // обновим статус (на самом деле, устройство может еще 
                        // какое-то время тупить до того, как начнет отвечать
                        // на запросы)
                        _setDeviceStatus(DeviceStatus.CONNECTED);
                    },
                    // onError 
                    function(cmd, err) {
                        // превышено время ожидаения ответа - пробуем еще раз до
                        // тех пор, пока не подключимся или не отменим попытки
                        if(_deviceStatus === DeviceStatus.CONNECTING && err.message === BBLR_ERROR_REPLY_TIMEOUT) {
                            firstPing();
                        }
                    }
                );
            }
            firstPing();
            // поможет обойти баг на старых загрузчиках ChipKIT Uno32
            // (если перепрошить нет возможности)
            // см: http://chipkit.net/forum/viewtopic.php?f=19&t=3731&p=15573#p15573
            //setTimeout(firstPing, 5000);
        });

        // пришли данные
        port.on('data', function(data) {
            // известим подписавшихся
            this.emit(BabblerEvent.DATA, data, DataFlow.IN);
            
            // ожидаем строку в формате JSON вида
            // {"cmd": "cmd_name", "id": "cmd_id", "reply": "reply_value"}
            var cmdReply = null;
            try {
                // парсим строку в объект
                cmdReply = JSON.parse(data);
            } catch(e) {
                // известим подписавшихся об ошибке
                this.emit(BabblerEvent.DATA_ERROR, data, DataFlow.IN, e)
            }
            
            if(cmdReply != null) {
                // найдем колбэк по id отправленной команды
                for(var i in cmdReplyCallbackQueue) {
                    var callback = cmdReplyCallbackQueue[i];
                    if(callback.id == cmdReply.id) {
                        // колбэк нашелся
                        
                        // значит устройство во-время прислало корректные данные
                        // в ответ на отправленный запрос:
                        // снимем флаг таймаута, пока без события
                        _deviceTimeoutFlag = false;
                        
                        // убираем из очереди
                        cmdReplyCallbackQueue.splice(i, 1);
                        // отправим ответ тому, кто вопрошал
                        if(callback.onReply != undefined) {
                            callback.onReply(callback.cmd, callback.id, cmdReply.reply);
                        }
                        break;
                    }
                }
            }
        }.bind(this));
        
        // отключили устройство (выдернули провод)
        port.on('disconnect', function () {
            _disconnect("Device unplugged");
        });

        // 
        // Действия
        //

        // открываем порт
        port.open(function(err) {
            if(err) {
                // не получилось открыть порт
                
                // обновим статус
                _setDeviceStatus(DeviceStatus.DISCONNECTED, err);
            }
        });
    }
    
    /**
     * Отключиться от устройства
     * @emits module:babbler-js#data_error
     */
    var _disconnect = function (err) {
        // сначала сообщаем всем, чтобы 
        // больше не дергали устройство
        _setDeviceStatus(DeviceStatus.DISCONNECTED, err);
        
        // дальше спокойно зачищаем ресурсы
        
        // останавливаем все таймеры
        if(validateIntId != undefined) {
            clearInterval(validateIntId);
            validateIntId = undefined;
        }
        if(dequeueIntId != undefined) {
            clearInterval(dequeueIntId);
            dequeueIntId = undefined;
        }
        if(checkAliveIntId != undefined) {
            clearInterval(checkAliveIntId);
            checkAliveIntId = undefined;
        }
        
        // ожидающие ответа - возвращаем ошибки
        for(var i in cmdReplyCallbackQueue) {
            var callback = cmdReplyCallbackQueue[i];
            // извещаем отправившего команду
            callback.onError(callback.cmd, new Error(BBLR_ERROR_DISCONNECTED_AFTER));
            // остальных тоже известим, что ответа не дождемся
            this.emit(
               BabblerEvent.DATA_ERROR, 
               JSON.stringify({cmd: callback.cmd, id: callback.id, params: callback.params}), 
               DataFlow.IN,
               new Error(BBLR_ERROR_DISCONNECTED_AFTER));
        }
        cmdReplyCallbackQueue = [];
        
        // обнуляем команды в очереди на отправку -
        // возвращаем ошибки
        for(var i in cmdQueue) {
            var cmd = cmdQueue[i];
            // извещаем отправившего команду
            cmd.onError(cmd.cmd, new Error(BBLR_ERROR_DISCONNECTED_BEFORE));
            // остальных тоже известим, что команда так и не ушла из очереди
            this.emit(
               BabblerEvent.DATA_ERROR, 
               JSON.stringify({cmd: cmd.cmd, params: cmd.params}), 
               DataFlow.QUEUE,
               new Error(BBLR_ERROR_DISCONNECTED_BEFORE));
        }
        cmdQueue = [];
        
        // закрываем порт
        if(port != undefined && !port.paused) {
            port.close(function(err) {
                // ошибки ловим, но игнорируем
                //console.log(err);
            });
        }
        port = undefined;
    }.bind(this);
    
    /**
     * Отключиться от устройства.
     */
    this.disconnect = _disconnect;
    
    /**
     * Отправить команду на устройство.
     * @param {function} onReply(cmd, id, reply)
     * @param {function} onError(cmd, err)
     * @emits module:babbler-js#data
     * @emits module:babbler-js#data_error
     */
    var _writeCmd = function(cmd, params, onReply, onError) {
        // отправляем команду напрямую на устройство
        if(port != undefined && !port.paused) {
            cmdId++;
            // добавим колбэк на получение ответа в очередь
            cmdReplyCallbackQueue.push({
                cmd: cmd,
                id: cmdId.toString(),
                timestamp: Date.now(),
                params: params,
                onReply: onReply,
                onError: onError
            });
                        
            // пишем данные здесь, результат получаем в колбэке на событие data
            var data = JSON.stringify({
                cmd: cmd,
                id: cmdId.toString(),
                    params: params
            });
            port.write(data,
                function(err) {
                    if(!err) {
                        // данные ушли ок
                        this.emit(BabblerEvent.DATA, data, DataFlow.OUT);
                    } else {
                        // ошибка записи в порт 
                        // (например, порт открыт, но не хватает прав на запись)
                        this.emit(
                           BabblerEvent.DATA_ERROR, 
                           data, DataFlow.OUT, 
                           new Error(BBLR_ERROR_WRITING_TO_PORT + ": " + err));
                        // отключаемся
                        _disconnect(BBLR_ERROR_WRITING_TO_PORT + ": " + err);
                        // персональная ошибка в onError прилетит из _disconnect
                        //onError(cmd, new Error("Error writing to port: " + err));
                    }
                }.bind(this)
            );
        } else {
            // порт вообще-то не открыт или устройство отключено
            // (вообще, это не должно произойти, т.к. мы ловим событие port 'disconnect')
            this.emit(BabblerEvent.DATA_ERROR, data, DataFlow.OUT, new Error(BBLR_ERROR_NOT_CONNECTED));
            // отключаемся
            _disconnect(BBLR_ERROR_NOT_CONNECTED);
            // персональная ошибка в onError прилетит из _disconnect
            //onError(cmd, new Error("Device not connected"));
        }
    }.bind(this);
    
    /**
     * Добавить команду в очередь на отправку на устройство.
     * @emits module:babbler-js#data
     * @emits module:babbler-js#data_error
     */
    var _queueCmd = function(cmd, params, onReply, onError) {
        // не добавляем новые команды, если не подключены к устройству
        if(_deviceStatus === DeviceStatus.CONNECTED) {
            cmdQueue.push({
                cmd: cmd,
                params: params,
                onReply: onReply,
                onError: onError
            });
            // добавили пакет в очередь
            this.emit(BabblerEvent.DATA, JSON.stringify({cmd: cmd, params: params}), DataFlow.QUEUE);
        } else {
            onError(cmd, new Error(BBLR_ERROR_NOT_CONNECTED));
            // пакет не добавляется в очередь
            this.emit(
                BabblerEvent.DATA_ERROR, 
                JSON.stringify({cmd: cmd, params: params}), 
                DataFlow.QUEUE,
                new Error(BBLR_ERROR_NOT_CONNECTED));
        }
    }
    
    /**
     * Извлечь команду из очереди на отправку на устройство
     * и отправить на устройство.
     */
    var _dequeueCmd = function() {
        // для информации:
        // мы сюда попадем только в том случае, если статус === connected,
        // в других случаях, во-первых не попадем, во-вторых, очередь на отправку
        // все равно будет пуста:
        // 1) таймер для _dequeueCmd запускается только после подключения
        // 2) даже если бы таймер работал все время, в момент подключения
        // список команд пуст (до этого момента их нельзя добавлять - не сработает
        // _queueCmd, а все старые команды вычищаются с ошибкой вызовом disconnect)
        
        // Отправляем новую команду только если другая команда не ожидает ответа.
        // Если устройство по какой-то причине не прислало ответ (или присланный 
        // ответ некорректен - не распарсился или не совпал id команды или типа того),
        // очередь ожидания будет очищена через BBLR_REPLY_TIMEOUT_MILLIS (5 секунд)
        // с ошибкой BBLR_ERROR_REPLY_TIMEOUT. Т.е. вечного зависания из-за некорректного
        // поведения устройства не произойдет, при этом очередь ожидающих ответа колбэков
        // cmdReplyCallbackQueue будет содержать не более одного элемента
        // (на самом деле, если отправлять команды одну за одной, не дожидаясь ответа, 
        // дополнительные команды из списка с большой долей вероятности не получат
        // ответ во-время и будут завершаться неудачей плохо предсказуемым образом).
        
        // TODO: Побочный эффект - очередь команд на отправку будет наполняться большим
        // количеством элементов, которые не будут удаляться по таймауту, с этим нужно 
        // тоже что-то делать.
        if(cmdReplyCallbackQueue.length == 0) {
            var cmd = cmdQueue.shift();
            if(cmd != undefined) {
                _writeCmd(cmd.cmd, cmd.params, cmd.onReply, cmd.onError);
            }
        }
    }
    
    /**
     * Выполнить команду на устройстве. 
     * Параметры: cmd, params, onReply, onError.
     *
     * Команда сначала добавляется во внутреннюю очередь отправки,
     * потом отправляется на устройство. Ответ приходит в колбэк onReply.
     * Если команда отправлена, но ответ не получен дольше, чем установленный
     * таймаут BBLR_REPLY_TIMEOUT_MILLIS (5 секунд), команда считается не выполненной,
     * вызывается колбэк onError со статусом "timeout".
     * 
     * @param {string} cmd - имя команды, строка
     * @param {array} params - параметры, массив строк
     * @param {function} onReply - колбэк на приход ответа
     *     параметры: cmd, id, reply
     * @param {function} onError - колбэк на ошибку (команда не отправлена или ответ не пришел 
     *         в установленное время)
     *     параметры: cmd, err
     *     
     */
    this.sendCmd = _queueCmd;
    
    ///////////////////////////////////////////
    // Статус устройства на публику
    
    /** 
     * Имя устройства, к которому были последний раз 
     * подключены или пытались подключиться.
     */
    this.deviceName = function() {
        return _deviceName;
    }
    
    /**
     * Текущий статус устройства: не подключено, подключаемся, подключено.
     */
    this.deviceStatus = function() {
        return _deviceStatus;
    }
    
    /**
     * Ошибка устройства (почему не получилось подключиться), если есть.
     */
    this.deviceError = function() {
        return _deviceError;
    }
    
    /** 
     * Флаг таймаута: 
     * true: устройство подключено, но не прислало ответ 
     *     на последнюю команду вовремя
     * false: устройство подключено, ответ на последнюю 
     *     команду пришел во время 
     */
    this.deviceTimeoutFlag = function() {
        return _deviceTimeout;
    }
}

// наследуем BabblerDevice от EventEmitter, чтобы
// генерировать события красиво
inherits(BabblerDevice, EventEmitter);

/** События */
BabblerDevice.Event = BabblerEvent;

// Перечисления и константы для публики
/** Статусы устройства: отключено, подключаемся, подключено */
BabblerDevice.Status = DeviceStatus;

/** Направление потока данных */
BabblerDevice.DataFlow = DataFlow;


// отправляем компонент на публику
module.exports = BabblerDevice;

