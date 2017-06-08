// Тесты с nodeunit
//https://github.com/caolan/nodeunit

// обычная нода
//var EventEmitter = require('events');
//var inherits = require('util').inherits;

// для браузера - порты без глубоких зависимостей
var EventEmitter = require('node-event-emitter');
var inherits = require('inherits');

/** Устройство - заглушка-симуляция для тестов **/
function BabblerFakeDevice(name, options) {
    var portName = name;
    var portOptions = options;
    
    var opening = false;
    var closing = false;
    
    this.plugged = true;
    this.opened = false;
    
    // просто свойства
    var _name = "Babbler fake device";
    var _manufacturer = "sadr0b0t";
    
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
                reply = _name;
            } else if(cmd.cmd === "manufacturer") {
                reply = _manufacturer;
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
    
    // симуляция выдернутого шнура (для тестов)
    this.unplug = function() {
        setTimeout(function() {
            this.plugged = false;
            this.close();
            this.emit('disconnect');
        }.bind(this), 10);
    }
    
    // установить новое значение свойства name (для тестов)
    this.setName = function(name) {
       _name = name;
    }
}
inherits(BabblerFakeDevice, EventEmitter);


var portName = "test:/dev/ttyUSB0";
//var portName = "serial:/dev/ttyUSB0";
//var portName = "/dev/ttyUSB0";

