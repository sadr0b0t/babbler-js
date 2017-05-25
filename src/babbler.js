
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

/** Максимальный размер очереди команд по умолчанию */
const BBLR_QUEUE_LIMIT = 5;

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
 *     Babbler.on(event, callback);
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
    QUEUE_READY: "queue_ready",
    /**
     * События для установленного подключения - флаги и значения,
     * характеризующие "здоровье" устройства или канала связи.
     * Значения - поля в параметре values обратного вызова.
     * replyTimeout:
     *   true: Устройство не отправило ответ во-время. 
     *     Возможно, просто долго выполняло (следует исправить прошивку - команды
     *     не должны выполняться дольше 5ти секунд), плохая связь, а возможно, зависло.
     * 
     *   false: Устройство прислало ответ вовремя после того, как был зафиксирован
     *     таймаут ответа (значит связь опять налажена - это была частная проблема
     *     какой-то команды).
     */
    HEALTH: "health",
    /**
     * Новое значение "приклеенного свойства" (значения, регулярно запрашиваемые с устройства,
     * см stickProp) или ошибка при его получении.
     */
    PROP: "prop"
}

// Ошибки по рекомендациям Мозилы
// https://developer.mozilla.org/ru/docs/Web/JavaScript/Reference/Global_Objects/Error

// Ошибки команд

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

// Ошибки подключения

/** Пытаемся подключиться, когда уже подключены */
const BBLR_ERROR_ALREADY_CONNECTED = "Already connected"
function BblrAlreadyConnectedError(message) {
  this.name = 'BblrAlreadyConnectedError';
  this.message = message || BBLR_ERROR_ALREADY_CONNECTED;
  this.stack = (new Error()).stack;
}
BblrAlreadyConnectedError.prototype = Object.create(Error.prototype);
BblrAlreadyConnectedError.prototype.constructor = BblrAlreadyConnectedError;

/** Неправильное имя порта устройства */
const BBLR_ERROR_INVALID_PORT_NAME = "Invalid port name"
function BblrInvalidPortNameError(message) {
  this.name = 'BblrInvalidPortNameError';
  this.message = message || BBLR_ERROR_INVALID_PORT_NAME;
  this.stack = (new Error()).stack;
}
BblrInvalidPortNameError.prototype = Object.create(Error.prototype);
BblrInvalidPortNameError.prototype.constructor = BblrInvalidPortNameError;

/** Устройство отключилось по внешним причинам (выдернут провод) */
const BBLR_ERROR_DEVICE_UNPLUGGED = "Device unplugged"
function BblrDeviceUnpluggedError(message) {
  this.name = 'BblrDeviceUnpluggedError';
  this.message = message || BBLR_ERROR_DEVICE_UNPLUGGED;
  this.stack = (new Error()).stack;
}
BblrDeviceUnpluggedError.prototype = Object.create(Error.prototype);
BblrDeviceUnpluggedError.prototype.constructor = BblrDeviceUnpluggedError;

/** Отменили подключение до того, как успели подключиться */
const BBLR_ERROR_CANCEL_OPEN = "Cancel open"
function BblrCancelOpenError(message) {
  this.name = 'BblrCancelOpenError';
  this.message = message || BBLR_ERROR_CANCEL_OPEN;
  this.stack = (new Error()).stack;
}
BblrCancelOpenError.prototype = Object.create(Error.prototype);
BblrCancelOpenError.prototype.constructor = BblrCancelOpenError;

