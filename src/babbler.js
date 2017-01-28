
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

/** 
 * События, на которые можно подписываться через интерфейс EventListener:
 *     BabblerDevice.on(event, callback);
 */
const BabblerEvent = {
    /** 
     * Смена статуса подключения устройства: 
     *     disconnected -> connecting -> connected 
     */
    STATUS: "status",
    /** Устройство отключилось */
    DISCONNECTED: DeviceStatus.DISCONNECTED,
    /** Устройство начало подключаться */
    CONNECTING: DeviceStatus.CONNECTING,
    /** Устройство подключилось */
    CONNECTED: DeviceStatus.CONNECTED,
    /** Отправка или получение данных */
    DATA: "data",
    /** Проблема при отправке или получении данных */
    DATA_ERROR: "data_error",
    /** Очередь команд переполнена */
    QUEUE_FULL: "queue_full",
    /** 
     * Очередь команд опять готова принимать команды после того,
     * как была переполнена 
     */
    QUEUE_READY: "queue_ready"
}

// Ошибки по рекомендациям Мозилы
// https://developer.mozilla.org/ru/docs/Web/JavaScript/Reference/Global_Objects/Error

/** Ошибка команды: таймаут */
const BBLR_ERROR_REPLY_TIMEOUT = "Reply timeout";
function BblrReplyTimeoutError(message) {
  this.name = 'BblrReplyTimeoutError';
  this.message = message || BBLR_ERROR_REPLY_TIMEOUT;
  this.stack = (new Error()).stack;
}
BblrReplyTimeoutError.prototype = Object.create(Error.prototype);
BblrReplyTimeoutError.prototype.constructor = BblrReplyTimeoutError;

/** Ошибка команды: устройство отключено до отпавки */
const BBLR_ERROR_DISCONNECTED_BEFORE = "Device disconnected before cmd was sent";
function BblrDisconnectedBeforeError(message) {
  this.name = 'BblrDisconnectedBeforeError';
  this.message = message || BBLR_ERROR_DISCONNECTED_BEFORE;
  this.stack = (new Error()).stack;
}
BblrDisconnectedBeforeError.prototype = Object.create(Error.prototype);
BblrDisconnectedBeforeError.prototype.constructor = BblrDisconnectedBeforeError;

/** Ошибка команды: устройство отключено после отпавки */
const BBLR_ERROR_DISCONNECTED_AFTER = "Device disconnected after cmd was sent";
function BblrDisconnectedAfterError(message) {
  this.name = 'BblrDisconnectedAfterError';
  this.message = message || BBLR_ERROR_DISCONNECTED_AFTER;
  this.stack = (new Error()).stack;
}
BblrDisconnectedAfterError.prototype = Object.create(Error.prototype);
BblrDisconnectedAfterError.prototype.constructor = BblrDisconnectedAfterError;

/** Ошибка команды: устройство не подключено */
const BBLR_ERROR_NOT_CONNECTED = "Device not connected"
function BblrNotConnectedError(message) {
  this.name = 'BblrNotConnectedError';
  this.message = message || BBLR_ERROR_NOT_CONNECTED;
  this.stack = (new Error()).stack;
}
BblrNotConnectedError.prototype = Object.create(Error.prototype);
BblrNotConnectedError.prototype.constructor = BblrNotConnectedError;

/** Ошибка команды: ошибка записи в порт */
const BBLR_ERROR_WRITING_TO_PORT = "Error writing to port"
function BblrPortWriteError(message) {
  this.name = 'BblrPortWriteError';
  this.message = message || BBLR_ERROR_WRITING_TO_PORT;
  this.stack = (new Error()).stack;
}
BblrPortWriteError.prototype = Object.create(Error.prototype);
BblrPortWriteError.prototype.constructor = BblrPortWriteError;

/** Ошибка команды: очередь команд переполнена */
const BBLR_ERROR_QUEUE_FULL = "Queue full"
function BblrQueueFullError(message) {
  this.name = 'BblrQueueFullError';
  this.message = message || BBLR_ERROR_QUEUE_FULL;
  this.stack = (new Error()).stack;
}
BblrQueueFullError.prototype = Object.create(Error.prototype);
BblrQueueFullError.prototype.constructor = BblrQueueFullError;

