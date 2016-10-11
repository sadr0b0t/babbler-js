# babbler.js
JavaScript client library to communicate with Arduino devices running firmware based on babbler_h library.

babbler_h library for Arduino/ChipKIT boards:
https://github.com/1i7/babbler_h

See babbler.js material-ui widgets
https://github.com/1i7/babbler-js-material-ui

and babbler-js-demo
https://github.com/1i7/babbler-js-demo

for usage examples.

Demo application video in action:
https://www.youtube.com/watch?v=uLHPr1sS558

<a href="http://www.youtube.com/watch?feature=player_embedded&v=uLHPr1sS558
" target="_blank"><img src="http://img.youtube.com/vi/uLHPr1sS558/0.jpg" 
alt="Babbler.js управление Arduino через последовательный порт" width="240" height="180" border="10" /></a>


## Basic usage:

~~~javascript
var BabblerDevice = require('babbler-js');

var babblerDevice = new BabblerDevice();

babblerDevice.on('connected', function() {
    console.log("connected");
    
    console.log("send cmd: ping");
    babblerDevice.sendCmd("ping", [],
        // onReply
        function(cmd, params, reply) {
            console.log("got reply on '" + cmd + " " + params + "': " + reply);
        },
        // onError
        function(cmd, params, err) {
            console.log("fail with '" + cmd + " " + params + "': " + err);
        }
    );
    
    console.log("send cmd: help --list");
    babblerDevice.sendCmd("help", ["--list"],
        // onReply
        function(cmd, params, reply) {
            console.log("got reply on '" + cmd + " " + params + "': " + reply);
        },
        // onError
        function(cmd, params, err) {
            console.log("fail with '" + cmd + " " + params + "': " + err);
        }
    );
});

babblerDevice.on('disconnected', function(error) {
    console.log("disconnected" + (error != undefined ? ": " + error : ""));
});

babblerDevice.connect("/dev/ttyUSB0");
//babblerDevice.connect("/dev/ttyUSB0", {baudRate: 9600});

~~~

---
## Для разработки
Версии - x.y.z:
- z - патчи без изменений API, ломающих клиентский код (исправления ошибок, мелкие улучшения)
- y - эволюционные улучшения и развитие кодовой базы, изменения в API, ломающие клиентский код
- x - достаточное количество новых возможностей для смены главной версии

Стратегия git при обновлении версии: 
- создаём релиз (тэг) vx.y.z

### Публикация в npm
https://docs.npmjs.com/getting-started/publishing-npm-packages

~~~bash
npm publish
~~~

### перед публикацией

- Обновить версию командой

vx.y.z -> vx.y.(z+1)
~~~bash
npm version patch
~~~
vx.y.z -> vx.(y+1).z
~~~bash
npm version minor
~~~
vx.y.z -> v(x+1).y.z
~~~bash
npm version minor
~~~

(внесет исправление в package.json и сразу сделает коммит в репозитории)

или исправитьpackage.json и сделать коммит вручную

- Удалить README.md~ (иначе он попадет в архив)

- Проверить релиз - создать локальный архив babbler-js-0.1.0.tgz
~~~bash
npm pack
~~~

- конвертировать библиотеку в CommonJS src/babbler.js -> lib/babbler.js (перед публикацией выполняется автоматом)
~~~bash
npm run-script build
~~~
или 
~~~bash
./scripts/build.sh
~~~