/** Устройство отключилось по вызову пользователя disconnect */
const BBLR_ERROR_HANDSHAKE_FAIL = "Handshake fail"
function BblrHandshakeFailError(message) {
  this.name = 'BblrHandshakeFailError';
  this.message = message || BBLR_ERROR_HANDSHAKE_FAIL;
  this.stack = (new Error()).stack;
}
BblrHandshakeFailError.prototype = Object.create(Error.prototype);
BblrHandshakeFailError.prototype.constructor = BblrHandshakeFailError;

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
 * Настройки системы взаимодействия с устройством Babbler.
 * @typedef {Object} babblerOptions
 * @property {number} [options.replyTimeout=5000] - максимальное время ответа на команду от устройства,
 *     по истечении этого времени команда считается не выполненной и получает ошибку BblrReplyTimeoutError.
 * @property {number} [options.validatePeriod=1000] - период проверки зависших запросов.
 * @property {number} [options.queueLimit=5] - максимальное количество элементов в очереди команд, 
 *     0 - без ограничения.
 * @property {number} [options.dequeuePeriod=200] - период период выборки команд из очереди на отправку.
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
 * A callback called with an error or null.
 * @typedef {function} errorCallback
 * @param {?error} err
 * https://github.com/EmergingTechnologyAdvisors/node-serialport/blob/master/lib/serialport.js#L55
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
    
    var opening = false;
    var closing = false;
    
    this.plugged = true;
    this.opened = false;
    
    var _error = function(error, callback) {
        if (callback) {
            callback(error);
        }
    };
    
    var _asyncError = function(error, callback) {
        process.nextTick(() => _error(error, callback));
    };

    /** Устройство готово получать данные */
    this.ready = function() {
        return this.opened;
    }
    
    // SerialPort.open
    this.open = function(callback) {
        if(this.opened) return _asyncError(new Error("Already opened"), callback);
        if(opening) return _asyncError(new Error("Already opening"), callback);
        if(closing) return _asyncError(new Error("We are closing"), callback);
        
        this.plugged = true;
        opening = true;
        // типа устройство откроется через некоторое время
        setTimeout(function() {
            if(this.plugged && (portName === "/dev/ttyUSB0" || portName === "/dev/readonly")) {
                opening = false;
                this.opened = true;
                this.emit('open');
                if(callback) {
                    callback();
                }
            } else {
                _error(new Error("Dev not found: " + portName), callback);
            }
        }.bind(this), 10);
    }
    
    // SerialPort.close
    this.close = function(callback) {
        if(closing) return _asyncError(new Error("Already closing"), callback);
        if(!this.opened) return _asyncError(new Error("Not opened"), callback);
        
        opening = false;
        this.opened = false;
        if(callback) {
            callback();
        }
    }
    
    // SerialPort.write
    this.write = function(data, callback) {
        if(!this.opened) {
            callback(new Error("Dev not opened"));
        } else if(portName === "/dev/readonly") {
            callback(new Error("Access denied for write to " + "/dev/readonly"));
        } else {
            // парсим строку в объект
            cmd = JSON.parse(data);
            
            var reply = "dontunderstand";
            var delay = 100;
            if(cmd.cmd === "ping") {
                reply = "ok";
            } else if(cmd.cmd === "help") {
                reply = "ping help delay name manufacturer";
            } else if(cmd.cmd === "delay") {
                // долгая команда
                if(cmd.params != undefined && cmd.params.length > 0) {
                    delay = parseInt(cmd.params[0], 10);
                } else {
                    delay = 6000;
                }
                reply = "ok";
            } else if(cmd.cmd === "name") {
                reply = "Babbler fake device";
            } else if(cmd.cmd === "manufacturer") {
                reply = "sadr0b0t";
            }
            
            var replyPack = JSON.stringify({
                id: cmd.id.toString(),
                cmd: cmd.cmd,
                params: cmd.params,
                reply: reply
            });
        
            // типа немного поработали перед тем, как
            // отправить ответ
            setTimeout(function() {
                this.emit('data', replyPack);
            }.bind(this), delay);
        }
    }
    
    // симуляция выдернутого шнура
    this.unplug = function() {
        setTimeout(function() {
            this.plugged = false;
            this.close();
            this.emit('disconnect');
        }.bind(this), 10);
    }
}
inherits(BabblerFakeDevice, EventEmitter);