/** Ошибка команды: отменена до отправки на устройство */
const BBLR_ERROR_DISCARDED = "Discarded"
function BblrDiscardedError(message) {
  this.name = 'BblrDiscardedError';
  this.message = message || BBLR_ERROR_DISCARDED;
  this.stack = (new Error()).stack;
}
BblrDiscardedError.prototype = Object.create(Error.prototype);
BblrDiscardedError.prototype.constructor = BblrDiscardedError;


/** Неправильное имя порта устройства */
const BBLR_ERROR_INVALID_PORT_NAME = "Invalid port name"
function BblrInvalidPortNameError(message) {
  this.name = 'BblrInvalidPortNameError';
  this.message = message || BBLR_ERROR_INVALID_PORT_NAME;
  this.stack = (new Error()).stack;
}
BblrInvalidPortNameError.prototype = Object.create(Error.prototype);
BblrInvalidPortNameError.prototype.constructor = BblrInvalidPortNameError;

/** Команда ping */
const BBLR_CMD_PING = "ping";


/**
 * Обратный вызов, вызывается при смене статуса подключения к устройству.
 * @typedef {function} statusChangeCallback
 * @param {string} status - статус подключения DeviceStatus: 
 *     'disconnected', 'connecting', 'connected'
 */
 
/**
 * Обратный вызов, вызывается при разрыве связи с устройством.
 * @typedef {function} disconnectedCallback
 * @param {?error} err - причина отключения
 */
 
/**
 * Обратный вызов, вызывается при начале процесса подключения к устройству.
 * @typedef {function} connectingCallback
 */
 
/**
 * Обратный вызов, вызывается при успешном подключении к устройству.
 * @typedef {function} connectedCallback
 */
 
/**
 * Обратный вызов, вызывается при успешном выполнении команды - получении
 * корректного ответа от устройства или при неудачной попытке выполнения команды:
 * команда не отправлена, команда отправлена, но корректный ответ не получен
 * в установленное время, связь с устройством оборвалась до получения ответа и т.п.
 * 
 * @typedef {function} cmdResultCallback
 * @param {?error} err - ошибка или undefined, если пришел ответ
 *   Варианты ошибок:
 *     BblrReplyTimeoutError: ответ не получен вовремя. 
 *         Возможные причины:
 *         - устройство не отправило ответ,
 *         - устройство не успело отправить ответ вовремя,
 *         - ответ по какой-то причине повредился при отправке/приеме.
 *     BblrDisconnectedBeforeError: устройство отключено до отпавки
 *     BblrDisconnectedAfterError: устройство отключено после отпавки
 *     BblrNotConnectedError: устройство не подключено
 *     BblrPortWriteError: ошибка записи в порт
 *     BblrQueueFullError: очередь команд переполнена
 *     BblrDiscardedError: команда отменена до отправки на устройство
 *     
 * @param {string} reply - ответ на команду от устройства (undefined, если ошибка)
 * @param {string} cmd - имя исходной команды
 * @param {array} params - исходные параметры, массив строк
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
 * @param {?error} err - информация об ошибке.
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
 * Информация о команде, добавленной в очередь на отправку.
 * @typedef {Object} cmdInfo
 * @property {string} cmd - имя команды
 * @property {array} params - параметры, массив строк
 * @property {module:babbler-js~cmdResultCallback=} onResult - обратный вызов
 *     на приход ответа или ошибку команды
 */
 
/**
 * Информация об обратном вызове для отправленной команды, ожидающей ответа от устройства.
 * @typedef {Object} cmdCallbackInfo
 * @property {string} cmd - имя команды
 * @property {array} params - параметры, массив строк
 * @property {string} id - внутренний идентификатор отправленной команды
 * @property {number} timestamp - временная метка на момент отправки
 * @property {module:babbler-js~cmdResultCallback=} onResult - обратный вызов
 *     на приход ответа или ошибку команды
 */
 