exports.ConnectionLifecycle = {

    "'connecting' event": function(test) {
        // сколько будет тестов
        test.expect(1);
        
        var Babbler = require('../src/babbler');
        var babbler = new Babbler();
        
        babbler.on('connecting', function() {
            test.ok(true, "Should try to connect here");
            
            // закончили здесь
            test.done();
        });
        
        // подключаемся к устройству - ожидаем колбэки
        babbler.connect("/dev/xxx");
    },
    
    "Device does not exist": function(test) {
        // сколько будет тестов
        test.expect(3);
        
        var Babbler = require('../src/babbler');
        var babbler = new Babbler();
        
        babbler.on('connected', function() {
            test.ok(false, "Should not connect here");
        });
        
        babbler.on('connecting', function() {
            test.ok(true, "Should try to connect here");
        });

        babbler.on('disconnected', function(err) {
            test.ok(true, "Disconnected here");
            test.ok(err != undefined, "Error defined: " + err);
            
            // закончили здесь
            test.done();
        });
        
        // подключаемся к устройству - ожидаем колбэки
        babbler.connect("/dev/xxx");
    },
    
    "'connected'-'disconnected' events": function(test) {
        // сколько будет тестов
        test.expect(3);
        
        var Babbler = require('../src/babbler');
        var babbler = new Babbler();
        
        babbler.on('connected', function() {
            test.ok(true, "Connected ok");
            
            // подключились - отключаемся
            babbler.disconnect();
        });
        
        babbler.on('disconnected', function(err) {
            test.ok(true, "Disconnected ok");
            test.ok(err == undefined, "No errors: " + err);
            
            // закончили здесь
            test.done();
        });
        
        // подключаемся к устройству - ожидаем колбэки
        babbler.connect(portName);
    },
    
    "Basic props": function(test) {
        // сколько будет тестов
        test.expect(4);
        
        var Babbler = require('../src/babbler');
        var babbler = new Babbler();
        
        babbler.on('connected', function() {
            test.equal(babbler.deviceName, portName, "Dev name should be: " + portName);
            test.equal(babbler.deviceStatus, "connected", "Dev status should be: 'connected'");
            test.equal(babbler.deviceError, undefined, "Dev err should be: undefined");
            test.ok(babbler.replyTimeoutFlag === false, 
                "Reply timeout flag should be: boolean and false");
            
            // подключились - отключаемся
            babbler.disconnect();
        });
        
        babbler.on('disconnected', function(err) {
            // закончили здесь
            test.done();
        });
        
        // подключаемся к устройству - ожидаем колбэки
        babbler.connect(portName);
    },
    
    "Constructor options": function(test) {
        // сколько будет тестов
        test.expect(2);
        
        var Babbler = require('../src/babbler');
        
        // значение по умолчанию
        var babbler1 = new Babbler();
        test.equal(babbler1.queueLimit, 5, "Default queueLimit is 5");
        
        // значение из конструктора
        var babbler2 = new Babbler({queueLimit: 3});
        test.equal(babbler2.queueLimit, 3, "Set queueLimit to 3");
        
        test.done();
    },
    
    "Babbler.connect callback - success": function(test) {
        // сколько будет тестов
        test.expect(2);
        
        var Babbler = require('../src/babbler');
        var babbler = new Babbler();
        
        babbler.on('disconnected', function(err) {
            // закончили здесь
            test.done();
        });
        
        // подключаемся к устройству - ожидаем прямой колбэк
        // на удачное подключение или ошибку
        
        // ожидаем удачное подключение
        babbler.connect(portName, function(err) {
            test.ok(true, "Connected ok: " + portName);
            test.ifError(err, "No errors");
            
            // отключаемся
            babbler.disconnect();
        });
    },
    
    "Babbler.connect callback - AlreadyConnectedError": function(test) {
        // сколько будет тестов
        test.expect(4);
        
        var Babbler = require('../src/babbler');
        var babbler = new Babbler();
        
        babbler.on('disconnected', function(err) {
            // закончили здесь
            test.done();
        });
        
        // подключаемся к устройству - ожидаем прямой колбэк
        // на удачное подключение или ошибку
        
        // ожидаем удачное подключение
        babbler.connect(portName, function(err) {
            test.ok(true, "Connected ok: " + portName);
            test.ifError(err, "No errors");
            
            // подключаемся еще раз - ожидаем
            // неудачное подключение, т.к. уже подключены
            babbler.connect(portName, function(err) {
                test.ok(true, "Got callback for: " + portName);
                test.ok(err instanceof Babbler.BblrAlreadyConnectedError, 
                    "Not connected with AlreadyConnected error: " + err);
                
                // отключаемся
                babbler.disconnect();
            });
        });
    },
    
    "Babbler.connect callback - InvalidPortNameError": function(test) {
        // сколько будет тестов
        test.expect(2);
        
        var Babbler = require('../src/babbler');
        var babbler = new Babbler();
        
        // подключаемся к устройству - ожидаем прямой колбэк
        // на удачное подключение или ошибку
        
        // неудачное подключение - нет такого устройства
        babbler.connect("    ", function(err) {
            test.ok(true, "Got callback for: " + "'    '");
            test.ok(err instanceof Babbler.BblrInvalidPortNameError, 
                "Not connected with InvalidPortNameError error: " + err);
            
            // закончили здесь
            test.done();
        });
    },
    
    "Babbler.connect callback - open device error": function(test) {
        // сколько будет тестов
        test.expect(2);
        
        var Babbler = require('../src/babbler');
        var babbler = new Babbler();
        
        // подключаемся к устройству - ожидаем прямой колбэк
        // на удачное подключение или ошибку
        
        // неудачное подключение - нет такого устройства
        babbler.connect("/dev/xxx", function(err) {
            test.ok(true, "Got callback for: " + "/dev/xxx");
            test.ok(err instanceof Error, 
                "Not connected with error: " + err);
            
            // закончили здесь
            test.done();
        });
    },
    
    "Babbler.connect callback - read-only device": function(test) {
        // сколько будет тестов
        test.expect(2);
        
        var Babbler = require('../src/babbler');
        var babbler = new Babbler();
        
        // подключаемся к устройству - ожидаем прямой колбэк
        // на удачное подключение или ошибку
        
        // неудачное подключение - устройство существует, но
        // не доступно для записи
        babbler.connect("test:/dev/readonly", function(err) {
            test.ok(true, "Got callback for: " + "/dev/readonly");
            test.ok(err instanceof Babbler.BblrHandshakeFailError, 
                "Not connected with error: " + err);
            
            // закончили здесь
            test.done();
        });
    },
    
    "Babbler.connect callback - handshake (first ping) timeout": function(test) {
        // сколько будет тестов
        test.expect(2);
        
        var Babbler = require('../src/babbler');
        // таймаут на ответ поменьше, чтобы тесты проходили побыстрее
        var babbler = new Babbler({replyTimeout: 100});
        var dev = new BabblerFakeDevice("/dev/ttyUSB0");
        // к устройству можно подключиться, но оно не отправляет
        // ответы на команды
        dev.write = function(data, callback) {
        }
        
        // подключаемся к устройству - ожидаем прямой колбэк
        // на удачное подключение или ошибку
        
        // неудачное подключение - таймаут подключения
        // (устройство есть, доступно для записи, но не присылает ответ на ping)
        babbler.connect(portName, {dev:dev, retryCount: 3}, function(err) {
            test.ok(true, "Got callback for: " + portName);
            test.ok(err instanceof Babbler.BblrHandshakeFailError,
                "Not connected with error: " + err);
            
            // закончили здесь
            test.done();
        });
    },
    
    "Babbler.connect callback - cancel connection immediately": function(test) {
        // сколько будет тестов
        test.expect(2);
        
        var Babbler = require('../src/babbler');
        var babbler = new Babbler();
        
        // подключаемся к устройству - ожидаем прямой колбэк
        // на удачное подключение или ошибку
        
        // неудачное подключение - отменим процесс подключения,
        // не дожидаясь окончания
        babbler.connect(portName, function(err) {
            test.ok(true, "Got callback for: " + portName);
            test.ok(err instanceof Babbler.BblrCancelOpenError, 
                "Not connected with error: " + err);
            
            // закончили здесь
            test.done();
        });
        // отменим подключение сразу - раньше, чем придет колбэк
        // на dev.open с удачно открытым портом
        babbler.disconnect();
    },
    
    "Babbler.connect callback - cancel connection later (handshake)": function(test) {
        // сколько будет тестов
        test.expect(2);
        
        var Babbler = require('../src/babbler');
        var babbler = new Babbler();
        
        // подключаемся к устройству - ожидаем прямой колбэк
        // на удачное подключение или ошибку
        
        // неудачное подключение - отменим процесс подключения,
        // не дожидаясь окончания
        babbler.connect(portName, function(err) {
            test.ok(true, "Got callback for: " + portName);
            test.ok(err instanceof Babbler.BblrHandshakeFailError, 
                "Not connected with error: " + err);
            
            // закончили здесь
            test.done();
        });
        
        // оборвем соединение чуть позже - после того,
        // связь с устройством установлена, но не завершилась 
        // процедура Handshake
        setTimeout(function() {
            babbler.disconnect();
        }, 11);
    },
    
    "Babbler.connect callback - device unplugged immediately": function(test) {
        // сколько будет тестов
        test.expect(2);
        
        var Babbler = require('../src/babbler');
        var babbler = new Babbler();
        var dev = new BabblerFakeDevice("/dev/ttyUSB0");
        // симуляция выдернутого шнура - "выдергиваем" провод сразу,
        // даже не дождавшись колбэка из dev.open
        dev.unplug = function() {
            //setTimeout(function() {
                this.plugged = false;
                this.close();
                this.emit('disconnect');
            //}.bind(this), 10);
        }
        
        // подключаемся к устройству - ожидаем прямой колбэк
        // на удачное подключение или ошибку
        
        // неудачное подключение - оборвем процесс подключения,
        // не дожидаясь окончания (симуляция выдернутого провода)
        babbler.connect("test:/dev/ttyUSB0", {dev: dev}, function(err) {
            test.ok(true, "Got callback for: " + "/dev/ttyUSB0");
            
            // ошибка BblrDeviceUnpluggedError более приоритетна, 
            // чем BblrHandshakeFailError - получим именно ее
            //test.ok(err instanceof Babbler.BblrHandshakeFailError, 
            test.ok(err instanceof Babbler.BblrDeviceUnpluggedError,
                "Not connected with error: " + err);
            
            // закончили здесь
            test.done();
        });
        dev.unplug();
    },
    
    "Babbler.connect callback - device unplugged later": function(test) {
        // сколько будет тестов
        test.expect(2);
        
        var Babbler = require('../src/babbler');
        var babbler = new Babbler();
        var dev = new BabblerFakeDevice("/dev/ttyUSB0");
        // симуляция выдернутого шнура - "выдергиваем" провод немного позже,
        // dev.open пришлет колбэк и начнет процедуру Handshake по отправке 
        // первых пингов
        dev.unplug = function() {
            setTimeout(function() {
                this.plugged = false;
                this.close();
                this.emit('disconnect');
            }.bind(this), 10);
        }
        
        // подключаемся к устройству - ожидаем прямой колбэк
        // на удачное подключение или ошибку
        
        // неудачное подключение - оборвем процесс подключения,
        // не дожидаясь окончания (симуляция выдернутого провода)
        babbler.connect("test:/dev/ttyUSB0", {dev: dev}, function(err) {
            test.ok(true, "Got callback for: " + "/dev/ttyUSB0");
            
            // ошибка BblrDeviceUnpluggedError более приоритетна, 
            // чем BblrHandshakeFailError - получим именно ее
            //test.ok(err instanceof Babbler.BblrHandshakeFailError, 
            test.ok(err instanceof Babbler.BblrDeviceUnpluggedError, 
                "Not connected with error: " + err);
            
            // закончили здесь
            test.done();
        });
        dev.unplug();
    },
    
    "Test commands": function(test) {
        // сколько будет тестов
        test.expect(15);
        
        var Babbler = require('../src/babbler');
        var babbler = new Babbler();
        
        babbler.on('connected', function() {
            test.ok(true, "Connected ok");
            
            // отправим существующую корректную команду
            babbler.sendCmd("ping", [],
                // onResult
                function(err, reply, cmd, params) {
                    test.ok(true, "Got reply");
                    test.ifError(err, "No errors");
                    
                    test.equal(reply, "ok", "And reply is 'ok'");
                    
                    test.equal(cmd, "ping", "cmd is 'ping'");
                    test.deepEqual(params, [], "and params are empty array");
                }
            );
            
            // отправим несуществующую некорректную команду
            babbler.sendCmd("pingzzz", ["hello"],
                // onResult
                function(err, reply, cmd, params) {
                    test.ok(true, "Got reply");
                    test.ifError(err, "No errors");
                    
                    test.equal(reply, "dontunderstand", "And reply is 'dontunderstand'");
                    
                    test.equal(cmd, "pingzzz", "cmd is 'pingzzz'");
                    test.deepEqual(params, ["hello"], "and params are ['hello'] array");
                    
                    // отключаемся
                    babbler.disconnect();
                }
            );
            
            // отправим команду после отключения
            babbler.sendCmd("ping", [],
                // onResult
                function(err, reply, cmd, params) {
                    test.ok(true, "Got error");
                    test.ok(err != undefined, "Error defined: " + err.message);
                    
                    test.equal(cmd, "ping", "cmd is 'ping'");
                    test.deepEqual(params, [], "and params are empty array");
                    
                    // закончили здесь
                    test.done();
                }
            );
        });
        
        // подключаемся к устройству - ожидаем колбэки
        babbler.connect(portName);
    },
    
    "Device timeout": function(test) {
        // сколько будет тестов
        test.expect(7);
        
        // таймауты и задержки для реального устройства
//        var replyTimeout = 5000;
//        var validatePeriod = 1000;
//        var delayToFail = 6000;
//        var delayForOk = 3000;
        
        // таймауты и задержки поменьше, чтобы тесты проходили побыстрее
        var replyTimeout = 500;
        var validatePeriod = 100;
        var delayToFail = 600;
        var delayForOk = 300;
        
        //
        var Babbler = require('../src/babbler');
        var babbler = new Babbler({replyTimeout: replyTimeout, validatePeriod});
        var dev = new BabblerFakeDevice("/dev/ttyUSB0");
        
        var expectReplyTimeoutTrue = false;
        var expectReplyTimeoutFalse = false;
        babbler.on('health', function(values) {
            if(values.replyTimeout) {
                if(expectReplyTimeoutTrue) {
                    test.ok(true, "Health event: replyTimeout==true");
                    expectReplyTimeoutTrue = false;
                } else {
                    test.ok(false, "Health event not expected: replyTimeout==true");
                }
            } else {
                if(expectReplyTimeoutFalse) {
                    test.ok(true, "Health event: replyTimeout==false");
                    expectReplyTimeoutFalse = false;
                } else {
                    test.ok(false, "Health event not expected: replyTimeout==false");
                }
            }
        });
        
        babbler.on('connected', function() {
            test.ok(true, "Connected ok");
            
            // отправим команду, которая будет выполняться дольше
            // 5ти секунд (те вылетит за пределы таймаута)
            expectReplyTimeoutTrue = true;
            babbler.sendCmd("delay", [delayToFail.toString()],
                // onResult
                function(err, reply, cmd, params) {
                    test.ok(err instanceof Babbler.BblrReplyTimeoutError,
                        "Cmd should fail with 'Timeout' error: " + err);
                    test.equal(reply, undefined, "And reply is 'undefined'");
                }
            );
            
            // отправим ту же команду, только с маленьким таймаутом, - 
            // убедимся, что придет ответ без ошибки
            expectReplyTimeoutFalse = true;
            babbler.sendCmd("delay", [delayForOk.toString()],
                // onResult
                function(err, reply, cmd, params) {
                    test.equal(err, undefined, "No errors: " + err);
                    test.equal(reply, "ok", "And reply is 'ok'");
                    
                    // отключаемся
                    babbler.disconnect();
                }
            );
        });
        
        babbler.on('disconnected', function(err) {
            console.log("disconnected: " + err);
            // закончили здесь
            test.done();
        });
        
        // подключаемся к устройству - ожидаем колбэки
        babbler.connect("test:/dev/ttyUSB0", {dev: dev});
    },
    
    "Disconnect device with commands in queue": function(test) {
        // сколько будет тестов
        test.expect(13);
        
        var Babbler = require('../src/babbler');
        var babbler = new Babbler();
        
        // мы должны завершить тест после 4го обратного вызова:
        // 2 вызова - по одному прямому колбэку на команду, 
        // плюс 2 события DATA_ERROR
        // тк. порядок вызовов правилами не определен, добавим счетчик
        var callbackCounter = 4;
        
        babbler.on("data_error", function(data, dir, err) {
            // здесь ожидаем 2 вызова
            test.equal(dir, Babbler.DataFlow.QUEUE, "Data error: dir==QUEUE");
            test.ok(err instanceof Babbler.BblrDisconnectedBeforeError,
                "Cmd should fail with BblrDisconnectedBeforeError error: " + err);
                
            // очередь команд должна быть пуста
            test.equal(babbler.queueLength, 0, "Queue should be empty on disconnect");
            
            // закончили, если это последний колбэк
            callbackCounter--;
            if(callbackCounter === 0) {
                test.done();
            }
        });
        
        babbler.on('connected', function() {
            test.ok(true, "Connected ok");
            
            // отправим пару команд, которые вернут результат не сразу
            // (чтобы точно повисели в очереди)
            expectReplyTimeoutTrue = true;
            babbler.sendCmd("delay", ["1000"],
                // onResult
                function(err, reply, cmd, params) {
                    test.ok(err instanceof Babbler.BblrDisconnectedBeforeError,
                        "Cmd should fail with BblrDisconnectedBeforeError error: " + err);
                    test.equal(reply, undefined, "And reply is 'undefined'");
                    
                    // очередь команд должна быть пуста
                    test.equal(babbler.queueLength, 0, "Queue should be empty on disconnect");
                    
                    // закончили, если это последний колбэк
                    callbackCounter--;
                    if(callbackCounter === 0) {
                        test.done();
                    }
                }
            );
            babbler.sendCmd("delay", ["1000"],
                // onResult
                function(err, reply, cmd, params) {
                    test.ok(err instanceof Babbler.BblrDisconnectedBeforeError,
                        "Cmd should fail with BblrDisconnectedBeforeError error: " + err);
                    test.equal(reply, undefined, "And reply is 'undefined'");
                    
                    // очередь команд должна быть пуста
                    test.equal(babbler.queueLength, 0, "Queue should be empty on disconnect");
                    
                    // закончили, если это последний колбэк
                    callbackCounter--;
                    if(callbackCounter === 0) {
                        test.done();
                    }
                }
            );
            
            // сразу отключаемся (обе команды еще должны быть в очереди)
            babbler.disconnect();
        });
        
        // подключаемся к устройству - ожидаем колбэки
        babbler.connect("test:/dev/ttyUSB0");
    },
    
    "Manage queue": function(test) {
        // сколько будет тестов
        test.expect(17);
        
        var Babbler = require('../src/babbler');
        var babbler = new Babbler();
        var dev = new BabblerFakeDevice("/dev/ttyUSB0");
        
        // ограничим очередь 3мя командами
        babbler.queueLimit = 3;
        test.equal(babbler.queueLimit, 3, "Queue limit is 3");
        
        // сюда прилетим при попытке отправить 4ю команду
        babbler.on('queue_full', function() {
            test.ok(true, "Queue full event");
        });
        
        // сюда прилетим после ручной очистки очереди
        // (или после того, как с устройства придет ответ
        // на 1ю отправленную команду, но в нашей симуляции
        // этого не произойдет)
        babbler.on('queue_ready', function() {
            test.ok(true, "Queue ready event");
        });
        
        babbler.on('connected', function() {
            // отправим подряд 4 команды - 4я должна 
            // завершиться ошибкой переполнения очереди
            // (чтобы эксперимент удался, устройство не 
            // должно выполнить 1ю команду и прислать ответ до 
            // того, как в очередь будут добавлены все команды)
            test.equal(babbler.queueLength, 0, "Queue is empty");
            
            // ошибки Discarded должны прилететь после того, как 
            // вручную очистим очередь babbler.discardQueue()
            babbler.sendCmd("delay", [],
                // onResult
                function(err, reply, cmd, params) {
                    test.ok(err instanceof Babbler.BblrDiscardedError,
                        "Cmd should fail with 'Discarded' error: " + err);
                }
            );
            test.equal(babbler.queueLength, 1, "Queue length is 1");
            babbler.sendCmd("delay", [],
                // onResult
                function(err, reply, cmd, params) {
                    test.ok(err instanceof Babbler.BblrDiscardedError,
                        "Cmd should fail with 'Discarded' error: " + err);
                }
            );
            test.equal(babbler.queueLength, 2, "Queue length is 2");
            test.ok(babbler.queueReady, "Queue is READY");
            
            babbler.sendCmd("delay", [],
                // onResult
                function(err, reply, cmd, params) {
                    test.ok(err instanceof Babbler.BblrDiscardedError,
                        "Cmd should fail with 'Discarded' error: " + err);
                }
            );
            test.equal(babbler.queueLength, 3, "Queue length is 3");
            test.ok(!babbler.queueReady, "Queue is FULL");
            
            // добавляем 4ю команду в очередь - 
            // выходим за пределы максимального размера очереди:
            // колбэк должен придти сразу с ошибкой и
            // должно прилететь событие on('queue_ready')
            babbler.sendCmd("delay", [],
                // onResult
                function(err, reply, cmd, params) {
                    test.ok(err instanceof Babbler.BblrQueueFullError, 
                        "Cmd should fail with 'Queue full' error: " + err);
                }
            );
            test.equal(babbler.queueLength, 3, "Queue length is still 3");
            test.ok(!babbler.queueReady, "Queue is FULL");
            
            // очистим очередь - должны прилететь ошибки на неотправленные команды
            // и событие on('queue_ready')
            babbler.discardQueue();
            
            // очередь опять пустая
            test.equal(babbler.queueLength, 0, "Queue is empty again");
            test.ok(babbler.queueReady, "Queue is READY");
            
            // отключаемся
            babbler.disconnect();
        });
        
        babbler.on('disconnected', function(err) {
            console.log("disconnected: " + err);
            // закончили здесь
            test.done();
        });
        
        // подключаемся к устройству - ожидаем колбэки
        babbler.connect("test:/dev/ttyUSB0", {dev: dev});
    },
    
    "Test sticked props": function(test) {
        // сколько будет тестов
        test.expect(7);
        
        var Babbler = require('../src/babbler');
        var babbler = new Babbler();
        
        // "клеим" свойства
        babbler.stickProp("name", "name", []);
        babbler.stickProp("manufacturer", "manufacturer", []);
        
        // несуществующее свойство
        test.equals(babbler.getStickedProp("namez"), undefined, "Device prop 'namez' was not defined");
        
        // значения не определены, пока не подключились
        test.equals(babbler.getStickedProp("name").val, undefined, "Device prop 'name' has no value yet");
        test.equals(babbler.getStickedProp("manufacturer").val, undefined, "Device prop 'manufacturer' has no value yet");
        
        var propCount = 0;
        babbler.on('prop', function(name, err, val) {
            propCount++;
            test.ok(true, "Got prop: " + name + "=" + val);
            
            // должны получить ровно два события - по одному на свойство
            if(propCount == 2) {
                test.equals(babbler.getStickedProp("name").val, "Babbler fake device", "Device prop 'name' got value");
                test.equals(babbler.getStickedProp("manufacturer").val, "sadr0b0t", "Device prop 'manufacturer' got value");
                
                babbler.disconnect();
            }
        });
        
        babbler.on('disconnected', function(err) {
            // закончили здесь
            test.done();
        });
        
        // подключаемся к устройству - ожидаем колбэки
        babbler.connect(portName);
    },
    
    "Test sticked props poll": function(test) {
        // сколько будет тестов
        test.expect(8);
        
        var Babbler = require('../src/babbler');
        var babbler = new Babbler();
        var dev = new BabblerFakeDevice("/dev/ttyUSB0");
        
        // "клеим" свойство name, опрашиваем раз в полсекунды
        babbler.stickProp("name", "name", [], 500);
        
        // значение не определено, пока не подключились
        test.equals(babbler.getStickedProp("name").val, undefined, "Device prop 'name' has no value yet");
        
        var callCount = 0;
        babbler.on('prop', function(name, err, val) {
            callCount++;
            if(callCount == 1) {
                test.equals(val, "Babbler fake device", "Device prop 'name' has initial value");
                test.equals(babbler.getStickedProp("name").val, "Babbler fake device",
                    "Device prop 'name' has initial value (getStickedProp)");
                
                // меняем значение на устройстве
                dev.setName("new fake name");
                // сохраненное значение не поменялось до тех пор, пока не отправлена команда
                // и не получен ответ с новым значением
                test.equals(babbler.getStickedProp("name").val, "Babbler fake device",
                    "Device prop 'name' still has initial value");
            } else if(callCount == 2) {
                test.equals(val, "new fake name", "Device prop 'name' has changed");
                test.equals(babbler.getStickedProp("name").val, "new fake name",
                    "Device prop 'name' has changed (getStickedProp)");
                    
                // еще раз поменяем значение
                dev.setName("another new fake name");
            } else if(callCount == 3) {
                test.equals(val, "another new fake name", "Device prop 'name' has changed again");
                test.equals(babbler.getStickedProp("name").val, "another new fake name",
                    "Device prop 'name' has changed again (getStickedProp)");
                
                // и на этом хватит
                babbler.disconnect();
            }
        });
        
        babbler.on('disconnected', function(err) {
            // закончили здесь
            test.done();
        });
        
        // подключаемся к устройству - ожидаем колбэки
        babbler.connect("test:/dev/ttyUSB0", {dev: dev});
    },
    
    "Test sticked prop request": function(test) {
        // сколько будет тестов
        test.expect(8);
        
        var Babbler = require('../src/babbler');
        var babbler = new Babbler();
        var dev = new BabblerFakeDevice("/dev/ttyUSB0");
        
        // "клеим" свойство name
        babbler.stickProp("name", "name", []);
        
        // значение не определено, пока не подключились
        test.equals(babbler.getStickedProp("name").val, undefined, "Device prop 'name' has no value yet");
        
        var callCount = 0;
        var gotProp = false;
        babbler.on('prop', function(name, err, val) {
            callCount++;
            if(callCount == 1) {
                test.equals(val, "Babbler fake device", "Device prop 'name' has initial value");
                test.equals(babbler.getStickedProp("name").val, "Babbler fake device",
                    "Device prop 'name' has initial value (getStickedProp)");
                
                // меняем значение на устройстве
                dev.setName("new fake name");
                // сохраненное значение не поменялось до тех пор, пока не отправлена команда
                // и не получен ответ с новым значением
                test.equals(babbler.getStickedProp("name").val, "Babbler fake device",
                    "Device prop 'name' still has initial value");
                
                // запросим новое значение свойства с опечаткой в имени
                babbler.requestStickedProp("namez", function(err, val) {
                    test.ok(err instanceof Babbler.BblrNoSuchStickedPropError,
                        "No such sticked prop: 'namez'");
                });
                
                // запросим новое значение свойства вручную
                babbler.requestStickedProp("name", function(err, val) {
                    test.equals(val, "new fake name",
                        "Device prop 'name' has changed (requestStickedProp:callback)");
                    
                    // не определено, что будет раньше:
                    // колбэк requestStickedProp или событие on('prop')
                    if(!gotProp) {
                        gotProp = true;
                    } else {
                        babbler.disconnect();
                    }
                });
            } else if(callCount == 2) {
                // 2е событие от requestStickedProp
                test.equals(val, "new fake name", "Device prop 'name' has changed");
                test.equals(babbler.getStickedProp("name").val, "new fake name",
                    "Device prop 'name' has changed (getStickedProp)");
                
                // не определено, что будет раньше:
                // колбэк requestStickedProp или событие on('prop')
                if(!gotProp) {
                    gotProp = true;
                } else {
                    babbler.disconnect();
                }
            }
        });
        
        babbler.on('disconnected', function(err) {
            // закончили здесь
            test.done();
        });
        
        // подключаемся к устройству - ожидаем колбэки
        babbler.connect("test:/dev/ttyUSB0", {dev: dev});
    }
};

//////////////////
// запускаем тесты
var reporter = require('nodeunit').reporters.verbose;
reporter.run(['test']);

