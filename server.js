const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Самопинг (Автопингер) для Render (каждые 10 минут)
const URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
setInterval(() => {
    http.get(URL, (res) => {
        console.log(`Auto-ping status: ${res.statusCode}`);
    }).on('error', (err) => {
        console.error('Ping error:', err.message);
    });
}, 600000); // 10 минут

// Отдаем клиенту встроенный HTML/JS
app.get('/', (req, res) => {
    res.send(clientHTML);
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let players = {};
let gameWon = false;
let winnerName = "";

wss.on('connection', (ws) => {
    let playerId = Math.random().toString(36).substring(2, 9);
    
    ws.on('message', (message) => {
        let data;
        try { data = JSON.parse(message); } catch(e) { return; }

        if (data.type === 'join') {
            players[playerId] = {
                id: playerId,
                name: data.name || "Player",
                x: 0, y: 0.8, z: 0,
                ry: 0, rx: 0, // ry - поворот тела, rx - наклон головы
                color: '#ffeb3b'
            };
            ws.send(JSON.stringify({ type: 'init', id: playerId, players, gameWon, winnerName }));
            broadcast({ type: 'playerJoined', player: players[playerId] });
        }
        
        if (data.type === 'move') {
            if (players[playerId]) {
                players[playerId].x = data.x;
                players[playerId].y = data.y;
                players[playerId].z = data.z;
                players[playerId].ry = data.ry;
                players[playerId].rx = data.rx;
                broadcast({ type: 'update', id: playerId, x: data.x, y: data.y, z: data.z, ry: data.ry, rx: data.rx }, playerId);
            }
        }

        if (data.type === 'chat') {
            if (players[playerId]) {
                broadcast({ type: 'chat', name: players[playerId].name, text: data.text });
            }
        }

        if (data.type === 'win') {
            if (!gameWon) {
                gameWon = true;
                winnerName = players[playerId] ? players[playerId].name : "Кто-то";
                broadcast({ type: 'win', name: winnerName });
            }
        }

        if (data.type === 'restart') {
            gameWon = false;
            winnerName = "";
            broadcast({ type: 'restart' });
        }
    });

    ws.on('close', () => {
        if (players[playerId]) {
            broadcast({ type: 'playerLeft', id: playerId });
            delete players[playerId];
        }
    });
});

function broadcast(data, excludeId = null) {
    let msg = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            // Если нужно исключить отправителя (например при движении для экономии трафика)
            if (excludeId && client === [...wss.clients][Object.keys(players).indexOf(excludeId)]) return;
            client.send(msg);
        }
    });
}

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// КЛИЕНТСКИЙ ИНТЕРФЕЙС И ИГРОВАЯ ЛОГИКА (HTML, CSS, THREE.JS)
const clientHTML = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>Backrooms Online</title>
    <style>
        body, html { margin: 0; padding: 0; overflow: hidden; width: 100%; height: 100%; font-family: 'Courier New', Courier, monospace; background: #000; user-select: none; }
        #canvas-container { width: 100%; height: 100%; display: block; }
        
        /* Меню авторизации */
        #auth-screen { position: absolute; top:0; left:0; width:100%; height:100%; background: #1a1a13; display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 100; color: #f0e68c; }
        #auth-screen h1 { font-size: 3rem; text-shadow: 0 0 10px #ffeb3b; margin-bottom: 20px; text-align: center; }
        #auth-screen input { padding: 12px 20px; font-size: 1.2rem; border: 2px solid #ffeb3b; background: #2b2b1f; color: #fff; text-align: center; margin-bottom: 20px; outline: none; border-radius: 5px; }
        #auth-screen button { padding: 12px 30px; font-size: 1.2rem; background: #ffeb3b; border: none; cursor: pointer; font-weight: bold; transition: 0.2s; border-radius: 5px; }
        #auth-screen button:hover { background: #fff; box-shadow: 0 0 15px #ffeb3b; }

        /* Таймер вверху */
        #timer-container { position: absolute; top: 15px; left: 50%; transform: translateX(-50%); color: #e0d070; font-size: 1.5rem; text-shadow: 2px 2px 4px #000; font-weight: bold; pointer-events: none; z-index: 10; }

        /* Чат */
        #chat-wrapper { position: absolute; top: 15px; left: 15px; width: 280px; max-height: 200px; display: flex; flex-direction: column; z-index: 10; }
        #chat-toggle { background: rgba(40,40,30,0.85); border: 1px solid #ffeb3b; color: #ffeb3b; padding: 8px 12px; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 8px; font-size: 0.9rem; border-radius: 4px; width: fit-content; }
        #chat-badge { width: 8px; height: 8px; background: red; border-radius: 50%; display: none; }
        #chat-box { display: none; background: rgba(20,20,15,0.9); border: 1px solid #ffeb3b; margin-top: 5px; border-radius: 4px; overflow: hidden; }
        #chat-messages { height: 120px; overflow-y: auto; padding: 8px; font-size: 0.85rem; color: #fff; word-break: break-all; }
        #chat-messages div { margin-bottom: 4px; border-bottom: 1px solid rgba(255,235,59,0.1); padding-bottom: 2px; }
        #chat-input-container { display: flex; border-top: 1px solid #ffeb3b; }
        #chat-input { flex: 1; background: #000; border: none; color: #fff; padding: 6px; outline: none; font-size: 0.85rem; }
        #chat-send { background: #ffeb3b; border: none; padding: 6px 12px; cursor: pointer; font-weight: bold; font-size: 0.85rem; }

        /* Мобильный джойстик */
        #joystick-zone { position: absolute; bottom: 30px; left: 30px; width: 120px; height: 120px; background: rgba(255,255,255,0.08); border: 2px solid rgba(255,235,59,0.4); border-radius: 50%; display: none; touch-action: none; z-index: 10; }
        #joystick-stick { position: absolute; top: 35px; left: 35px; width: 50px; height: 50px; background: #ffeb3b; border-radius: 50%; opacity: 0.8; transition: transform 0.05s linear; }

        /* Экран Победы */
        #win-screen { position: absolute; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.95); display: none; flex-direction: column; justify-content: center; align-items: center; z-index: 200; color: #fff; }
        #win-screen h2 { font-size: 2.5rem; color: #00ff00; text-align: center; margin-bottom: 10px; }
        #win-screen p { font-size: 1.5rem; margin-bottom: 30px; text-align: center; color: #ffeb3b; }
        #win-screen button { padding: 12px 35px; font-size: 1.2rem; background: #00ff00; border: none; font-weight: bold; cursor: pointer; border-radius: 5px; }

        /* Инструкция на ПК */
        #instructions { position: absolute; bottom: 15px; right: 15px; color: rgba(255,235,59,0.6); font-size: 0.8rem; text-align: right; pointer-events: none; }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
</head>
<body>

    <div id="auth-screen">
        <h1>BACKROOMS ONLINE</h1>
        <input type="text" id="nickname-input" placeholder="Введите никнейм" maxlength="12" value="Игрок">
        <button id="start-btn">ВОЙТИ В ЗОНУ</button>
    </div>

    <div id="timer-container">00:00</div>

    <div id="chat-wrapper">
        <button id="chat-toggle">Чат <span id="chat-badge"></span></button>
        <div id="chat-box">
            <div id="chat-messages"></div>
            <div id="chat-input-container">
                <input type="text" id="chat-input" placeholder="Сообщение..." maxlength="50">
                <button id="chat-send">Отправить</button>
            </div>
        </div>
    </div>

    <div id="joystick-zone">
        <div id="joystick-stick"></div>
    </div>

    <div id="win-screen">
        <h2 id="win-title">ВЫХОД НАЙДЕН!</h2>
        <p id="win-desc">Игрок: (НИКНЕЙМ)</p>
        <button id="restart-btn">ИГРАТЬ ЗАНОВО</button>
    </div>

    <div id="instructions">ПК: WASD + Клик мыши для обзора<br>Телефоны: Джойстик слева + Обзор справа</div>

    <div id="canvas-container"></div>

    <script>
        // Подключение по протоколам ws/wss динамически
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(protocol + '//' + window.location.host);

        let myId = null;
        let myName = "Игрок";
        let otherPlayers = {};
        let scene, camera, renderer;
        let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Время
        let startTime = Date.now();
        let timerInterval;

        // Физика/Локации
        let playerPos = new THREE.Vector3(0, 0.8, 0);
        let playerVelocity = new THREE.Vector3();
        let cameraRotation = { x: 0, y: 0 }; // x - pitch (вверх-вниз), y - yaw (лево-право)
        let playerSpeed = 0.08;
        const keys = { w: false, a: false, s: false, d: false };
        
        // Джойстик переменные
        let touchStart = { x: 0, y: 0 };
        let joystickActive = false;
        let moveVector = { x: 0, y: 0 };

        // Инициализация графики Three.js
        function initEngine() {
            const container = document.getElementById('canvas-container');
            scene = new THREE.Scene();
            scene.background = new THREE.Color('#14140e');
            scene.fog = new THREE.FogExp2('#14140e', 0.15); // Атмосферный желтоватый туман бэклумса

            camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
            camera.position.copy(playerPos);
            
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.shadowMap.enabled = true;
            container.appendChild(renderer.domElement);

            // Освещение (Мрачные офисные лампы дневного света)
            const ambientLight = new THREE.AmbientLight('#2b2a1a', 0.6);
            scene.add(ambientLight);

            // Персональный фонарик игрока (направлен куда смотрит камера)
            const flashlight = new THREE.SpotLight(0xfffdb5, 1.2, 25, Math.PI / 5, 0.5, 1);
            flashlight.position.set(0, 0, 0);
            camera.add(flashlight);
            flashlight.target = new THREE.Object3D();
            flashlight.target.position.set(0, 0, -1);
            camera.add(flashlight.target);
            scene.add(camera);

            window.addEventListener('resize', onWindowResize);
            setupControls();
            generateLocalMap();
            animate();
        }

        // --- ГЕНЕРАЦИЯ ЛОКАЛЬНОГО ЧАНКА (ПРОЦЕДУРНЫЙ БЭКРУМС) ---
        // Стены генерируются на лету вокруг игрока.
        const CHUNK_SIZE = 24;
        const WALL_SIZE = 3;
        let generatedChunks = new Set();
        let walls = [];
        let winDoor = null;
        const doorChance = 0.0005; // 0.0005% шанс спавна двери на каждый плейт стены бэклумса

        // Материалы
        const wallTex = new THREE.TextureLoader().load('https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=256&q=80'); // Обои
        wallTex.wrapS = THREE.RepeatWrapping; wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(1, 1);
        const wallMat = new THREE.MeshLambertMaterial({ map: wallTex, color: '#cdc892' });

        const floorTex = new THREE.TextureLoader().load('https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=256&q=80'); // Старый ковролин
        floorTex.wrapS = THREE.RepeatWrapping; floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(8, 8);
        const floorMat = new THREE.MeshLambertMaterial({ map: floorTex, color: '#8b8449' });

        const ceilMat = new THREE.MeshLambertMaterial({ color: '#dfdfcc' });

        function generateLocalMap() {
            // Спавним стартовый пол
            const floorGeo = new THREE.PlaneGeometry(1000, 1000);
            const floor = new THREE.Mesh(floorGeo, floorMat);
            floor.rotation.x = -Math.PI / 2;
            floor.position.y = 0;
            scene.add(floor);

            const ceilGeo = new THREE.PlaneGeometry(1000, 1000);
            const ceil = new THREE.Mesh(ceilGeo, ceilMat);
            ceil.rotation.x = Math.PI / 2;
            ceil.position.y = WALL_SIZE;
            scene.add(ceil);

            updateChunksAroundPlayer();
        }

        function updateChunksAroundPlayer() {
            let currentChunkX = Math.floor(playerPos.x / CHUNK_SIZE);
            let currentChunkZ = Math.floor(playerPos.z / CHUNK_SIZE);

            // Генерируем чанки в радиусе 2 шагов от игрока
            for(let x = -2; x <= 2; x++) {
                for(let z = -2; z <= 2; z++) {
                    let cx = currentChunkX + x;
                    let cz = currentChunkZ + z;
                    let chunkKey = \`\${cx},\${cz}\`;
                    if(!generatedChunks.has(chunkKey)) {
                        createChunk(cx, cz);
                        generatedChunks.add(chunkKey);
                    }
                }
            }
        }

        // Процедурный генератор комнат с проходами
        function createChunk(cx, cz) {
            let startX = cx * CHUNK_SIZE;
            let startZ = cz * CHUNK_SIZE;

            // Сетка стен в чанке (размер чанка 8х8 клеток)
            const gridCells = 8;
            const cellSize = CHUNK_SIZE / gridCells; // 3 единицы на ячейку

            // Псевдослучайный генератор на базе координат чанка
            let seed = Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453;
            function random() {
                let x = Math.sin(seed++) * 10000;
                return x - Math.floor(x);
            }

            for(let i=0; i < gridCells; i++) {
                for(let j=0; j < gridCells; j++) {
                    // Исключаем стартовую зону у всех игроков, чтобы никто не застрял в стене на спавне!
                    let wx = startX + i * cellSize;
                    let wz = startZ + j * cellSize;
                    if(Math.abs(wx) < 5 && Math.abs(wz) < 5) continue;

                    // Решаем строить ли стену (продуманный лабиринт)
                    if(random() < 0.45) {
                        let isHorizontal = random() > 0.5;
                        buildWallSegment(wx, wz, isHorizontal, cellSize, random);
                    }
                }
            }
        }

        function buildWallSegment(x, z, horizontal, size, prng) {
            let wallW = horizontal ? size : 0.4;
            let wallD = horizontal ? 0.4 : size;

            const wallGeo = new THREE.BoxGeometry(wallW, WALL_SIZE, wallD);
            const wall = new THREE.Mesh(wallGeo, wallMat);
            wall.position.set(x + wallW/2, WALL_SIZE/2, z + wallD/2);
            scene.add(wall);
            walls.push(wall);

            // Добавляем потолочный свет над некоторыми стенами для атмосферы
            if(prng() < 0.08) {
                addCeilingLamp(wall.position.x, wall.position.z);
            }

            // ШАНС СПАВНА ВЫХОДА (0.0005% или 0.000005 доля)
            if(!winDoor && prng() < doorChance) {
                spawnWinDoor(wall.position.x, wall.position.z + (horizontal ? 0.3 : 0), horizontal);
            }
        }

        function addCeilingLamp(x, z) {
            const lampGeo = new THREE.PlaneGeometry(1, 0.3);
            const lampMat = new THREE.MeshBasicMaterial({ color: '#ffffe0' });
            const lamp = new THREE.Mesh(lampGeo, lampMat);
            lamp.rotation.x = Math.PI / 2;
            lamp.position.set(x, WALL_SIZE - 0.02, z);
            scene.add(lamp);

            const lampLight = new THREE.PointLight('#ffeb3b', 0.6, 6);
            lampLight.position.set(x, WALL_SIZE - 0.2, z);
            scene.add(lampLight);
        }

        function spawnWinDoor(x, z, horizontal) {
            // Белая светящаяся дверь
            const doorGroup = new THREE.Group();
            
            const frameGeo = new THREE.BoxGeometry(horizontal ? 1.5 : 0.2, 2.2, horizontal ? 0.2 : 1.5);
            const frameMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
            const frame = new THREE.Mesh(frameGeo, frameMat);
            doorGroup.add(frame);

            // Интенсивный неоновый белый свет двери
            const light = new THREE.PointLight('#ffffff', 2.5, 12);
            light.position.set(0, 1, 0);
            doorGroup.add(light);

            doorGroup.position.set(x, 1.1, z);
            scene.add(doorGroup);
            winDoor = doorGroup;
        }

        // --- МОДЕЛИ ИГРОКОВ (Желтый химкостюм, милая голова с глазами) ---
        function createPlayerModel(playerData) {
            const group = new THREE.Group();

            // Тело (желтый костюм)
            const bodyGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8);
            const bodyMat = new THREE.MeshLambertMaterial({ color: '#ddc633' });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.position.y = 0.6;
            group.add(body);

            // Рюкзак сзади жизнеобеспечения
            const packGeo = new THREE.BoxGeometry(0.2, 0.7, 0.4);
            const pack = new THREE.Mesh(packGeo, bodyMat);
            pack.position.set(0, 0.7, -0.25);
            group.add(pack);

            // Голова (черный шлем с "милыми глазами")
            const headGroup = new THREE.Group();
            const headGeo = new THREE.SphereGeometry(0.22, 16, 16);
            const headMat = new THREE.MeshLambertMaterial({ color: '#1a1a1a' });
            const head = new THREE.Mesh(headGeo, headMat);
            head.position.y = 1.3;
            headGroup.add(head);

            // Глазки
            const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
            const eyeMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
            
            const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
            leftEye.position.set(-0.07, 1.32, 0.18);
            headGroup.add(leftEye);

            const rightEye = leftEye.clone();
            rightEye.position.x = 0.07;
            headGroup.add(rightEye);

            group.add(headGroup);
            group.headMesh = headGroup; // Для анимации наклона головы

            // Никнейм над головой через 2D холст (Текстура)
            const canvas = document.createElement('canvas');
            canvas.width = 256; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(0, 0, 256, 64);
            ctx.fillStyle = '#ffeb3b';
            ctx.font = 'Bold 28px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText(playerData.name, 128, 42);

            const nameTex = new THREE.CanvasTexture(canvas);
            const nameMat = new THREE.SpriteMaterial({ map: nameTex, transparent: true });
            const nameSprite = new THREE.Sprite(nameMat);
            nameSprite.position.set(0, 1.8, 0);
            nameSprite.scale.set(1.5, 0.375, 1);
            group.add(nameSprite);

            scene.add(group);
            return group;
        }

        // --- УПРАВЛЕНИЕ (ПК + ТЕЛЕФОН) ---
        function setupControls() {
            if(isMobile) {
                // Включаем отображение джойстика
                document.getElementById('joystick-zone').style.display = 'block';

                window.addEventListener('touchstart', (e) => {
                    let touch = e.touches[0];
                    if(touch.clientX < window.innerWidth / 2) {
                        joystickActive = true;
                        touchStart = { x: touch.clientX, y: touch.clientY };
                    }
                }, { passive: true });

                window.addEventListener('touchmove', (e) => {
                    let touch;
                    // Ищем тач джойстика и тач камеры
                    for(let i=0; i<e.touches.length; i++) {
                        let t = e.touches[i];
                        if(t.clientX < window.innerWidth / 2 && joystickActive) {
                            let dx = t.clientX - touchStart.x;
                            let dy = t.clientY - touchStart.y;
                            let dist = Math.hypot(dx, dy);
                            let maxDist = 45;

                            if(dist > maxDist) {
                                dx = (dx / dist) * maxDist;
                                dy = (dy / dist) * maxDist;
                            }
                            
                            document.getElementById('joystick-stick').style.transform = \`translate(\${dx}px, \${dy}px)\`;
                            
                            // Сохраняем вектор движения
                            moveVector.x = dx / maxDist;
                            moveVector.y = -dy / maxDist;
                        } else if(t.clientX >= window.innerWidth / 2) {
                            // Проводка камеры по правой половине экрана под оси!
                            let sens = 0.005;
                            cameraRotation.y -= t.force ? 0 : e.touches[i].radiusX ? 0 : 0; // Для кроссплатформенного тача задействуем дельту
                        }
                    }
                }, { passive: true });

                // Управление камерой на телефоне через свайпы справа
                let lastTouchX = 0, lastTouchY = 0;
                window.addEventListener('touchstart', (e) => {
                    let t = e.touches[0];
                    if(t.clientX >= window.innerWidth / 2) {
                        lastTouchX = t.clientX;
                        lastTouchY = t.clientY;
                    }
                });

                window.addEventListener('touchmove', (e) => {
                    for(let i=0; i<e.touches.length; i++) {
                        let t = e.touches[i];
                        if(t.clientX >= window.innerWidth / 2) {
                            let dx = t.clientX - lastTouchX;
                            let dy = t.clientY - lastTouchY;
                            lastTouchX = t.clientX;
                            lastTouchY = t.clientY;

                            let sens = 0.004;
                            cameraRotation.y -= dx * sens;
                            cameraRotation.x -= dy * sens;
                            cameraRotation.x = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, cameraRotation.x));
                        }
                    }
                });

                window.addEventListener('touchend', (e) => {
                    if (e.touches.length === 0) {
                        joystickActive = false;
                        document.getElementById('joystick-stick').style.transform = 'translate(0px, 0px)';
                        moveVector = { x: 0, y: 0 };
                    }
                });
            } else {
                // ПК - управление
                window.addEventListener('keydown', (e) => {
                    if(document.activeElement === document.getElementById('chat-input')) return; // чтобы не мешало чату
                    let key = e.key.toLowerCase();
                    if(key === 'w' || key === 'ц') keys.w = true;
                    if(key === 'a' || key === 'ф') keys.a = true;
                    if(key === 's' || key === 'ы') keys.s = true;
                    if(key === 'd' || key === 'в') keys.d = true;
                });

                window.addEventListener('keyup', (e) => {
                    let key = e.key.toLowerCase();
                    if(key === 'w' || key === 'ц') keys.w = false;
                    if(key === 'a' || key === 'ф') keys.a = false;
                    if(key === 's' || key === 'ы') keys.s = false;
                    if(key === 'd' || key === 'в') keys.d = false;
                });

                // Блокировка указателя мыши
                document.body.addEventListener('click', (e) => {
                    if(document.pointerLockElement !== document.body && document.getElementById('auth-screen').style.display === 'none') {
                        // Клик не по чату
                        if(!e.target.closest('#chat-wrapper') && !e.target.closest('#win-screen')) {
                            document.body.requestPointerLock();
                        }
                    }
                });

                window.addEventListener('mousemove', (e) => {
                    if (document.pointerLockElement === document.body) {
                        let sens = 0.002;
                        cameraRotation.y -= e.movementX * sens;
                        cameraRotation.x -= e.movementY * sens;
                        cameraRotation.x = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, cameraRotation.x));
                    }
                });
            }
        }

        // Коллизии со всеми стенами чанков
        function checkCollision(targetPos) {
            let playerRadius = 0.35;
            for(let i=0; i<walls.length; i++) {
                let wall = walls[i];
                let bbox = new THREE.Box3().setFromObject(wall);
                
                // Проверяем плоскость XZ
                let closestX = Math.max(bbox.min.x, Math.min(targetPos.x, bbox.max.x));
                let closestZ = Math.max(bbox.min.z, Math.min(targetPos.z, bbox.max.z));

                let distanceX = targetPos.x - closestX;
                let distanceZ = targetPos.z - closestZ;
                let distanceSq = (distanceX * distanceX) + (distanceZ * distanceZ);

                if (distanceSq < playerRadius * playerRadius) {
                    return true; // Стенка мешает пройти
                }
            }
            return false;
        }

        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        // --- ИГРОВОЙ ЦИКЛ ОБНОВЛЕНИЯ КАДРА ---
        function animate() {
            requestAnimationFrame(animate);

            // 1. Поворот камеры (взгляд завязан на мышь / свайпы)
            camera.quaternion.setFromEuler(new THREE.Euler(cameraRotation.x, cameraRotation.y, 0, 'YXZ'));

            // 2. Движение
            let moveX = 0;
            let moveZ = 0;

            if (isMobile) {
                // Направление джойстика зависит от направления взгляда камеры под ось камеры!
                let forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
                forward.y = 0;
                forward.normalize();
                
                let right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
                right.y = 0;
                right.normalize();

                let wishDir = new THREE.Vector3();
                wishDir.addScaledVector(forward, moveVector.y);
                wishDir.addScaledVector(right, moveVector.x);

                moveX = wishDir.x * playerSpeed;
                moveZ = wishDir.z * playerSpeed;
            } else {
                // ПК движение (тоже под ось камеры!)
                let forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
                forward.y = 0;
                forward.normalize();

                let right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
                right.y = 0;
                right.normalize();

                let wishDir = new THREE.Vector3();
                if(keys.w) wishDir.add(forward);
                if(keys.s) wishDir.addScaledVector(forward, -1);
                if(keys.a) wishDir.addScaledVector(right, -1);
                if(keys.d) wishDir.add(right);
                wishDir.normalize();

                moveX = wishDir.x * playerSpeed;
                moveZ = wishDir.z * playerSpeed;
            }

            // Применяем движение с учетом физики столкновений (по осям отдельно для мягкого скольжения по стенам)
            let nextPos = playerPos.clone();
            nextPos.x += moveX;
            if(!checkCollision(nextPos)) {
                playerPos.x = nextPos.x;
            }

            nextPos = playerPos.clone();
            nextPos.z += moveZ;
            if(!checkCollision(nextPos)) {
                playerPos.z = nextPos.z;
            }

            camera.position.copy(playerPos);

            // Подгружаем карту по мере движения
            updateChunksAroundPlayer();

            // Проверяем дошел ли игрок до победной белой двери-выхода
            if(winDoor) {
                let distToDoor = playerPos.distanceTo(winDoor.position);
                if(distToDoor < 1.4) {
                    socket.send(JSON.stringify({ type: 'win' }));
                }
            }

            // 3. Отправка координат серверу
            if(socket.readyState === WebSocket.OPEN && myId) {
                socket.send(JSON.stringify({
                    type: 'move',
                    x: playerPos.x,
                    y: playerPos.y,
                    z: playerPos.z,
                    ry: cameraRotation.y, // тело
                    rx: cameraRotation.x  // голова
                }));
            }

            renderer.render(scene, camera);
        }

        // --- РАБОТА С СЕТЬЮ (WEBSOCKETS) ---
        socket.onmessage = (event) => {
            let data = JSON.parse(event.data);

            if (data.type === 'init') {
                myId = data.id;
                // Спавним других игроков
                for(let id in data.players) {
                    if(id !== myId) {
                        otherPlayers[id] = createPlayerModel(data.players[id]);
                    }
                }
                if (data.gameWon) {
                    showWinScreen(data.winnerName);
                }
            }

            if (data.type === 'playerJoined') {
                if(data.player.id !== myId && !otherPlayers[data.player.id]) {
                    otherPlayers[data.player.id] = createPlayerModel(data.player);
                }
            }

            if (data.type === 'update') {
                let p = otherPlayers[data.id];
                if(p) {
                    // Плавная интерполяция перемещения других игроков
                    p.position.set(data.x, data.y - 0.8, data.z);
                    p.rotation.y = data.ry; // Поворот тела
                    if(p.headMesh) {
                        p.headMesh.rotation.x = data.rx; // Поворот головы вверх/вниз
                    }
                }
            }

            if (data.type === 'playerLeft') {
                if(otherPlayers[data.id]) {
                    scene.remove(otherPlayers[data.id]);
                    delete otherPlayers[data.id];
                }
            }

            if (data.type === 'chat') {
                appendChatMessage(data.name, data.text);
            }

            if (data.type === 'win') {
                showWinScreen(data.name);
            }

            if (data.type === 'restart') {
                location.reload(); // Перезапуск клиента для обновления генерации у всех
            }
        };

        // --- ИНТЕРФЕЙС / ЧАТ ---
        document.getElementById('start-btn').addEventListener('click', () => {
            let val = document.getElementById('nickname-input').value.trim();
            if(val) {
                myName = val;
                document.getElementById('auth-screen').style.display = 'none';
                initEngine();
                socket.send(JSON.stringify({ type: 'join', name: myName }));
                
                // Запуск таймера
                startTime = Date.now();
                timerInterval = setInterval(() => {
                    let diff = Date.now() - startTime;
                    let min = Math.floor(diff / 60000).toString().padStart(2, '0');
                    let sec = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
                    document.getElementById('timer-container').innerText = \`\${min}:\${sec}\`;
                }, 1000);
            }
        });

        // Работа с чатом
        const chatToggle = document.getElementById('chat-toggle');
        const chatBox = document.getElementById('chat-box');
        const chatBadge = document.getElementById('chat-badge');
        const chatInput = document.getElementById('chat-input');
        const chatSend = document.getElementById('chat-send');
        const chatMessages = document.getElementById('chat-messages');

        chatToggle.addEventListener('click', () => {
            if(chatBox.style.display === 'none' || !chatBox.style.display) {
                chatBox.style.display = 'block';
                chatBadge.style.display = 'none';
                chatInput.focus();
                if(document.pointerLockElement === document.body) document.exitPointerLock(); // выходим из захвата мыши для чата
            } else {
                chatBox.style.display = 'none';
            }
        });

        function appendChatMessage(sender, text) {
            let msg = document.createElement('div');
            msg.innerHTML = \`<strong>\${sender}:</strong> \${text}\`;
            chatMessages.appendChild(msg);
            
            // Автопрокрутка вниз
            chatMessages.scrollTop = chatMessages.scrollHeight;

            // Удаление старых сообщений при забитом лимите (держим макс 50 штук)
            if(chatMessages.children.length > 50) {
                chatMessages.removeChild(chatMessages.firstChild);
            }

            // Красный кружочек-уведомление если чат закрыт
            if(chatBox.style.display === 'none' || !chatBox.style.display) {
                chatBadge.style.display = 'inline-block';
            }
        }

        function sendMessage() {
            let text = chatInput.value.trim();
            if(text) {
                socket.send(JSON.stringify({ type: 'chat', text: text }));
                chatInput.value = '';
            }
        }

        chatSend.addEventListener('click', sendMessage);
        chatInput.addEventListener('keydown', (e) => {
            if(e.key === 'Enter') sendMessage();
        });

        function showWinScreen(winner) {
            clearInterval(timerInterval);
            document.getElementById('win-desc').innerText = \`ИГРОК "\${winner}" НАШЕЛ БЕЛУЮ ДВЕРЬ И ВЫРВАЛСЯ ИЗ БЭКРУМСА!\`;
            document.getElementById('win-screen').style.display = 'flex';
            if(document.pointerLockElement === document.body) document.exitPointerLock();
        }

        document.getElementById('restart-btn').addEventListener('click', () => {
            socket.send(JSON.stringify({ type: 'restart' }));
        });
    </script>
</body>
</html>
`;
