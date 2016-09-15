// https://habrahabr.ru/post/272075/

const electron = require('electron');
const app = electron.app;  // Модуль, контролирующий жизненный цикл нашего приложения.
const BrowserWindow = electron.BrowserWindow;  // Модуль, создающий браузерное окно.


// Опционально возможность отправки отчета о ошибках на сервер проекта Electron.
//electron.crashReporter.start();

// Определение глобальной ссылки на главное окно:
// если мы не определим глобально, окно будет закрыто автоматически, 
// когда объект JavaScript будет очищен сборщиком мусора.
var mainWindow = null;

// Завершаем приложение, когда закрыты все окна
app.on('window-all-closed', function() {
    // В OS X обычное поведение приложений и их menu bar
    // оставаться активными до тех пор, пока пользователь 
    // не закроет их явно комбинацией клавиш Cmd + Q
    if (process.platform != 'darwin') {
        app.quit();
    }
});

// Этот метод будет вызван, когда Electron закончит инициализацию 
// и будет готов к созданию браузерных окон
app.on('ready', function() {
    // Создаем окно браузера.
    mainWindow = new BrowserWindow({width: 800, height: 600});

    // и загружаем файл index.html нашего веб приложения.
    mainWindow.loadURL('file://' + __dirname + '/index.html');

    // Открываем DevTools.
    //mainWindow.webContents.openDevTools();

    // Этот метод будет выполнен, когда генерируется событие закрытия окна.
    mainWindow.on('closed', function() {
        // Удаляем ссылку на окно: если ваше приложение будет 
        // поддерживать несколько окон и вы будете хранить их в массиве, 
        // это время, когда нужно удалить соответствующий элемент.
        mainWindow = null;
    });
});