/** Устройство - последовательный порт */
function BabblerSerialDevice(name, options) {
    // обертка вокруг SerialPort
    
    // https://github.com/EmergingTechnologyAdvisors/node-serialport#usage
    var SerialPort = require('serialport');
    
    // скорость подключения из настроек или по умолчанию 9600
    var baudRate = (options != undefined && typeof options.baudRate === 'number') ? 
        options.baudRate : 9600;

    var port = new SerialPort(name, {
        // скорость
        baudRate:  baudRate,
        // получать данные по одной строке
        parser: SerialPort.parsers.readline('\n'),
        // не открывать порт сразу здесь
        autoOpen: false,
        lock: true
    });
    
    /** Устройство готово получать данные */
    this.ready = function() {
        return !port.paused;
    }
    
    // EventEmitter.on
    this.on = function(event, callback) {
        port.on(event, callback);
    }
    
    // SerialPort.open
    this.open = function(callback) {
        port.open(callback);
    }
    
    // SerialPort.close
    this.close = function(callback) {
        port.close(callback);
    }
    
    // SerialPort.write
    this.write = function(data, callback) {
        port.write(data, callback);
    }
}


/** Устройство - заглушка-симуляция для тестов **/
function BabblerFakeDevice(name, options) {
    var portName = name;
    var portOptions = options;
    
    var opened = false;

    /** Устройство готово получать данные */
    this.ready = function() {
        return opened;
    }
    
    // SerialPort.open
    this.open = function(callback) {
        if(portName === "/dev/ttyUSB0") {
            opened = true;
            callback();
            this.emit('open');
        } else {
            callback(new Error("Dev not found: " + portName));
        }
    }
    
    // SerialPort.close
    this.close = function(callback) {
        opened = false;
        callback();
        this.emit('disconnect');
    }
    
    // SerialPort.write
    this.write = function(data, callback) {
        if(!opened) {
            callback(new Error("Dev not opened"));
        } else {
            // парсим строку в объект
            cmd = JSON.parse(data);
            
            var reply = "dontunderstand";
            if(cmd.cmd === "ping") {
                reply = "ok";
            } else if(cmd.cmd === "help") {
                reply = "ping help";
            }
            
            var replyPack = JSON.stringify({
                id: cmd.id.toString(),
                cmd: cmd.cmd,
                params: cmd.params,
                reply: reply
            });
            
            var delay = 200;
            // типа немного поработали перед тем, как
            // отправить ответ
            setTimeout(function() {
                this.emit('data', replyPack);
            }.bind(this), delay);
        }
    }
}
inherits(BabblerFakeDevice, EventEmitter);