/**
 * Создать экземпляр устройства - плата с прошивкой на основе библиотеки babbler_h
 * https://github.com/1i7/babbler_h .
 * 
 * Варианты подключений:
 * - последовательный порт,
 * - заглушка-симуляция для тестов.
 * 
 * @param {module:babbler-js~babblerOptions=} options - настройки системы взаимодействия:
 * @param {number} [options.replyTimeout=5000] - максимальное время ответа на команду от устройства,
 *     по истечении этого времени команда считается не выполненной и получает ошибку BblrReplyTimeoutError.
 * @param {number} [options.validatePeriod=1000] - период проверки зависших запросов.
 * @param {number} [options.queueLimit=5] - максимальное количество элементов в очереди команд, 
 *     0 - без ограничения.
 * @param {number} [options.dequeuePeriod=200] - период период выборки команд из очереди на отправку.
 */
function Babbler(options) {
    //http://phrogz.net/js/classes/OOPinJS.html
    
    if(!options) {
        options = {};
    }
    
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
    var _replyTimeoutFlag = false;
    
    ///////////////////////////////////////////
    // Внутренняя кухня
    /** Устройство */
    var dev = undefined;
    var devOpening = false;
    
    /**
     * Максимальное время ответа на команду от устройства,
     * по истечении этого времени команда считается не выполненной
     * и получает ошибку BblrReplyTimeoutError.
     */
    var _replyTimeout = (options.replyTimeout != undefined) ? 
        options.replyTimeout : BBLR_REPLY_TIMEOUT_MILLIS;
    
    /** Период проверки зависших запросов */
    var _validatePeriod = (options.validatePeriod != undefined) ? 
        options.validatePeriod : BBLR_VALIDATE_REPLY_CALLBACKS_PERIOD;
    
    /** 
     * Очередь команд на отправку 
     * {module:babbler-js~cmdInfo}
     */
    var cmdQueue = [];
    
    /** Период период выборки команд из очереди на отправку */
    var _dequeuePeriod = (options.dequeuePeriod != undefined) ? 
        options.dequeuePeriod : BBLR_DEQUEUE_PERIOD;
    
    /** 
     * Максимальное количество элементов в очереди команд,
     * 0 - без ограничения
     */
    var _queueLimit = (options.queueLimit != undefined) ? 
        options.queueLimit : BBLR_QUEUE_LIMIT;
    
    /**
     * Очередь колбэков для ответов на отправленные команды
     * (по-хорошему, там всегда будет максимум один элемент, если контроллер отвечает
     * достаточно быстро)
     * {module:babbler-js~cmdCallbackInfo}
     */
    var cmdResultCallbackQueue = [];
    
    /** Счетчик для генерации идентификаторов отправляемых команд */
    var nextCmdId = 0;
    
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
            if(Date.now() - callbackInfo.timestamp > _replyTimeout) {
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
            if(!_replyTimeoutFlag) {
                // выставим флаг таймаута
                _replyTimeoutFlag = true;
                // и сгенерируем событие
                this.emit(BabblerEvent.HEALTH, {replyTimeout: true});
            }
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
                    this.disconnect(err);
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
        if(_deviceStatus != status) {
            _deviceStatus = status;
            _deviceError = error;
            
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
     * @param {module:babbler-js~errorCallback} callback - обратный вызов:
     *     соединение с устройством установлено или в процессе подключения произошла ошибка.
     */
    this.connect = function(portName, options, callback) {
        // посмотрим параметры
        if(options instanceof Function) {
            callback = options;
            options = {};
        } else if(!options) {
            options = {};
        }
        
        // прямой колбэк вызываем только один раз
        if(callback) {
            callback.called = false;
        }
        
        // не будем подключаться, если уже подключены
        if(_deviceStatus !== DeviceStatus.DISCONNECTED) {
            // прямой колбэк из connect - не получилось подключиться
            if(callback && !callback.called) {
                callback.called = true;
                callback(new BblrAlreadyConnectedError());
            }
            return;
        }
        
        _deviceName = portName;
        
        // подключаемся
        _setDeviceStatus(DeviceStatus.CONNECTING);
    
        // некорректное имя порта - засчитаем попытку подключения с ошибкой.
        // проверка на пустую строку: true, если undefined, null, 0, "", " ")
        // http://stackoverflow.com/questions/5515310/is-there-a-standard-function-to-check-for-null-undefined-or-blank-variables-in/21732631#21732631
        if((portName ? portName.trim().length == 0 : true)) {
            _setDeviceStatus(DeviceStatus.DISCONNECTED, 
                new BblrInvalidPortNameError(BBLR_ERROR_INVALID_PORT_NAME + ": '" + portName + "'"));
            // прямой колбэк из connect - не получилось подключиться
            if(callback && !callback.called) {
                callback.called = true;
                callback(new BblrInvalidPortNameError(BBLR_ERROR_INVALID_PORT_NAME + ": '" + portName + "'"));
            }
            return;
        }
        
        // Выбор устройства по префиксу portName
        if(portName.startsWith("test:")) {
            if(options.dev != undefined) {
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
                        
                        if(_replyTimeoutFlag) {
                            // значит устройство вовремя прислало корректные данные
                            // в ответ на отправленный запрос:
                            // снимем флаг таймаута
                            _replyTimeoutFlag = false;
                            // и сгенерируем событие
                            this.emit(BabblerEvent.HEALTH, {replyTimeout: false});
                        }
                        
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
            // Сюда попадаем только, если соединение разорвано за пределами кода 
            // Babbler (пользователь выдернул шнур).
            // Из dev.close() в Babbler.disconnect (разрыв соединения пользователем) -
            // сюда не попадаем.
            // Поэтому ошибка "Device unplugged" при вызове Babbler.disconnect не появится.
            _disconnect(new BblrDeviceUnpluggedError());
            dev = undefined;
            
            // Порвали соединение до того, как успели подключиться:
            // прямой колбэк из connect - не получилось подключиться
            if(callback && !callback.called) {
                callback.called = true;
                callback(new BblrDeviceUnpluggedError());
            }
        });

        // 
        // Действия
        //

        // открываем порт
        devOpening = true;
        dev.open(function(err) {
            //console.log("##opened: " + (dev ? "dev.ready=" + dev.ready() : "dev=undefined"));
            var _devOpening = devOpening;
            devOpening = false;
            if(!_devOpening) {
                // вызвали отключение disconnect до того, как пришел этот колбэк
                
                // закрываем порт здесь
                if(dev != undefined && dev.ready()) {
                    dev.close(function(_err) {
                        // ошибки ловим, но игнорируем
                        //console.log(_err);
                    });
                }
                dev = undefined;
                
                // здесь этого делать не нужно, т.к. статус DISCONNECTED
                // уже выставлен в disconnect
                //_setDeviceStatus(DeviceStatus.DISCONNECTED, new BblrCancelOpenError());
                
                // прямой колбэк из connect - не получилось подключиться
                if(callback && !callback.called) {
                    callback.called = true;
                    callback(new BblrCancelOpenError());
                }
            } else if(err) {
                // не получилось открыть порт
                // обновим статус
                _setDeviceStatus(DeviceStatus.DISCONNECTED, err);
                
                // прямой колбэк из connect - не получилось подключиться
                if(callback && !callback.called) {
                    callback.called = true;
                    callback(err);
                }
            } else {
                // порт открыт, но устройство может еще какое-то время тупить 
                // до того, как начнет отвечать на запросы (или это может быть
                // вообще неправильное устройство)
                 
                // поэтому будем считать, что подключены, только после того, 
                // как примем ответ на первый пинг
                
                // прочищаем зависшие запросы раз в секунду
                validateIntId = setInterval(_validateReplyCallbacks, _validatePeriod);
                
                var pingCount = 0;
                
                // отправляем пинг напрямую, а не через очередь команд, т.к.
                // очередь в этот момент все равно пустая и не работает
                var firstPing = function() {
                    pingCount++;
                    _writeCmd(/*cmd*/ "ping", /*params*/ [],
                        // onResult
                        function(err, reply, cmd, params) {
                            if(err) {
                                if(_deviceStatus === DeviceStatus.CONNECTING && 
                                      err instanceof BblrReplyTimeoutError &&
                                      (options.retryCount ? pingCount <= options.retryCount : true)) {
                                    // превышено время ожидаения ответа - пробуем еще раз до
                                    // тех пор, пока не подключимся или не отменим попытки
                                    firstPing();
                                } else {
                                    // другая ошибка отправки команды - прекращаем пробовать
                                    // обновим статус
                                    this.disconnect(new BblrHandshakeFailError(err.toString()));
                                    
                                    // прямой колбэк из connect - неудачное подключение
                                    if(callback && !callback.called) {
                                        callback.called = true;
                                        callback(new BblrHandshakeFailError(err.toString()));
                                    }
                                }
                            } else {
                                // пришел ответ - теперь точно подключены
                                // (вообще, можно было бы проверить, что статус reply=='ok',
                                // а не 'dontundertand' или 'error', но корректно сформированного
                                // ответа, в общем, и так достаточно, будем прощать всякие 
                                // косяки по максимуму)
                                
                                // отправлять команду на устройство раз в 200 миллисекунд (5 раз в секунду)
                                // (на 100 миллисекундах команды начинают склеиваться)
                                dequeueIntId = setInterval(_dequeueCmd, _dequeuePeriod);
                                
                                // проверять статус устройства раз в 5 секунд
                                // (при подключении через последовательный порт - это излишество,
                                // если только обрабатывать случай, когда само устройство повисло
                                // на какую-нибудь долгую задачу и не хочет отправлять ответы в 
                                // установленное время)
                                //checkAliveIntId = setInterval(_checkDeviceAlive, 5000);
                                
                                // обновим статус
                                _setDeviceStatus(DeviceStatus.CONNECTED);
                                
                                // прямой колбэк из connect - удачное подключение
                                if(callback && !callback.called) {
                                    callback.called = true;
                                    callback();
                                }
                            }
                        }.bind(this)
                    );
                }.bind(this);
                firstPing();
                // поможет обойти баг на старых загрузчиках ChipKIT Uno32
                // (если перепрошить нет возможности)
                // см: http://chipkit.net/forum/viewtopic.php?f=19&t=3731&p=15573#p15573
                //setTimeout(firstPing, 5000);
            }
        }.bind(this));
    }.bind(this);
    
    /**
     * Освободить ресурсы после отключения от устройства.
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
        // сначала очистим очередь
        var cmdResultCallbackQueueOld = cmdResultCallbackQueue;
        cmdResultCallbackQueue = [];
        for(var i in cmdResultCallbackQueueOld) {
            var callbackInfo = cmdResultCallbackQueueOld[i];
            // извещаем отправившего команду
            process.nextTick(function() {
                callbackInfo.onResult(new BblrDisconnectedAfterError(), undefined, callbackInfo.cmd, callbackInfo.params);
            });
            // остальных тоже известим, что ответа не дождемся
            process.nextTick(function() {
                this.emit(
                    BabblerEvent.DATA_ERROR, 
                    JSON.stringify({cmd: callbackInfo.cmd, params: callbackInfo.params, id: callbackInfo.id}), 
                    DataFlow.IN,
                    new BblrDisconnectedAfterError());
            }.bind(this));
        }
        
        // обнуляем команды в очереди на отправку -
        // сначала почистим очередь
        var cmdQueueOld = cmdQueue;
        cmdQueue = [];
        // потом возвращаем ошибки
        for(var i in cmdQueueOld) {
            var cmdInfo = cmdQueueOld[i];
            // извещаем отправившего команду
            process.nextTick(function() {
                cmdInfo.onResult(new BblrDisconnectedBeforeError(), undefined, cmdInfo.cmd, cmdInfo.params);
            });
            // остальных тоже известим, что команда так и не ушла из очереди
            process.nextTick(function() {
                this.emit(
                    BabblerEvent.DATA_ERROR, 
                    JSON.stringify({cmd: cmdInfo.cmd, params: cmdInfo.params}), 
                    DataFlow.QUEUE,
                    new BblrDisconnectedBeforeError());
            }.bind(this));
        }
    }.bind(this);
    
    /**
     * Отключиться от устройства
     * @param {?error} err - ошибка - причина отключения (необязательно)
     * @emits module:babbler-js#data_error
     */
    this.disconnect = function(err) {
        // ставим статус, очищаем ресурсы
        _disconnect(err);
        
        if(devOpening) {
            // устройство не успело отправить колбэк
            // с результатом open - здесь не будем
            // его закрывать (все равно, не получится), 
            // а дождемся колбэка
            devOpening = false;
        } else {
            // закрываем порт
            if(dev != undefined && dev.ready()) {
                dev.close(function(_err) {
                    // ошибки ловим, но игнорируем
                    //console.log(_err);
                });
            }
            dev = undefined;
        }
    }
    
    /**
     * Отправить команду на устройство.
     * @param {module:babbler-js~cmdResultCallback=} onResult
     * @emits module:babbler-js#data
     * @emits module:babbler-js#data_error
     */
    var _writeCmd = function(cmd, params, onResult) {
        // отправляем команду напрямую на устройство
        if(dev != undefined && dev.ready()) {
            nextCmdId++;
            // добавим колбэк на получение ответа в очередь
            cmdResultCallbackQueue.push({
                cmd: cmd,
                params: params,
                id: nextCmdId.toString(),
                timestamp: Date.now(),
                onResult: onResult
            });
                        
            // пишем данные здесь, результат получаем в колбэке на событие data
            var data = JSON.stringify({
                cmd: cmd,
                params: params,
                id: nextCmdId.toString()
            });
            dev.write(data, function(err) {
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
                        
                    // персональная ошибка в onResult
                    // убираем только что добавленный колбэк с onResult 
                    // из очереди ожидания ответа
                    cmdResultCallbackQueue.pop();
                    // отправим ответ тому, кто вопрошал
                    if(onResult != undefined) {
                        onResult(new BblrPortWriteError(BBLR_ERROR_WRITING_TO_PORT + ": " + err), undefined, cmd, params);
                    }
                }
            }.bind(this));
        } else {
            // порт вообще-то не открыт или устройство отключено
            // (вообще, это не должно произойти, т.к. мы ловим событие dev 'disconnect')
            this.emit(BabblerEvent.DATA_ERROR, data, DataFlow.OUT, new BblrNotConnectedError());
            // отключаемся
            this.disconnect(new BblrNotConnectedError());
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
            
            // извлекаем первую команду из очереди
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
        replyTimeoutFlag: {
            get: function() {
                return _replyTimeoutFlag;
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
    
    /////////////////////
    /// "Приклеенные" свойства - команды для регулярного опроса устройства
    var _stickedProps = {};
    
    /**
     * "Приклеить" свойство: постоянно отправлять на устройство заданную
     * команду (опрашивать устройство) и сохранять получаемый ответ в
     * виде свойства (getPropVal).
     * Если при очередном запросе значение ответа изменилось, или вместо
     * него была получена ошибка, будет отправлено событие 'prop' с новым
     * значением свойства или ошибкой.
     * @param name - имя свойства
     * @param cmd - команда для получения значения свойства с устройства
     * @param params - параметны команды
     * @param period - период опроса устройства (миллисекунды),
     *     0 - запросить значение один раз при подключении.
     *     значение по умолчанию: 0 (запросить значение один раз при подключении)
     */
    this.stickProp = function(name, cmd, params, period=0) {
        _stickedProps[name] = {name: name, cmd: cmd, params: params, period: period,
            waitReply: false, intId: 0};
    }
    
    /**
     * Получить "приклеенное" свойство устройства по имени:
     * @param name - имя свойства
     * @return актуальное значение свойства prop или undefined, если свойство не найдено
     *     prop:
     *       val - значение свойства
     *       err - ошибка (если при получении свойства возникла ошибка)
     */
    this.getStickedProp = function(name) {
        var prop = _stickedProps[name];
        if(prop) {
            return {val: prop.val, err: prop.err};
        } else {
            return undefined;
        }
    }
    
    /**
     * Запросить значение "приклеенного" свойства с устройства.
     * @param prop - выбранное свойство
     */
    var requestStickedProp = function(prop) {
        // отправлять новый запрос только в том случае,
        // если получили ответ на предыдущий
        if(!prop.waitReply) {
            prop.waitReply = true;
            this.sendCmd(prop.cmd, prop.params,
                // onResult
                function(err, reply, cmd, params) {
                    prop.waitReply = false;
                    if(err) {
                        // сообщим об ошибке только если она изменилась
                        if(prop.err != err) {
                            prop.err = err;
                            // присылаем новую ошибку и старое значение свойства
                            this.emit(BabblerEvent.PROP, prop.name, err, prop.val);
                        }
                    } else {
                        // в любом случае сбрасываем ошибку -
                        // на случай, если она была
                        prop.err = undefined;
                        
                        // событие шлем только в том случае, если
                        // значение свойства поменялось
                        if(prop.val !== reply) {
                            prop.val = reply;
                            this.emit(BabblerEvent.PROP, prop.name, undefined, prop.val);
                        }
                    }
                }.bind(this)
            );
        }
    }.bind(this);
    
    // опрашиваем устройство только если подключены
    this.on(Babbler.Event.CONNECTED, function() {
        for(var propName in _stickedProps) {
            if (_stickedProps.hasOwnProperty(propName)) {
                var prop = _stickedProps[propName];
                
                if(prop.period > 0) {
                    // небольшая хитрость - здесь приходится обернуть
                    // контекст в дополнительную функцию с параметром prop,
                    // т.к. если вызывать здесь setInterval напрямую,
                    // значение переменной prop внутри setInterval получается
                    // равно последнему значению этой переменной в цикле
                    // (т.е. опрашиваем все время одно и то же свойство)
                    var invokeLater = function(prop) {
                        prop.intId = setInterval(function() {
                            requestStickedProp(prop);
                        }.bind(this), prop.period);
                    }.bind(this);
                    invokeLater(prop);
                } else {
                    // отправляем запрос только один раз
                    requestStickedProp(prop);
                }
            }
        }
    });
    
    // перестаём опрашивать устройство, если отключились
    this.on(Babbler.Event.DISCONNECTED, function() {
        for(var propName in _stickedProps) {
            if(_stickedProps.hasOwnProperty(propName)) {
                var prop = _stickedProps[propName];
                clearInterval(prop.intId);
                prop.waitReply = false;
            }
        }
    });
}

// наследуем Babbler от EventEmitter, чтобы
// генерировать события красиво
inherits(Babbler, EventEmitter);

// Перечисления и константы для публики

/** События */
Babbler.Event = BabblerEvent;

/** Статусы устройства: отключено, подключаемся, подключено */
Babbler.Status = DeviceStatus;

/** Направление потока данных */
Babbler.DataFlow = DataFlow;

/** Ошибки Error */
Babbler.BblrReplyTimeoutError = BblrReplyTimeoutError;
Babbler.BblrDisconnectedBeforeError = BblrDisconnectedBeforeError;
Babbler.BblrDisconnectedAfterError = BblrDisconnectedAfterError;
Babbler.BblrNotConnectedError = BblrNotConnectedError;
Babbler.BblrPortWriteError = BblrPortWriteError;
Babbler.BblrQueueFullError = BblrQueueFullError;
Babbler.BblrDiscardedError = BblrDiscardedError;
Babbler.BblrAlreadyConnectedError = BblrAlreadyConnectedError;
Babbler.BblrInvalidPortNameError = BblrInvalidPortNameError;
Babbler.BblrDeviceUnpluggedError = BblrDeviceUnpluggedError;
Babbler.BblrCancelOpenError = BblrCancelOpenError;
Babbler.BblrHandshakeFailError = BblrHandshakeFailError;


// отправляем компонент на публику
module.exports = Babbler;

