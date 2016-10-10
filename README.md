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

~~~
npm publish
~~~

### перед публикацией

- Обновить версию командой

vx.y.z -> vx.y.(z+1)
~~~
npm version patch
~~~
vx.y.z -> vx.(y+1).z
~~~
npm version minor
~~~
vx.y.z -> v(x+1).y.z
~~~
npm version minor
~~~

(внесет исправление в package.json и сразу сделает коммит в репозитории)

или исправитьpackage.json и сделать коммит вручную

- Удалить README.md~ (иначе он попадет в архив)

- Проверить релиз - создать локальный архив babbler-js-0.1.0.tgz
~~~
npm pack
~~~

- конвертировать библиотеку в CommonJS src/babbler.js -> lib/babbler.js (перед публикацией выполняется автоматом)
~~~
npm run-script build
~~~
или 
~~~
./scripts/build.sh
~~~