/**
 * Создать экземпляр устройства - плата с прошивкой на основе библиотеки babbler_h.
 * Варианты подключений:
 * - последовательный порт,
 * - заглушка-симуляция для тестов.
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
    
    /** Статус подключения к устройству */
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
    /** Устройство */
    var dev = undefined;
    
    /** 
     * Очередь команд на отправку 
     * {module:babbler-js~cmdInfo}
     */
    var cmdQueue = [];
    
    /** 
     * Максимальное количество элементов в очереди
     * команд, 0 - без ограничения
     */
    var _queueLimit = 5;
    
    /**
     * Очередь колбэков для ответов на отправленные команды
     * (по-хорошему, там всегда будет максимум один элемент, если контроллер отвечает
     * достаточно быстро)
     * {module:babbler-js~cmdCallbackInfo}
     */
    var cmdResultCallbackQueue = [];
    
    /** Счетчик для генерации идентификаторов отправляемых команд */
    var cmdId = 0;
    
    // Идентификаторы таймеров регулярных задач, чтобы можно было остановить.
    
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
        for(var i in cmdResultCallbackQueue) {
            var callbackInfo = cmdResultCallbackQueue[i];
            if(Date.now() - callbackInfo.timestamp > BBLR_REPLY_TIMEOUT_MILLIS) {
                toRemove.push(callbackInfo);
            }
        }
        for(var i in toRemove) {
            var callbackInfo = toRemove[i];
            cmdResultCallbackQueue.splice(cmdResultCallbackQueue.indexOf(callbackInfo), 1);
            // известим отправившего команду
            callbackInfo.onResult(new BblrReplyTimeoutError(), undefined, callbackInfo.cmd, callbackInfo.params);
            // остальных тоже известим, что ответа не дождались
            this.emit(
                BabblerEvent.DATA_ERROR,
                JSON.stringify({cmd: callbackInfo.cmd, params: callbackInfo.params, id: callbackInfo.id}),
                DataFlow.IN,
                new BblrReplyTimeoutError()
             );
            // выставим флаг таймаута, пока без события
            _deviceTimeoutFlag = true;
        }
    }.bind(this);
    
    /**
     * Проверить, живо ли устройство: если ответило на ping вовремя, значит живо,
     * иначе не живо - отключаемся.
     */
    var _checkDeviceAlive = function() {
        _queueCmd(/*cmd*/ BBLR_CMD_PING, /*params*/ [],
            // onResult
            function(err, reply, cmd, params) {
                if(err) {
                    _disconnect(err);
                } else {
                    // как минимум для последовательного порта
                    // здесь это делать не обязательно, т.к.
                    // статус "включено" отлавливается в 
                    // процессе подключения самого порта
                    //_setDeviceStatus(DeviceStatus.CONNECTED);
                }
            }
        );
    }
    
    /**
     * Установить статус устройства: отключено, подключено, подключаемся
     * (disconnected, connected, connecting).
     * @emits module:babbler-js#status
     * @emits module:babbler-js#disconnected
     * @emits module:babbler-js#connecting
     * @emits module:babbler-js#connected
     */
    var _setDeviceStatus = function(status, error) {
        _deviceError = error;
        if(_deviceStatus != status) {
            _deviceStatus = status;
            
            // известим слушателей о смене статуса вообще
            this.emit(BabblerEvent.STATUS, status);
            
            // и по каждому статусу в отдельности
            if(status === DeviceStatus.DISCONNECTED) {
                this.emit(BabblerEvent.DISCONNECTED, error);
            } else if(status === DeviceStatus.CONNECTING) {
                this.emit(BabblerEvent.CONNECTING);
            } else if(status === DeviceStatus.CONNECTED) {
                this.emit(BabblerEvent.CONNECTED);
            }
        }
    }.bind(this);
    

    /**
     * Подключаемся к устройству на последовательном порте.
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
            _setDeviceStatus(DeviceStatus.DISCONNECTED, 
                new BblrInvalidPortNameError(BBLR_ERROR_INVALID_PORT_NAME + ": '" + portName + "'"));
            return;
        }
        
        // Выбор устройства по префиксу portName
        if(portName.startsWith("test:")) {
            if(options != undefined && options.dev != undefined) {
                dev = options.dev;
            } else {
                dev = new BabblerFakeDevice(portName.substring("test:".length), options);
            }
        } else if(portName.startsWith("serial:")) {
            dev = new BabblerSerialDevice(portName.substring("serial:".length), options);
        } else {
            dev = new BabblerSerialDevice(portName, options);
        }
        
        // 
        // События
        // 

        // устройство открылось для общения
        dev.on('open', function () {
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
                    // onResult
                    function(err, reply, cmd, params) {
                        if(err) {
                            // превышено время ожидаения ответа - пробуем еще раз до
                            // тех пор, пока не подключимся или не отменим попытки
                            if(_deviceStatus === DeviceStatus.CONNECTING && err instanceof BblrReplyTimeoutError) {
                                firstPing();
                            }
                        } else {
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
        dev.on('data', function(data) {
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
                for(var i in cmdResultCallbackQueue) {
                    var callbackInfo = cmdResultCallbackQueue[i];
                    if(callbackInfo.id == cmdReply.id) {
                        // колбэк нашелся
                        
                        // значит устройство вовремя прислало корректные данные
                        // в ответ на отправленный запрос:
                        // снимем флаг таймаута, пока без события
                        _deviceTimeoutFlag = false;
                        
                        // убираем из очереди
                        cmdResultCallbackQueue.splice(i, 1);
                        // отправим ответ тому, кто вопрошал
                        if(callbackInfo.onResult != undefined) {
                            callbackInfo.onResult(undefined, cmdReply.reply, callbackInfo.cmd, callbackInfo.params);
                        }
                        break;
                    }
                }
            }
        }.bind(this));
        
        // отключили устройство (выдернули провод)
        dev.on('disconnect', function () {
            _disconnect(new Error("Device unplugged"));
        });

        // 
        // Действия
        //

        // открываем порт
        dev.open(function(err) {
            if(err) {
                // не получилось открыть порт
                
                // обновим статус
                _setDeviceStatus(DeviceStatus.DISCONNECTED, err);
            }
        });
    }
    
    /**
     * Отключиться от устройства
     * @param {?error} err - ошибка - причина отключения (необязательно)
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
        for(var i in cmdResultCallbackQueue) {
            var callbackInfo = cmdResultCallbackQueue[i];
            // извещаем отправившего команду
            callbackInfo.onResult(new BblrDisconnectedAfterError(), undefined, callbackInfo.cmd, callbackInfo.params);
            // остальных тоже известим, что ответа не дождемся
            this.emit(
               BabblerEvent.DATA_ERROR, 
               JSON.stringify({cmd: callbackInfo.cmd, params: callbackInfo.params, id: callbackInfo.id}), 
               DataFlow.IN,
               new BblrDisconnectedAfterError());
        }
        cmdResultCallbackQueue = [];
        
        // обнуляем команды в очереди на отправку -
        // возвращаем ошибки
        for(var i in cmdQueue) {
            var cmdInfo = cmdQueue[i];
            // извещаем отправившего команду
            cmdInfo.onResult(new BblrDisconnectedBeforeError(), undefined, cmdInfo.cmd, cmdInfo.params);
            // остальных тоже известим, что команда так и не ушла из очереди
            this.emit(
               BabblerEvent.DATA_ERROR, 
               JSON.stringify({cmd: cmdInfo.cmd, params: cmdInfo.params}), 
               DataFlow.QUEUE,
               new BblrDisconnectedBeforeError());
        }
        cmdQueue = [];
        
        // закрываем порт
        if(dev != undefined && dev.ready()) {
            dev.close(function(err) {
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
     * @param {module:babbler-js~cmdResultCallback=} onResult
     * @emits module:babbler-js#data
     * @emits module:babbler-js#data_error
     */
    var _writeCmd = function(cmd, params, onResult) {
        // отправляем команду напрямую на устройство
        if(dev != undefined && dev.ready()) {
            cmdId++;
            // добавим колбэк на получение ответа в очередь
            cmdResultCallbackQueue.push({
                cmd: cmd,
                params: params,
                id: cmdId.toString(),
                timestamp: Date.now(),
                onResult: onResult
            });
                        
            // пишем данные здесь, результат получаем в колбэке на событие data
            var data = JSON.stringify({
                cmd: cmd,
                params: params,
                id: cmdId.toString()
            });
            dev.write(data,
                function(err) {
                    if(!err) {
                        // данные ушли ок
                        this.emit(BabblerEvent.DATA, data, DataFlow.OUT);
                    } else {
                        // ошибка записи в порт 
                        // (например, порт открыт, но не хватает прав на запись)
                        this.emit(
                            BabblerEvent.DATA_ERROR, 
                            data, 
                            DataFlow.OUT, 
                            new BblrPortWriteError(BBLR_ERROR_WRITING_TO_PORT + ": " + err));
                        // отключаемся
                        _disconnect(new BblrPortWriteError(BBLR_ERROR_WRITING_TO_PORT + ": " + err));
                        // персональная ошибка в onResult прилетит из _disconnect
                        //onResult(new BblrPortWriteError(BBLR_ERROR_WRITING_TO_PORT + ": " + err), undefined, cmd, params);
                    }
                }.bind(this)
            );
        } else {
            // порт вообще-то не открыт или устройство отключено
            // (вообще, это не должно произойти, т.к. мы ловим событие dev 'disconnect')
            this.emit(BabblerEvent.DATA_ERROR, data, DataFlow.OUT, new BblrNotConnectedError());
            // отключаемся
            _disconnect(new BblrNotConnectedError());
            // персональная ошибка в onResult прилетит из _disconnect
            //onResult(new BblrNotConnectedError(), undefined, cmd, params);
        }
    }.bind(this);
    
    /**
     * Добавить команду в очередь на отправку на устройство.
     * @param {string} cmd - имя команды
     * @param {array} params - параметры, массив строк
     * @param {module:babbler-js~cmdResultCallback=} onResult - обратный вызов 
     *     на приход ответа или ошибку команды
     * @emits module:babbler-js#data
     * @emits module:babbler-js#data_error
     */
    var _queueCmd = function(cmd, params, onResult) {
        // не добавляем новые команды, если не подключены к устройству
        if(_deviceStatus === DeviceStatus.CONNECTED) {
            if(_queueLimit > 0 && cmdQueue.length >= _queueLimit) {
                // пакет не добавляется в очередь
                onResult(new BblrQueueFullError(), undefined, cmd, params);
                this.emit(
                    BabblerEvent.DATA_ERROR, 
                    JSON.stringify({cmd: cmd, params: params}), 
                    DataFlow.QUEUE,
                    new BblrQueueFullError());
            } else {
                // добавили пакет в очередь
                cmdQueue.push({
                    cmd: cmd,
                    params: params,
                    onResult: onResult
                });
                this.emit(BabblerEvent.DATA, JSON.stringify({cmd: cmd, params: params}), DataFlow.QUEUE);
                
                if(_queueLimit > 0 && cmdQueue.length == _queueLimit) {
                    // заполнили очередь под завязку
                    this.emit(BabblerEvent.QUEUE_FULL);
                }
            }
        } else {
            // пакет не добавляется в очередь
            onResult(new BblrNotConnectedError(), undefined, cmd, params);
            this.emit(
                BabblerEvent.DATA_ERROR, 
                JSON.stringify({cmd: cmd, params: params}), 
                DataFlow.QUEUE,
                new BblrNotConnectedError());
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
        
        // Отправляем новую команду только, если другая команда не ожидает ответа.
        // Если устройство по какой-то причине не прислало ответ (или присланный 
        // ответ некорректен - не распарсился или не совпал id команды или типа того),
        // очередь ожидания будет очищена через BBLR_REPLY_TIMEOUT_MILLIS (5 секунд)
        // с ошибкой BblrReplyTimeoutError. Т.е. вечного зависания из-за некорректного
        // поведения устройства не произойдет, при этом очередь ожидающих ответа колбэков
        // cmdResultCallbackQueue будет содержать не более одного элемента
        // (на самом деле, если отправлять команды одну за одной, не дожидаясь ответа, 
        // дополнительные команды из списка с большой долей вероятности не получат
        // ответ вовремя и будут завершаться неудачей плохо предсказуемым образом).
        
        // Побочный эффект - очередь команд на отправку будет наполняться большим
        // количеством элементов, которые не будут удаляться по таймауту.
        // Чтобы их не накапливалось слишком много, следует устанавливать значение
        // максимального количества элементов в очереди queueLimit. При переполнении
        // очереди новые команды не будут добавляться с ошибкой (в интерфейсе пользователя
        // при этом следует сделать элементы управления неактивными). В нормальной ситуации
        // такого происходить не должно: робот должно достаточно быстро выполнять команды
        // и отправлять ответы.
        if(cmdResultCallbackQueue.length == 0) {
            // запомним, была ли очередь переполнена
            var queueWasFull = !this.queueReady;
            
            // извлекаем команду из очереди
            var cmd = cmdQueue.shift();
            if(cmd != undefined) {
                _writeCmd(cmd.cmd, cmd.params, cmd.onResult);
                
                if(queueWasFull) {
                    // очередь была заполнена, а теперь освободилась
                    this.emit(BabblerEvent.QUEUE_READY);
                }
            }
        }
    }.bind(this);
    
    /**
     * Выполнить команду на устройстве.
     *
     * Команда сначала добавляется во внутреннюю очередь отправки,
     * потом отправляется на устройство. Ответ приходит в колбэк onResult.
     * Если команда отправлена, но ответ не получен дольше, чем установленный
     * таймаут BBLR_REPLY_TIMEOUT_MILLIS (5 секунд), команда считается не выполненной,
     * вызывается колбэк onResult с ошибкой "timeout".
     * 
     * @param {string} cmd - имя команды
     * @param {array} params - параметры, массив строк
     * @param {module:babbler-js~cmdResultCallback=} onResult - обратный вызов 
     *     на приход ответа или ошибку команды
     * 
     * @emits module:babbler-js#data
     * @emits module:babbler-js#data_error
     */
    this.sendCmd = _queueCmd;
    
    ///////////////////////////////////////////
    // Статус устройства на публику
    
    Object.defineProperties(this, {
        /** 
         * Имя устройства, к которому были последний раз 
         * подключены или пытались подключиться.
         */
        deviceName: {
            get: function() {
                return _deviceName;
            }
        },
        
        /**
         * Текущий статус устройства: не подключено, подключаемся, подключено
         * (disconnected, connecting, connected).
         */
        deviceStatus: {
            get: function() {
                return _deviceStatus;
            }
        },
        
        /**
         * Ошибка устройства (почему не получилось подключиться), если есть.
         */
        deviceError: {
            get: function() {
                return _deviceError;
            }
        },
        
        /** 
         * Флаг таймаута: 
         * true: устройство подключено, но не прислало ответ 
         *     на последнюю команду вовремя
         * false: устройство подключено, ответ на последнюю 
         *     команду пришел вовремя 
         */
        deviceTimeoutFlag: {
            get: function() {
                return _deviceTimeoutFlag;
            }
        }
    });
    
    ///////////////////////////////////////////
    // Управление очередью команд
    
    Object.defineProperties(this, {
        /** 
         * Максимальное количество элементов в очереди
         * команд, 0 - без ограничения
         */
        queueLimit: {
            get: function() {
                return _queueLimit;
            },
            set: function(limit) {
                _queueLimit = limit >= 0 ? limit : 0;
                
                if(this.queueReady) {
                    this.emit(BabblerEvent.QUEUE_READY);
                } else {
                    this.emit(BabblerEvent.QUEUE_FULL);
                }
            }
        },
        
        /**
         * Количество команд в очереди на отправку.
         */
        queueLength: {
            get: function() {
                return cmdQueue.length;
            }
        },
        
        /**
         * Готова ли очередь принимать новые команды:
         * true - очередь готова принимать команды (количество команд в очереди
         *     меньше, чем значение queueLimit, или размер очереди не ограничен)
         * false - очередь переполнена (не готова принимать новые команды:
         *     количество команд в очереди больше или равно queueLimit).
         */
        queueReady: {
            get: function() {
                // _queueLimit == 0: размер очереди не ограничен
                return (_queueLimit == 0 || cmdQueue.length < _queueLimit);
            }
        }
    });
    
    /**
     * Очисить очередь команд - отменить все команды, которые не были
     * отправлены на устройство. Каждая команда ошибку BblrDiscardedError.
     */
    this.discardQueue = function() {
        // сначала запомним, была ли очередь переполнена
        var queueWasFull = !this.queueReady;
    
        // обнуляем команды в очереди на отправку -
        // возвращаем ошибки
        for(var i in cmdQueue) {
            var cmdInfo = cmdQueue[i];
            // извещаем отправившего команду
            cmdInfo.onResult(new BblrDiscardedError(), undefined, cmdInfo.cmd, cmdInfo.params);
            // остальных тоже известим, что команда так и не ушла из очереди
            this.emit(
               BabblerEvent.DATA_ERROR, 
               JSON.stringify({cmd: cmdInfo.cmd, params: cmdInfo.params}), 
               DataFlow.QUEUE,
               new BblrDiscardedError());
        }
        cmdQueue = [];
        
        if(queueWasFull) {
            // очередь была заполнена, а теперь освободилась
            this.emit(BabblerEvent.QUEUE_READY);
        }
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

/** Ошибки Error */
BabblerDevice.BblrReplyTimeoutError = BblrReplyTimeoutError;
BabblerDevice.BblrDisconnectedBeforeError = BblrDisconnectedBeforeError;
BabblerDevice.BblrDisconnectedAfterError = BblrDisconnectedAfterError;
BabblerDevice.BblrNotConnectedError = BblrNotConnectedError;
BabblerDevice.BblrPortWriteError = BblrPortWriteError;
BabblerDevice.BblrQueueFullError = BblrQueueFullError;
BabblerDevice.BblrDiscardedError = BblrDiscardedError;


// отправляем компонент на публику
module.exports = BabblerDevice;

