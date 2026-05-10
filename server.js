const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// === ХРАНИЛИЩА В ПАМЯТИ ===
let currentTrap = null;     
let lastResult = null;      
let globalArticles = [
    {
        id: "promo",
        title: "Портал запущен!",
        desc: "Система готова к работе.",
        content: "Все модули CtalkeP активированы. 3D-Паркур успешно интегрирован в систему!"
    }
];
let chatMessages = [];      

// === МУЛЬТИПЛЕЕР ИГРЫ (ОНЛАЙН КООРДИНАТЫ) ===
let onlinePlayers = {}; // { nickname: { x, y, z, rx, ry, isJumping, lastSeen } }

// Очистка неактивных игроков из сессии паркура (кто не слал координаты более 7 секунд)
setInterval(() => {
    const now = Date.now();
    for (const nick in onlinePlayers) {
        if (now - onlinePlayers[nick].lastSeen > 7000) {
            delete onlinePlayers[nick];
        }
    }
}, 3000);

// === ГЕНЕРАЦИЯ ОДИНАКОВОЙ КАРТЫ ДЛЯ ВСЕХ ИГРОКОВ ===
// Генерируем 50 платформ со строгими расчетами расстояния, чтобы прыжки всегда были возможны
let parkourSeed = 12345;
function seededRandom() {
    let x = Math.sin(parkourSeed++) * 10000;
    return x - Math.floor(x);
}

