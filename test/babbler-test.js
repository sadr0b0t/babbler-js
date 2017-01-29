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
    
    this.opened = false;

    /** Устройство готово получать данные */
    this.ready = function() {
        return this.opened;
    }
    
    // SerialPort.open
    this.open = function(callback) {
        if(portName === "/dev/ttyUSB0") {
            this.opened = true;
            callback();
            this.emit('open');
        } else {
            callback(new Error("Dev not found: " + portName));
        }
    }
    
    // SerialPort.close
    this.close = function(callback) {
        this.opened = false;
        callback();
        this.emit('disconnect');
    }
    
    // SerialPort.write
    this.write = function(data, callback) {
        if(!this.opened) {
            callback(new Error("Dev not opened"));
        } else {
            // парсим строку в объект
                cmd = JSON.parse(data);
                
                var reply = "dontunderstand";
                var delay = 100;
                if(cmd.cmd === "ping") {
                    reply = "ok";
                } else if(cmd.cmd === "help") {
                    reply = "ping help";
                } else if(cmd.cmd === "delay") {
                    // долгая команда
                    if(cmd.params != undefined && cmd.params.length > 0) {
                        delay = parseInt(cmd.params[0], 10);
                    } else {
                        delay = 6000;
                    }
                    reply = "ok";
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
}
inherits(BabblerFakeDevice, EventEmitter);


var portName = "test:/dev/ttyUSB0";
//var portName = "serial:/dev/ttyUSB0";
//var portName = "/dev/ttyUSB0";

exports.ConnectionLifecycle = {

    "'connecting' event": function(test) {
        // сколько будет тестов
        test.expect(1);
        
        var BabblerDevice = require('../src/babbler');
        var babbler = new BabblerDevice();
        
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
        
        var BabblerDevice = require('../src/babbler');
        var babbler = new BabblerDevice();
        
        babbler.on('connected', function() {
            test.ok(false, "Should not connect here");
        });
        
        babbler.on('connecting', function() {
            test.ok(true, "Should try to connect here");
        });

        babbler.on('disconnected', function(err) {
            test.ok(true, "Disconnected here");
            test.ok(err != undefined, "Error defined: " + err.message);
            
            // закончили здесь
            test.done();
        });
        
        // подключаемся к устройству - ожидаем колбэки
        babbler.connect("/dev/xxx");
    },
    "'connected'-'disconnected' events": function(test) {
        // сколько будет тестов
        test.expect(3);
        
        var BabblerDevice = require('../src/babbler');
        var babbler = new BabblerDevice();
        
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
        
        var BabblerDevice = require('../src/babbler');
        var babbler = new BabblerDevice();
        
        babbler.on('connected', function() {
            test.equals(babbler.deviceName, portName, "Dev name should be: " + portName);
            test.equals(babbler.deviceStatus, "connected", "Dev status should be: 'connected'");
            test.equals(babbler.deviceError, undefined, "Dev err should be: undefined");
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
    "Test commands": function(test) {
        // сколько будет тестов
        test.expect(15);
        
        var BabblerDevice = require('../src/babbler');
        var babbler = new BabblerDevice();
        
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
        
        var BabblerDevice = require('../src/babbler');
        var babbler = new BabblerDevice();
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
            babbler.sendCmd("delay", ["6000"],
                // onResult
                function(err, reply, cmd, params) {
                    test.ok(err instanceof BabblerDevice.BblrReplyTimeoutError,
                        "Cmd should fail with 'Timeout' error: " + err);
                    test.equal(reply, undefined, "And reply is 'undefined'");
                }
            );
            
            // отправим ту же команду, только с маленьким таймаутом, - 
            // убедимся, что придет ответ без ошибки
            expectReplyTimeoutFalse = true;
            babbler.sendCmd("delay", ["3000"],
                // onResult
                function(err, reply, cmd, params) {
                    test.equals(err, undefined, "No errors: " + err);
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
    "Manage queue": function(test) {
        // сколько будет тестов
        test.expect(17);
        
        var BabblerDevice = require('../src/babbler');
        var babbler = new BabblerDevice();
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
                    test.ok(err instanceof BabblerDevice.BblrDiscardedError,
                        "Cmd should fail with 'Discarded' error: " + err);
                }
            );
            test.equal(babbler.queueLength, 1, "Queue length is 1");
            babbler.sendCmd("delay", [],
                // onResult
                function(err, reply, cmd, params) {
                    test.ok(err instanceof BabblerDevice.BblrDiscardedError,
                        "Cmd should fail with 'Discarded' error: " + err);
                }
            );
            test.equal(babbler.queueLength, 2, "Queue length is 2");
            test.ok(babbler.queueReady, "Queue is READY");
            
            babbler.sendCmd("delay", [],
                // onResult
                function(err, reply, cmd, params) {
                    test.ok(err instanceof BabblerDevice.BblrDiscardedError,
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
                    test.ok(err instanceof BabblerDevice.BblrQueueFullError, 
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
    
};

//////////////////
// запускаем тесты
var reporter = require('nodeunit').reporters.verbose;
reporter.run(['test']);

