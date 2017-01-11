// Тесты с nodeunit
//https://github.com/caolan/nodeunit


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
            test.ok(err == undefined, "No errors");
            
            // закончили здесь
            test.done();
        });
        
        // подключаемся к устройству - ожидаем колбэки
        babbler.connect("/dev/ttyUSB0");
    },
    "Test commands": function(test) {
        // сколько будет тестов
        test.expect(13);
        
        var BabblerDevice = require('../src/babbler');
        var babbler = new BabblerDevice();
        
        babbler.on('connected', function() {
            test.ok(true, "Connected ok");
            
            // отправим существующую корректную команду
            babbler.sendCmd("ping", [],
                // onReply
                function(cmd, params, reply) {
                    test.ok(true, "Got reply");
                    test.equal(reply, "ok", "And reply is 'ok'");
                    
                    test.equal(cmd, "ping", "cmd is 'ping'");
                    test.deepEqual(params, [], "and params are empty array");
                },
                // onError
                function(cmd, params, err) {
                    test.ok(false, "No errors");
                }
            );
            
            // отправим несуществующую некорректную команду
            babbler.sendCmd("pingzzz", ["hello"],
                // onReply
                function(cmd, params, reply) {
                    test.ok(true, "Got reply");
                    test.equal(reply, "dontunderstand", "And reply is 'dontunderstand'");
                    
                    test.equal(cmd, "pingzzz", "cmd is 'pingzzz'");
                    test.deepEqual(params, ["hello"], "and params are ['hello'] array");
                    
                    // отключаемся
                    babbler.disconnect();
                },
                // onError
                function(cmd, params, err) {
                    test.ok(false, "No errors");
                }
            );
            
            // отправим команду после отключения
            babbler.sendCmd("ping", [],
                // onReply
                function(cmd, params, reply) {
                    test.ok(false, "No reply after disconnect");
                },
                // onError
                function(cmd, params, err) {
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
        babbler.connect("/dev/ttyUSB0");
    }
};

//////////////////
// запускаем тесты
var reporter = require('nodeunit').reporters.verbose;
reporter.run(['test']);

