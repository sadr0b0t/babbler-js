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
Для разработки
Версии - x.y.z:
z - патчи без изменений API, ломающих клиентский код (исправления ошибок, мелкие улучшения)
y - эволюционные улучшения и развитие кодовой базы, изменения в API, ломающие клиентский код
x - достаточное количество новых возможностей для смены главной версии

Стратегия git при обновлении версии:
- z: таг (релиз на гитхабе) babbler-js-vx.y.z
- y: бранч babbler-js-vx.y.0 + таг автоматом
- x: бранч babbler-js-vx.0.0 + таг автоматом

