// Тесты с nodeunit
//https://github.com/caolan/nodeunit


exports.ConnectionLifecycle = {

    "'connecting' event": function(test) {
        // сколько будет тестов
        test.expect(1);
        
        var BabblerDevice = require('../src/babbler');
        var babbler = new BabblerDevice();

        babbler.on('connected', function() {
            test.ok(false, "Should not connect here");
        });
        
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
        test.expect(2);
        
        var BabblerDevice = require('../src/babbler');
        var babbler = new BabblerDevice();

        babbler.on('disconnected', function(error) {
            test.ok(true, "Disconnected here");
            test.ok(error != undefined, "Error defined: " + error.message);
            
            // закончили здесь
            test.done();
        });
        
        // подключаемся к устройству - ожидаем колбэки
        babbler.connect("/dev/xxx");
    }
};

//////////////////
// запускаем тесты
var reporter = require('nodeunit').reporters.verbose;
reporter.run(['test']);