let parkourPlatforms = [];
function generateMap() {
    parkourPlatforms = [];
    // Стартовая платформа (Спавн)
    parkourPlatforms.push({ x: 0, y: 0, z: 0, w: 6, h: 1, d: 6, color: "#3b82f6" });
    
    let currentX = 0;
    let currentY = 0;
    let currentZ = -6;

    for (let i = 0; i < 60; i++) {
        // Вычисляем смещение. Прыжок на ПК/телефоне максимум 4.5 единицы по горизонтали и 1.2 по вертикали
        let dx = (seededRandom() - 0.5) * 4; // влево/вправо
        let dy = (seededRandom() - 0.3) * 1.5; // вверх/вниз
        let dz = -(seededRandom() * 3 + 2.5); // строго вперед (от -2.5 до -5.5 метров)

        currentX += dx;
        currentY += dy;
        currentZ += dz;

        // Ограничиваем резкие перепады высоты для играбельности
        if (currentY < -5) currentY = -3;
        if (currentY > 7) currentY = 5;

        // Разноцветные неоновые цвета для платформ
        const colors = ["#ef4444", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4"];
        const color = colors[Math.floor(seededRandom() * colors.length)];

        parkourPlatforms.push({
            id: i,
            x: parseFloat(currentX.toFixed(2)),
            y: parseFloat(currentY.toFixed(2)),
            z: parseFloat(currentZ.toFixed(2)),
            w: parseFloat((seededRandom() * 2 + 1.5).toFixed(2)), // ширина платформы
            h: 0.5,
            d: parseFloat((seededRandom() * 2 + 1.5).toFixed(2)), // глубина платформы
            color: color
        });
    }
}
generateMap();

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
        
        /* Стили для сенсорных джойстиков на смартфонах */
        .joystick-zone {
            touch-action: none;
            user-select: none;
        }
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
                        <input type="text" id="chatMessage" placeholder="Сообщение..." class="flex-grow bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none">
                        <button onclick="sendMessage()" class="bg-purple-600 hover:bg-purple-700 px-4 rounded-lg text-sm font-bold text-white transition">Отправить</button>
                    </div>
                </div>

                <div class="bg-[#0a0a0a] p-5 rounded-xl border border-zinc-900 neon-border">
                    <h2 class="text-md font-bold mb-2 text-zinc-400 tracking-wide uppercase">Активность профиля</h2>
                    <div id="statsBox" class="text-sm"></div>
                </div>
            </div>
        </main>

        <footer class="text-center p-4 text-xs text-zinc-700 border-t border-zinc-950 bg-[#030303]">
            CtalkeP Portal.
        </footer>
    </div>

    <div id="gameView" class="hidden fixed inset-0 z-50 bg-[#020202] select-none flex flex-col">
        <div class="absolute top-4 left-4 right-4 flex justify-between items-center z-50 pointer-events-none">
            <div class="bg-black/80 px-4 py-2 rounded-lg border border-zinc-800 flex items-center gap-3 pointer-events-auto">
                <span class="text-xs text-zinc-400">Игрок:</span>
                <span class="text-sm font-bold text-blue-400" id="gameUserNick">Аноним</span>
                <span class="text-xs bg-red-900/40 text-red-400 px-2 py-0.5 rounded border border-red-900/40" id="pingIndicator">СЕТЬ: OK</span>
            </div>
            <button onclick="exitParkourGame()" class="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition pointer-events-auto shadow-lg shadow-red-900/20">
                ВЫЙТИ В ЛОББИ
            </button>
        </div>

        <div id="threeJsContainer" class="w-full h-full"></div>

        <div id="mobileControls" class="hidden absolute inset-0 pointer-events-none select-none">
            <div id="joystickBoundary" class="absolute bottom-10 left-10 w-32 h-32 bg-white/5 border border-white/10 rounded-full flex items-center justify-center pointer-events-auto joystick-zone">
                <div id="joystickKnob" class="w-12 h-12 bg-blue-500/80 rounded-full transition-all duration-75"></div>
            </div>

            <div id="jumpButton" class="absolute bottom-12 right-12 w-20 h-20 bg-blue-600/60 active:bg-blue-600/90 border border-blue-500 rounded-full flex items-center justify-center pointer-events-auto shadow-lg shadow-blue-500/20 active:scale-95 transition">
                <span class="text-white text-xs font-bold uppercase tracking-wider">UP</span>
            </div>
            
            <div class="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-zinc-600">Двигайте правой половиной экрана для обзора</div>
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
        let myNickname = localStorage.getItem('nickname') || 'Аноним';
        let myBalance = parseFloat(localStorage.getItem('balance')) || 0.0;
        let hasTag = localStorage.getItem('hasTag') === 'true';
        let dailyVisits = parseInt(localStorage.getItem('dailyVisits')) || 0;
        let lastVisitDate = localStorage.getItem('lastVisitDate');
        let localArticles = JSON.parse(localStorage.getItem('saved_articles')) || [];

        document.getElementById('nicknameInput').value = myNickname === 'Аноним' ? '' : myNickname;
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
            myNickname = input || 'Аноним';
            localStorage.setItem('nickname', myNickname);
            updateUI();
            alert('Профиль обновлен локально!');
        }

        // ПОИСК ФИО
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

        // УЗНАТЬ IP
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
                        trapStatus.innerHTML = '<strong>ПЕРЕХОД ЗАФИКСИРОВАН!</strong><br>IP: ' + statusData.data.ip + '<br>Устройство: ' + statusData.data.device.substring(0,60) + '...';
                    }
                }, 2000);
            }
        }

        // СТАТЬИ
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
            updateUI();
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

        // ЧАТ ОПРОСЫ
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
            updateUI();
            alert('Тэг куплен!');
        }

        loadArticles();
        fetchMessages();

        // ==========================================
        //       🎨 МОДУЛЬ 3D ОНЛАЙН ПАРКУРА
        // ==========================================
        let scene, camera, renderer;
        let platforms = [];
        let otherPlayers = {}; // Модели других игроков на сцене: { nickname: { group, headMesh } }
        let isGameActive = false;
        let multiplayerInterval = null;

        // Физика и состояние локального игрока
        let playerPos = { x: 0, y: 1.5, z: 0 };
        let playerVelocity = { x: 0, y: 0, z: 0 };
        let cameraRot = { pitch: 0, yaw: 0 }; // Углы поворота камеры
        let isGrounded = false;
        const gravity = -18.5; // Сила притяжения
        const jumpStrength = 7.8; // Сила прыжка
        const moveSpeed = 6.2; // Скорость бега

        // Кнопки клавиатуры
        let keys = { w: false, a: false, s: false, d: false, space: false };

        // Состояние сенсорного управления
        let isTouchDevice = false;
        let joystickActive = false;
        let joystickStart = { x: 0, y: 0 };
        let joystickMove = { x: 0, y: 0 };
        let touchMoveVector = { x: 0, z: 0 };

        // Инициализация детекции тачскрина
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
            isTouchDevice = true;
        }

        function startParkourGame() {
            document.getElementById('lobbyView').classList.add('hidden');
            document.getElementById('gameView').classList.remove('hidden');
            document.getElementById('gameUserNick').textContent = myNickname;
            isGameActive = true;

            if (isTouchDevice) {
                document.getElementById('mobileControls').classList.remove('hidden');
                setupMobileEvents();
            }

            init3D();
            setupPhysicsEvents();
            startMultiplayerLoop();
        }

        function exitParkourGame() {
            isGameActive = false;
            clearInterval(multiplayerInterval);
            
            // Удаляем слушатели событий физики
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('resize', onWindowResize);

            // Очищаем DOM сцены
            const container = document.getElementById('threeJsContainer');
            container.innerHTML = '';

            document.getElementById('gameView').classList.add('hidden');
            document.getElementById('lobbyView').classList.remove('hidden');
            updateUI();
        }

        function init3D() {
            const container = document.getElementById('threeJsContainer');
            
            // Сцена
            scene = new THREE.Scene();
            scene.fog = new THREE.FogExp2('#050505', 0.012);

            // Камера (fov, aspect, near, far)
            camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.set(playerPos.x, playerPos.y, playerPos.z);

            // Рендерер
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.setClearColor('#050505', 1);
            container.appendChild(renderer.domElement);

            // Освещение (красивое неоновое заполнение)
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
            scene.add(ambientLight);

            const dirLight = new THREE.DirectionalLight(0x3b82f6, 1);
            dirLight.position.set(10, 40, 10);
            scene.add(dirLight);

            // Построение карты платформ (подгружаем с сервера)
            fetch('/api/parkour/map')
                .then(res => res.json())
                .then(mapPlatforms => {
                    buildMap(mapPlatforms);
                });

            // Эффект бездны — сетка на самом дне
            const gridHelper = new THREE.GridHelper(400, 50, 0xff0055, 0x111111);
            gridHelper.position.y = -15;
            scene.add(gridHelper);

            // Запускаем игровой цикл анимации
            let lastTime = performance.now();
            function animate(time) {
                if (!isGameActive) return;
                requestAnimationFrame(animate);

                const dt = Math.min((time - lastTime) / 1000, 0.1); // защита от просадки кадров
                lastTime = time;

                updatePlayerPhysics(dt);
                updateCamera();
                renderOtherPlayers();

                renderer.render(scene, camera);
            }
            requestAnimationFrame(animate);

            window.addEventListener('resize', onWindowResize);
        }

        function buildMap(mapData) {
            // Очищаем старые платформы
            platforms.forEach(p => scene.remove(p.mesh));
            platforms = [];

            mapData.forEach(p => {
                const geometry = new THREE.BoxGeometry(p.w, p.h, p.d);
                
                // Светящийся неоновый материал
                const material = new THREE.MeshPhongMaterial({
                    color: new THREE.Color(p.color),
                    emissive: new THREE.Color(p.color),
                    emissiveIntensity: 0.35,
                    shininess: 100
                });
                
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(p.x, p.y, p.z);
                scene.add(mesh);

                platforms.push({
                    mesh: mesh,
                    x: p.x, y: p.y, z: p.z,
                    w: p.w, h: p.h, d: p.d
                });
            });

            // Возвращаем игрока на спавн
            respawnPlayer();
        }

        // === ФИЗИКА И ПЕРЕМЕЩЕНИЕ ===
        function setupPhysicsEvents() {
            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('keyup', handleKeyUp);
            // Для поворота камеры на ПК — при зажатой левой кнопке мыши
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

        let isPointerLocked = false;
        function handleMouseMove(e) {
            // Двигаем камеру только если зажата мышка или активен PointerLock
            if (e.buttons === 1 || document.pointerLockElement) {
                const sens = 0.003;
                cameraRot.yaw -= e.movementX * sens;
                cameraRot.pitch -= e.movementY * sens;

                // Лимитируем наклон головы вверх-вниз (90 градусов)
                cameraRot.pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, cameraRot.pitch));
            }
        }

        function respawnPlayer() {
            playerPos = { x: 0, y: 1.5, z: 0 };
            playerVelocity = { x: 0, y: 0, z: 0 };
            cameraRot = { pitch: 0, yaw: 0 };
        }

        function updatePlayerPhysics(dt) {
            // ПРИТЯЖЕНИЕ
            playerVelocity.y += gravity * dt;

            // ДВИЖЕНИЕ НА ПК И МОБИЛЬНЫХ
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

            // Направление движения с учетом поворота взгляда
            const sin = Math.sin(cameraRot.yaw);
            const cos = Math.cos(cameraRot.yaw);
            
            let worldMoveX = moveX * cos - moveZ * sin;
            let worldMoveZ = moveX * sin + moveZ * cos;

            // Нормализуем скорость по диагонали
            const length = Math.sqrt(worldMoveX * worldMoveX + worldMoveZ * worldMoveZ);
            if (length > 0) {
                worldMoveX = (worldMoveX / length) * moveSpeed;
                worldMoveZ = (worldMoveZ / length) * moveSpeed;
            }

            playerPos.x += worldMoveX * dt;
            playerPos.z += worldMoveZ * dt;
            playerPos.y += playerVelocity.y * dt;

            // ПРОВЕРКА КОЛЛИЗИЙ С ПЛАТФОРМАМИ (СТОЛКНОВЕНИЕ СВЕРХУ)
            isGrounded = false;
            const playerHeight = 1.3;
            const playerRadius = 0.45;

            platforms.forEach(p => {
                // Прямоугольная граница коллизии платформы
                const minX = p.x - p.w/2 - playerRadius;
                const maxX = p.x + p.w/2 + playerRadius;
                const minZ = p.z - p.d/2 - playerRadius;
                const maxZ = p.z + p.d/2 + playerRadius;

                if (playerPos.x > minX && playerPos.x < maxX && playerPos.z > minZ && playerPos.z < maxZ) {
                    const platformTop = p.y + p.h/2;
                    // Проверяем находится ли игрок на уровне платформы
                    if (playerPos.y - playerHeight <= platformTop && playerPos.y - playerHeight >= platformTop - 0.5 && playerVelocity.y <= 0) {
                        playerPos.y = platformTop + playerHeight;
                        playerVelocity.y = 0;
                        isGrounded = true;
                    }
                }
            });

            // ПРЫЖОК
            if (isGrounded && (keys.space || mobileJumpPressed)) {
                playerVelocity.y = jumpStrength;
                isGrounded = false;
                mobileJumpPressed = false; // гасим мобильный триггер
            }

            // ПАДЕНИЕ В БЕЗДНУ (СПАВН)
            if (playerPos.y < -13) {
                respawnPlayer();
            }
        }

        function updateCamera() {
            camera.position.set(playerPos.x, playerPos.y, playerPos.z);
            
            // Направление взгляда по углам
            const target = new THREE.Vector3();
            target.x = playerPos.x + Math.sin(cameraRot.yaw) * Math.cos(cameraRot.pitch);
            target.y = playerPos.y + Math.sin(cameraRot.pitch);
            target.z = playerPos.z - Math.cos(cameraRot.yaw) * Math.cos(cameraRot.pitch);
            
            camera.lookAt(target);
        }

        // === МОБИЛЬНЫЙ СЕНСОРНЫЙ ДЖОЙСТИК (УДОБНЫЙ И ПЛАВНЫЙ) ===
        let mobileJumpPressed = false;
        function setupMobileEvents() {
            const joystickBoundary = document.getElementById('joystickBoundary');
            const joystickKnob = document.getElementById('joystickKnob');
            const jumpButton = document.getElementById('jumpButton');

            // Кнопка прыжка
            jumpButton.addEventListener('touchstart', (e) => {
                e.preventDefault();
                mobileJumpPressed = true;
            });

            // Обзор свайпами по правой половине экрана
            let touchStartPoint = { x: 0, y: 0 };
            window.addEventListener('touchstart', (e) => {
                // Берем только тачи на правой стороне экрана
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
                        cameraRot.pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, cameraRot.pitch));

                        touchStartPoint.x = e.touches[i].clientX;
                        touchStartPoint.y = e.touches[i].clientY;
                    }
                }
            });

            // Движение левого джойстика
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
                
                const limit = 50; // радиус хода ручки
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                let moveX = dx;
                let moveY = dy;
                if (dist > limit) {
                    moveX = (dx / dist) * limit;
                    moveY = (dy / dist) * limit;
                }

                joystickKnob.style.transform = \`translate(\${moveX}px, \${moveY}px)\`;

                // Записываем вектор движения
                touchMoveVector.x = moveX / limit;
                touchMoveVector.z = moveY / limit;
            });

            joystickBoundary.addEventListener('touchend', () => {
                joystickActive = false;
                joystickKnob.style.transform = 'translate(0px, 0px)';
                touchMoveVector = { x: 0, z: 0 };
            });
        }

        // === ОНЛАЙН СИНХРОНИЗАЦИЯ СЕРВЕРА (МУЛЬТИПЛЕЕР) ===
        function startMultiplayerLoop() {
            multiplayerInterval = setInterval(async () => {
                try {
                    // Отправляем свои координаты и углы головы на сервер
                    const res = await fetch('/api/parkour/sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            nickname: myNickname,
                            x: parseFloat(playerPos.x.toFixed(2)),
                            y: parseFloat(playerPos.y.toFixed(2)),
                            z: parseFloat(playerPos.z.toFixed(2)),
                            ry: cameraRot.yaw, // Поворот тела
                            rx: cameraRot.pitch // Наклон головы вверх/вниз
                        })
                    });
                    const serverPlayers = await res.json();
                    updateOtherPlayersData(serverPlayers);
                    document.getElementById('pingIndicator').textContent = "СЕТЬ: OK";
                    document.getElementById('pingIndicator').className = "text-xs bg-green-900/40 text-green-400 px-2 py-0.5 rounded border border-green-900/40";
                } catch (e) {
                    document.getElementById('pingIndicator').textContent = "СЕТЬ: СБОЙ";
                    document.getElementById('pingIndicator').className = "text-xs bg-red-900/40 text-red-400 px-2 py-0.5 rounded border border-red-900/40";
                }
            }, 100); // 10 раз в секунду
        }

        function updateOtherPlayersData(serverPlayers) {
            // Удаляем вышедших игроков
            for (const nick in otherPlayers) {
                if (!serverPlayers[nick]) {
                    scene.remove(otherPlayers[nick].group);
                    delete otherPlayers[nick];
                }
            }

            // Добавляем новых или обновляем текущих
            for (const nick in serverPlayers) {
                if (nick === myNickname) continue; // Себя не рисуем

                const pData = serverPlayers[nick];

                if (!otherPlayers[nick]) {
                    // Создаем красивую 3D модельку игрока
                    const group = new THREE.Group();

                    // Тело (Неоновый цилиндр)
                    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8);
                    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x3b82f6, emissive: 0x3b82f6, emissiveIntensity: 0.2 });
                    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
                    bodyMesh.position.y = 0.6;
                    group.add(bodyMesh);

                    // Свечение у головы
                    const headGeo = new THREE.SphereGeometry(0.28, 8, 8);
                    const headMat = new THREE.MeshPhongMaterial({ color: 0xff00ff, emissive: 0xff00ff, emissiveIntensity: 0.5 });
                    const headMesh = new THREE.Mesh(headGeo, headMat);
                    headMesh.position.y = 1.35;
                    group.add(headMesh);

                    scene.add(group);

                    otherPlayers[nick] = {
                        group: group,
                        headMesh: headMesh,
                        targetPos: { x: pData.x, y: pData.y, z: pData.z },
                        targetRy: pData.ry,
                        targetRx: pData.rx
                    };
                } else {
                    // Обновляем цель для интерполяции
                    otherPlayers[nick].targetPos = { x: pData.x, y: pData.y, z: pData.z };
                    otherPlayers[nick].targetRy = pData.ry;
                    otherPlayers[nick].targetRx = pData.rx;
                }
            }
        }

        // Сглаживание движения игроков
        function renderOtherPlayers() {
            const lerpFactor = 0.2; // Плавное скольжение
            for (const nick in otherPlayers) {
                const player = otherPlayers[nick];
                const group = player.group;

                // Плавно двигаем к целевым координатам
                group.position.x += (player.targetPos.x - group.position.x) * lerpFactor;
                group.position.y += (player.targetPos.y - 1.4 - group.position.y) * lerpFactor; // Фикс высоты
                group.position.z += (player.targetPos.z - group.position.z) * lerpFactor;

                // Поворачиваем тело к углу yaw
                group.rotation.y += (player.targetRy - group.rotation.y) * lerpFactor;

                // Наклоняем голову игрока вверх/вниз
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
                const data = { ip: "${ip}", device: navigator.userAgent, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
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
    const articleId = id || Math.random().toString(36).substring(2, 10);
    globalArticles.push({ id: articleId, title, desc: desc || "Без описания", content });
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

// === API КАРТЫ И МУЛЬТИПЛЕЕРА ИГРЫ ===
app.get('/api/parkour/map', (req, res) => {
    res.json(parkourPlatforms);
});

app.post('/api/parkour/sync', (req, res) => {
    const { nickname, x, y, z, rx, ry } = req.body;
    if (!nickname) return res.status(400).json({ error: "No Nick" });

    onlinePlayers[nickname] = {
        x: x || 0,
        y: y || 0,
        z: z || 0,
        rx: rx || 0, // наклон головы
        ry: ry || 0, // поворот тела
        lastSeen: Date.now()
    };

    // Отправляем в ответ координаты всех остальных игроков
    res.json(onlinePlayers);
});

app.listen(PORT, () => {
    console.log(`[CtalkeP] Портал и Паркур запущены на порту: ${PORT}`);
});
