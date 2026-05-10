const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const port = process.env.PORT || 3000;

// Автопинг для Render
const URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
setInterval(() => {
    http.get(URL, (res) => {}).on('error', (err) => console.error('Ping error:', err.message));
}, 600000);

app.get('/', (req, res) => {
    res.send(clientHTML);
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Хранилище состояния мира
let players = {};
let worldChanges = {}; // Изменения блоков: {"x,y,z": blockType} (0 - пустота)
const SEED = 12345; // Единый сид мира для всех игроков!

wss.on('connection', (ws) => {
    let playerId = Math.random().toString(36).substring(2, 9);

    ws.on('message', (message) => {
        let data;
        try { data = JSON.parse(message); } catch(e) { return; }

        if (data.type === 'join') {
            players[playerId] = {
                id: playerId,
                name: data.name || "Steve",
                x: 0, y: 15, z: 0,
                ry: 0, rx: 0,
                handSwing: 0
            };
            // Отправляем игроку сид, его ID, список игроков и измененные блоки базы
            ws.send(JSON.stringify({ type: 'init', id: playerId, players, worldChanges, seed: SEED }));
            broadcast({ type: 'playerJoined', player: players[playerId] });
        }

        if (data.type === 'move') {
            if (players[playerId]) {
                Object.assign(players[playerId], {
                    x: data.x, y: data.y, z: data.z,
                    ry: data.ry, rx: data.rx,
                    handSwing: data.handSwing
                });
                broadcast({
                    type: 'update', id: playerId,
                    x: data.x, y: data.y, z: data.z,
                    ry: data.ry, rx: data.rx,
                    handSwing: data.handSwing
                }, playerId);
            }
        }

        // Синхронизация установки/слома блоков
        if (data.type === 'blockChange') {
            const key = `${data.x},${data.y},${data.z}`;
            if (data.blockType === 0) {
                delete worldChanges[key];
            } else {
                worldChanges[key] = data.blockType;
            }
            broadcast({ type: 'blockChange', x: data.x, y: data.y, z: data.z, blockType: data.blockType });
        }

        if (data.type === 'chat') {
            if (players[playerId]) {
                broadcast({ type: 'chat', name: players[playerId].name, text: data.text });
            }
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
            client.send(msg);
        }
    });
}

server.listen(port, () => {
    console.log(`Minecraft Server running on port ${port}`);
});

// КЛИЕНТСКИЙ КОД (MINECRAFT 3D + OPTIMIZED GENERATION + GENERATIVE MUSIC)
const clientHTML = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>Multiplayer Craft 3D</title>
    <style>
        body, html { margin: 0; padding: 0; overflow: hidden; width: 100%; height: 100%; font-family: 'Courier New', monospace; background: #85b0ff; user-select: none; }
        #canvas-container { width: 100%; height: 100%; display: block; }
        
        /* Авторизация */
        #auth-screen { position: absolute; top:0; left:0; width:100%; height:100%; background: linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url('https://images.unsplash.com/photo-1607988795691-3d0147b43231?auto=format&fit=crop&w=1200&q=80') no-repeat center center; background-size: cover; display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 100; color: #fff; text-shadow: 2px 2px 0px #000; }
        #auth-screen h1 { font-size: 3.5rem; margin-bottom: 20px; text-align: center; }
        #auth-screen input { padding: 12px; font-size: 1.2rem; border: 3px solid #3c3c3c; background: #222; color: #fff; text-align: center; margin-bottom: 20px; outline: none; width: 250px; image-rendering: pixelated; }
        #auth-screen button { padding: 12px 30px; font-size: 1.2rem; background: #5c8e32; border: 3px solid #3c3c3c; color: #fff; cursor: pointer; font-weight: bold; text-shadow: 1px 1px 0px #000; }
        #auth-screen button:hover { background: #76b041; }

        /* Прицел */
        #crosshair { position: absolute; top: 50%; left: 50%; width: 16px; height: 16px; transform: translate(-50%, -50%); pointer-events: none; z-index: 5; display: none; }
        #crosshair::before, #crosshair::after { content: ''; position: absolute; background: rgba(255,255,255,0.8); }
        #crosshair::before { top: 7px; left: 0; width: 16px; height: 2px; }
        #crosshair::after { top: 0; left: 7px; width: 2px; height: 16px; }

        /* Хотбар (Инвентарь) */
        #hotbar { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); display: none; gap: 4px; background: rgba(0,0,0,0.6); padding: 6px; border: 4px solid #3c3c3c; border-radius: 2px; z-index: 10; }
        .hotbar-slot { width: 44px; height: 44px; border: 4px solid #8f8f8f; display: flex; justify-content: center; align-items: center; cursor: pointer; position: relative; background: #8b8b8b; }
        .hotbar-slot.active { border-color: #ffffff; background: #9c9c9c; box-shadow: inset 0 0 5px #000; }
        .hotbar-slot img { width: 32px; height: 32px; image-rendering: pixelated; }
        
        /* Чат */
        #chat-wrapper { position: absolute; top: 15px; left: 15px; width: 300px; display: none; flex-direction: column; z-index: 10; }
        #chat-box { background: rgba(0,0,0,0.4); border-radius: 4px; overflow: hidden; }
        #chat-messages { height: 140px; overflow-y: auto; padding: 8px; font-size: 0.85rem; color: #fff; text-shadow: 1px 1px 1px #000; }
        #chat-input-container { display: flex; }
        #chat-input { flex: 1; background: rgba(0,0,0,0.6); border: none; color: #fff; padding: 6px; outline: none; }

        /* Мобильное управление */
        #mobile-controls { display: none; position: absolute; width: 100%; height: 100%; top:0; left:0; pointer-events: none; z-index: 8; }
        #joystick-zone { position: absolute; bottom: 30px; left: 30px; width: 120px; height: 120px; background: rgba(0,0,0,0.3); border: 3px solid #fff; border-radius: 50%; pointer-events: auto; }
        #joystick-stick { position: absolute; top: 35px; left: 35px; width: 50px; height: 50px; background: #fff; border-radius: 50%; }
        #action-buttons { position: absolute; bottom: 30px; right: 30px; display: flex; gap: 15px; pointer-events: auto; }
        .action-btn { width: 60px; height: 60px; border-radius: 50%; background: rgba(0,0,0,0.5); border: 3px solid #fff; color: #fff; font-size: 1.5rem; font-weight: bold; display: flex; justify-content: center; align-items: center; }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
</head>
<body>

    <div id="auth-screen">
        <h1>MINECRAFT JS</h1>
        <input type="text" id="nickname-input" placeholder="Никнейм" maxlength="10" value="Steve">
        <button id="start-btn">ИГРАТЬ</button>
    </div>

    <div id="crosshair"></div>

    <div id="hotbar">
        </div>

    <div id="chat-wrapper">
        <div id="chat-box">
            <div id="chat-messages"></div>
            <div id="chat-input-container">
                <input type="text" id="chat-input" placeholder="Нажмите Enter для чата..." maxlength="45">
            </div>
        </div>
    </div>

    <div id="mobile-controls">
        <div id="joystick-zone"><div id="joystick-stick"></div></div>
        <div id="action-buttons">
            <div class="action-btn" id="btn-jump">▲</div>
            <div class="action-btn" id="btn-build">🛠️</div>
            <div class="action-btn" id="btn-break">⛏️</div>
        </div>
    </div>

    <div id="canvas-container"></div>

    <script>
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(protocol + '//' + window.location.host);

        let myId = null, myName = "Steve", otherPlayers = {}, worldChanges = {}, seed = 12345;
        let scene, camera, renderer, clock;
        let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent);

        // Игровой мир и чанки
        const CHUNK_SIZE = 16;
        const CHUNK_HEIGHT = 20;
        const VIEW_DISTANCE = 3; // Радиус рендеринга чанков вокруг игрока
        let loadedChunks = {}; // { "cx,cz": { mesh, instancedBlocks } }

        // Физика игрока
        let playerPos = new THREE.Vector3(0, 15, 0);
        let playerVelocity = new THREE.Vector3();
        let cameraRotation = { x: 0, y: 0 };
        let isGrounded = false;
        const playerSpeed = 0.07;
        const gravity = -0.009;
        const jumpForce = 0.18;
        const keys = { w: false, a: false, s: false, d: false, space: false };

        // Мобильные тачи
        let touchStart = { x: 0, y: 0 }, joystickActive = false, moveVector = { x: 0, y: 0 };

        // Описание блоков
        const BLOCKS = {
            1: { name: "Трава", color: "#5c8e32", img: "https://i.imgur.com/KdfQ9aO.png" },
            2: { name: "Земля", color: "#866043", img: "https://i.imgur.com/Psh5zU5.png" },
            3: { name: "Камень", color: "#7a7a7a", img: "https://i.imgur.com/8N6D88O.png" },
            4: { name: "Песок", color: "#e1ca91", img: "https://i.imgur.com/z06O7T8.png" },
            5: { name: "Дерево", color: "#a0764c", img: "https://i.imgur.com/gK6Ior1.png" },
            6: { name: "Листва", color: "#3b5e2b", img: "https://i.imgur.com/97y4oJv.png" },
            7: { name: "Снег", color: "#ffffff", img: "https://i.imgur.com/Y6E5Lp4.png" },
            8: { name: "Вода", color: "#3a70d4", img: "https://i.imgur.com/HqP3w94.png" }
        };
        let activeBlockSlot = 1; // По умолчанию выбран блок Травы

        // Инициализация графики
        function initEngine() {
            clock = new THREE.Clock();
            const container = document.getElementById('canvas-container');
            scene = new THREE.Scene();
            scene.background = new THREE.Color('#85b0ff');
            scene.fog = new THREE.FogExp2('#85b0ff', 0.02);

            // Камера ИГРОКА (В голове!)
            camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.copy(playerPos);
            scene.add(camera);

            renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Оптимизация разрешения
            container.appendChild(renderer.domElement);

            // Освещение (Солнечный свет с циклом)
            const sunLight = new THREE.DirectionalLight('#ffffff', 1.0);
            sunLight.position.set(50, 100, 50);
            scene.add(sunLight);

            const ambientLight = new THREE.AmbientLight('#a0a0a0', 0.5);
            scene.add(ambientLight);

            // Создаем красивый Хотбар
            const hotbar = document.getElementById('hotbar');
            for (let id in BLOCKS) {
                let slot = document.createElement('div');
                slot.className = 'hotbar-slot' + (id == activeBlockSlot ? ' active' : '');
                slot.dataset.id = id;
                slot.innerHTML = \`<img src="\${BLOCKS[id].img}" title="\${BLOCKS[id].name}">\`;
                slot.addEventListener('click', () => selectSlot(id));
                hotbar.appendChild(slot);
            }

            // Настройка управления и старт бесконечной музыки
            setupControls();
            startMinecraftMusic();
            animate();
        }

        function selectSlot(id) {
            activeBlockSlot = parseInt(id);
            document.querySelectorAll('.hotbar-slot').forEach(s => s.classList.remove('active'));
            document.querySelector(\`.hotbar-slot[data-id="\${id}"]\`).classList.add('active');
        }

        // --- ГЕНЕРАТОР ШУМА И БИОМОВ (ОДИНАКОВЫЙ У ВСЕХ НА SEED) ---
        function pseudoNoise2D(x, z) {
            let n = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453;
            return n - Math.floor(n);
        }

        function getNoiseHeight(x, z) {
            // Мягкий синусоидальный шум с октавами для холмов
            let h1 = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 5;
            let h2 = Math.sin(x * 0.15) * 2;
            let val = Math.floor(h1 + h2 + 8);
            return val;
        }

        // Определение плавных биомов по координатам
        function getBiome(x, z) {
            let val = pseudoNoise2D(Math.floor(x/32), Math.floor(z/32));
            if (val < 0.25) return "desert"; // Пустыня (Кактусы, Песок)
            if (val > 0.75) return "tundra"; // Зима (Снег, Камень)
            return "forest"; // Лес (Трава, Деревья)
        }

        // --- ОПТИМИЗИРОВАННЫЙ ТРЁХМЕРНЫЙ МИР ЧАНКОВ (InstancedMesh) ---
        const chunkGeometry = new THREE.BoxGeometry(1, 1, 1);
        const materials = {};
        for(let id in BLOCKS) {
            materials[id] = new THREE.MeshLambertMaterial({ color: BLOCKS[id].color });
        }

        function buildChunk(cx, cz) {
            const key = \`\${cx},\${cz}\`;
            if (loadedChunks[key]) return;

            let instancedMeshes = {}; // { blockType: InstancedMesh }
            let tempMatrix = new THREE.Object3D();
            
            // Собираем блоки для инстансинга в чанке
            let chunkBlocks = [];

            for (let x = 0; x < CHUNK_SIZE; x++) {
                for (let z = 0; z < CHUNK_SIZE; z++) {
                    let worldX = cx * CHUNK_SIZE + x;
                    let worldZ = cz * CHUNK_SIZE + z;

                    let height = getNoiseHeight(worldX, worldZ);
                    let biome = getBiome(worldX, worldZ);

                    for (let y = 0; y < CHUNK_HEIGHT; y++) {
                        let finalBlockType = 0;
                        const blockKey = \`\${worldX},\${y},\${worldZ}\`;

                        // 1. Проверяем, изменяли ли этот блок игроки глобально на сервере
                        if (worldChanges[blockKey] !== undefined) {
                            finalBlockType = worldChanges[blockKey];
                        } else {
                            // Естественная генерация
                            if (y === height) {
                                if (biome === "desert") finalBlockType = 4; // Песок
                                else if (biome === "tundra") finalBlockType = 7; // Снег
                                else finalBlockType = 1; // Трава
                            } else if (y < height && y > height - 3) {
                                finalBlockType = (biome === "desert") ? 4 : 2; // Земля или Песок
                            } else if (y <= height - 3) {
                                finalBlockType = 3; // Камень глубоко
                            } else if (y < 4 && y > height) {
                                finalBlockType = 8; // Вода в низинах
                            }
                        }

                        if (finalBlockType !== 0) {
                            chunkBlocks.push({ x: worldX, y, z: worldZ, type: finalBlockType });
                        }
                    }

                    // Случайная генерация деревьев на вершинах травы
                    if (biome === "forest" && y === height && pseudoNoise2D(worldX, worldZ) < 0.02) {
                        spawnTree(worldX, height + 1, worldZ, chunkBlocks);
                    }
                }
            }

            // Группируем по типу блоков и создаем InstancedMesh
            let blocksByType = {};
            chunkBlocks.forEach(b => {
                if(!blocksByType[b.type]) blocksByType[b.type] = [];
                blocksByType[b.type].push(b);
            });

            let meshGroup = new THREE.Group();

            for(let type in blocksByType) {
                let list = blocksByType[type];
                let mesh = new THREE.InstancedMesh(chunkGeometry, materials[type], list.length);
                
                for(let i = 0; i < list.length; i++) {
                    tempMatrix.position.set(list[i].x, list[i].y, list[i].z);
                    tempMatrix.updateMatrix();
                    mesh.setMatrixAt(i, tempMatrix.matrix);
                }
                mesh.instanceMatrix.needsUpdate = true;
                meshGroup.add(mesh);
            }

            scene.add(meshGroup);
            loadedChunks[key] = { group: meshGroup, blocks: chunkBlocks };
        }

        function spawnTree(tx, ty, tz, chunkBlocks) {
            // Ствол
            for(let h = 0; h < 4; h++) {
                chunkBlocks.push({ x: tx, y: ty + h, z: tz, type: 5 }); // Дерево
            }
            // Листва
            for(let lx = -1; lx <= 1; lx++) {
                for(let lz = -1; lz <= 1; lz++) {
                    for(let ly = 3; ly <= 4; ly++) {
                        if(lx === 0 && lz === 0 && ly === 3) continue;
                        chunkBlocks.push({ x: tx+lx, y: ty+ly, z: tz+lz, type: 6 }); // Листва
                    }
                }
            }
        }

        function updateVisibleChunks() {
            let currentCX = Math.floor(playerPos.x / CHUNK_SIZE);
            let currentCZ = Math.floor(playerPos.z / CHUNK_SIZE);

            // Рендерим новые чанки вокруг игрока
            for (let x = -VIEW_DISTANCE; x <= VIEW_DISTANCE; x++) {
                for (let z = -VIEW_DISTANCE; z <= VIEW_DISTANCE; z++) {
                    buildChunk(currentCX + x, currentCZ + z);
                }
            }

            // Очищаем очень далекие чанки для оптимизации
            for(let key in loadedChunks) {
                let [cx, cz] = key.split(',').map(Number);
                if(Math.abs(cx - currentCX) > VIEW_DISTANCE + 1 || Math.abs(cz - currentCZ) > VIEW_DISTANCE + 1) {
                    scene.remove(loadedChunks[key].group);
                    delete loadedChunks[key];
                }
            }
        }

        // --- МОДЕЛЬКА ИГРОКА (СТИЛЬ СТИВА ИЗ МАЙНКРАФТА) ---
        function createPlayerModel(playerData) {
            const playerGroup = new THREE.Group();

            // Тело
            const bodyGeo = new THREE.BoxGeometry(0.6, 1.2, 0.4);
            const bodyMat = new THREE.MeshLambertMaterial({ color: '#00cbc9' }); // Голубая футболка
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.position.y = 0.6;
            playerGroup.add(body);

            // Ноги (синие джинсы)
            const legGeo = new THREE.BoxGeometry(0.28, 0.7, 0.38);
            const legMat = new THREE.MeshLambertMaterial({ color: '#3c59aa' });
            
            const leftLeg = new THREE.Mesh(legGeo, legMat);
            leftLeg.position.set(-0.15, -0.35, 0);
            body.add(leftLeg);

            const rightLeg = leftLeg.clone();
            rightLeg.position.x = 0.15;
            body.add(rightLeg);

            // Руки
            const armGeo = new THREE.BoxGeometry(0.24, 1.0, 0.24);
            const armMat = new THREE.MeshLambertMaterial({ color: '#eaae83' });
            
            const leftArm = new THREE.Mesh(armGeo, armMat);
            leftArm.position.set(-0.45, 0.1, 0);
            body.add(leftArm);

            const rightArm = leftArm.clone();
            rightArm.position.x = 0.45;
            body.add(rightArm);
            playerGroup.rightArm = rightArm; // Ссылка для анимации махания

            // Голова
            const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
            const headMat = new THREE.MeshLambertMaterial({ color: '#eaae83' });
            const head = new THREE.Mesh(headGeo, headMat);
            head.position.y = 1.45;
            playerGroup.add(head);
            playerGroup.head = head; // Для синхронизации поворота вверх-вниз

            // Ник над головой
            const canvas = document.createElement('canvas');
            canvas.width = 128; canvas.height = 32;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.fillRect(0, 0, 128, 32);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(playerData.name, 64, 22);

            const textTex = new THREE.CanvasTexture(canvas);
            const spriteMat = new THREE.SpriteMaterial({ map: textTex, transparent: true });
            const sprite = new THREE.Sprite(spriteMat);
            sprite.position.set(0, 1.9, 0);
            sprite.scale.set(1.0, 0.25, 1);
            playerGroup.add(sprite);

            scene.add(playerGroup);
            return playerGroup;
        }

        // --- УПРАВЛЕНИЕ ПК И СМАРТФОНЫ ---
        function setupControls() {
            if (isMobile) {
                document.getElementById('mobile-controls').style.display = 'block';

                // Джойстик перемещения
                const stick = document.getElementById('joystick-stick');
                document.getElementById('joystick-zone').addEventListener('touchstart', (e) => {
                    joystickActive = true;
                    let t = e.touches[0];
                    touchStart = { x: t.clientX, y: t.clientY };
                }, { passive: true });

                window.addEventListener('touchmove', (e) => {
                    if (!joystickActive) return;
                    let t = e.touches[0];
                    let dx = t.clientX - touchStart.x;
                    let dy = t.clientY - touchStart.y;
                    let dist = Math.hypot(dx, dy);
                    let maxDist = 35;

                    if (dist > maxDist) {
                        dx = (dx / dist) * maxDist;
                        dy = (dy / dist) * maxDist;
                    }
                    stick.style.transform = \`translate(\${dx}px, \${dy}px)\`;
                    moveVector = { x: dx / maxDist, y: -dy / maxDist };
                }, { passive: true });

                window.addEventListener('touchend', () => {
                    joystickActive = false;
                    stick.style.transform = 'translate(0px,0px)';
                    moveVector = { x: 0, y: 0 };
                });

                // Правая область экрана - вращение камеры (под ось головы)
                let lastCamTouch = { x:0, y:0 };
                window.addEventListener('touchstart', (e) => {
                    let t = e.touches[0];
                    if (t.clientX > window.innerWidth / 2) {
                        lastCamTouch = { x: t.clientX, y: t.clientY };
                    }
                }, { passive: true });

                window.addEventListener('touchmove', (e) => {
                    for (let i = 0; i < e.touches.length; i++) {
                        let t = e.touches[i];
                        if (t.clientX > window.innerWidth / 2) {
                            let dx = t.clientX - lastCamTouch.x;
                            let dy = t.clientY - lastCamTouch.y;
                            lastCamTouch = { x: t.clientX, y: t.clientY };

                            cameraRotation.y -= dx * 0.005;
                            cameraRotation.x -= dy * 0.005;
                            cameraRotation.x = Math.max(-Math.PI/2.1, Math.min(Math.PI/2.1, cameraRotation.x));
                        }
                    }
                }, { passive: true });

                // Мобильные кнопки
                document.getElementById('btn-jump').addEventListener('touchstart', () => { keys.space = true; });
                document.getElementById('btn-jump').addEventListener('touchend', () => { keys.space = false; });
                document.getElementById('btn-build').addEventListener('touchstart', placeBlock);
                document.getElementById('btn-break').addEventListener('touchstart', breakBlock);
            } else {
                // ПК Клавиши
                window.addEventListener('keydown', (e) => {
                    if(document.activeElement === document.getElementById('chat-input')) return;
                    let k = e.key.toLowerCase();
                    if(k === 'w' || k === 'ц') keys.w = true;
                    if(k === 's' || k === 'ы') keys.s = true;
                    if(k === 'a' || k === 'ф') keys.a = true;
                    if(k === 'd' || k === 'в') keys.d = true;
                    if(e.code === 'Space') keys.space = true;

                    // Выбор слота инвентаря на клавиши 1-8
                    if(e.key >= 1 && e.key <= 8) selectSlot(e.key);
                });

                window.addEventListener('keyup', (e) => {
                    let k = e.key.toLowerCase();
                    if(k === 'w' || k === 'ц') keys.w = false;
                    if(k === 's' || k === 'ы') keys.s = false;
                    if(k === 'a' || k === 'ф') keys.a = false;
                    if(k === 'd' || k === 'в') keys.d = false;
                    if(e.code === 'Space') keys.space = false;
                });

                // Захват мыши при клике
                document.body.addEventListener('click', (e) => {
                    if (document.pointerLockElement !== document.body && document.getElementById('auth-screen').style.display === 'none') {
                        if (!e.target.closest('#chat-wrapper') && !e.target.closest('#hotbar')) {
                            document.body.requestPointerLock();
                        }
                    }
                });

                window.addEventListener('mousemove', (e) => {
                    if (document.pointerLockElement === document.body) {
                        cameraRotation.y -= e.movementX * 0.0025;
                        cameraRotation.x -= e.movementY * 0.0025;
                        cameraRotation.x = Math.max(-Math.PI/2.1, Math.min(Math.PI/2.1, cameraRotation.x));
                    }
                });

                // Мышка: ЛКМ - сломать, ПКМ - поставить блок
                window.addEventListener('mousedown', (e) => {
                    if (document.pointerLockElement === document.body) {
                        if (e.button === 0) breakBlock();
                        if (e.button === 2) placeBlock();
                    }
                });
            }
        }

        // --- ФИЗИКА (ГРАВИТАЦИЯ, ПРЫЖКИ И КОЛЛИЗИИ) ---
        function checkCollisionAt(pos) {
            // Проверка наличия твердого блока по координатам
            let bx = Math.round(pos.x);
            let by = Math.round(pos.y);
            let bz = Math.round(pos.z);

            // Проверяем изменения игроков
            const key = \`\${bx},\${by},\${bz}\`;
            if (worldChanges[key] !== undefined) {
                return worldChanges[key] !== 0 && worldChanges[key] !== 8; // Вода не имеет коллизий
            }

            // Естественные блоки коллизий
            let height = getNoiseHeight(bx, bz);
            if (by <= height && by >= 0) {
                return true;
            }
            return false;
        }

        // --- СТРОИТЕЛЬСТВО И РАЗРУШЕНИЕ БЛОКОВ (RAYCASTING) ---
        function getLookingAtBlock() {
            // Математический луч из центра камеры вперед
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
            
            // Ищем пересечение с блоками всех чанков
            let visibleGroupMeshes = [];
            for (let key in loadedChunks) {
                visibleGroupMeshes.push(...loadedChunks[key].group.children);
            }

            const intersects = raycaster.intersectObjects(visibleGroupMeshes);
            if (intersects.length > 0 && intersects[0].distance < 6) {
                const hit = intersects[0];
                // Вычисляем глобальные 3D координаты пораженного блока
                const instMesh = hit.object;
                const instanceId = hit.instanceId;
                
                let matrix = new THREE.Matrix4();
                instMesh.getMatrixAt(instanceId, matrix);
                let position = new THREE.Vector3();
                position.setFromMatrixPosition(matrix);
                
                // Также находим нормаль стороны блока, куда мы смотрим (для стройки)
                let normal = hit.face.normal.clone();
                return { pos: position, normal: normal };
            }
            return null;
        }

        function breakBlock() {
            let target = getLookingAtBlock();
            if (target) {
                let bx = Math.round(target.pos.x);
                let by = Math.round(target.pos.y);
                let bz = Math.round(target.pos.z);
                
                socket.send(JSON.stringify({ type: 'blockChange', x: bx, y: by, z: bz, blockType: 0 }));
                swingHand();
            }
        }

        function placeBlock() {
            let target = getLookingAtBlock();
            if (target) {
                // Вычисляем координаты нового блока на основе нормали стороны
                let bx = Math.round(target.pos.x + target.normal.x);
                let by = Math.round(target.pos.y + target.normal.y);
                let bz = Math.round(target.pos.z + target.normal.z);

                // Защита от установки блока внутрь самого себя
                let dToPlayer = playerPos.distanceTo(new THREE.Vector3(bx, by, bz));
                if (dToPlayer < 1.0) return;

                socket.send(JSON.stringify({ type: 'blockChange', x: bx, y: by, z: bz, blockType: activeBlockSlot }));
                swingHand();
            }
        }

        // --- СИНТЕЗАТОР БЕСКОНЕЧНОЙ МУЗЫКИ C418 (Web Audio API) ---
        let isMusicPlaying = false;
        function startMinecraftMusic() {
            if (isMusicPlaying) return;
            isMusicPlaying = true;
            
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const chords = [
                [261.63, 329.63, 392.00, 493.88], // C major 7 (До)
                [293.66, 349.23, 440.00, 587.33], // D minor 7 (Ре)
                [349.23, 440.00, 523.25, 659.25], // F major 7 (Фа)
                [220.00, 261.63, 329.63, 392.00]  // A minor 7 (Ля)
            ];

            function playNote(freq, startTime, duration) {
                let osc = audioCtx.createOscillator();
                let gain = audioCtx.createGain();
                
                osc.type = 'triangle'; // Мягкий флейтовый звук
                osc.frequency.setValueAtTime(freq, startTime);
                
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.04, startTime + 1.5); // Плавная атака
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration); // Мягкий релиз

                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(startTime);
                osc.stop(startTime + duration);
            }

            function playAmbienceLoop() {
                let chord = chords[Math.floor(Math.random() * chords.length)];
                let now = audioCtx.currentTime;
                
                // Проигрываем арпеджио из милого аккорда каждые 12 секунд
                for(let i = 0; i < chord.length; i++) {
                    playNote(chord[i], now + i * 1.5, 6.0);
                }
                setTimeout(playAmbienceLoop, 14000);
            }
            playAmbienceLoop();
        }

        // Анимация махания рукой
        let handSwinging = false, swingTimer = 0;
        function swingHand() {
            handSwinging = true;
            swingTimer = 0;
        }

        // --- ИГРОВОЙ ЦИКЛ (ОБНОВЛЕНИЕ КАДРА И ФИЗИКИ) ---
        function animate() {
            requestAnimationFrame(animate);
            let dt = clock.getDelta();

            // 1. Поворот головы и камеры под оси управления
            camera.quaternion.setFromEuler(new THREE.Euler(cameraRotation.x, cameraRotation.y, 0, 'YXZ'));

            // 2. Движение и физика гравитации игрока
            let moveX = 0, moveZ = 0;
            let forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            forward.y = 0; forward.normalize();
            
            let right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            right.y = 0; right.normalize();

            let wishDir = new THREE.Vector3();

            if (isMobile) {
                wishDir.addScaledVector(forward, moveVector.y);
                wishDir.addScaledVector(right, moveVector.x);
            } else {
                if(keys.w) wishDir.add(forward);
                if(keys.s) wishDir.addScaledVector(forward, -1);
                if(keys.a) wishDir.addScaledVector(right, -1);
                if(keys.d) wishDir.add(right);
            }
            wishDir.normalize();
            moveX = wishDir.x * playerSpeed;
            moveZ = wishDir.z * playerSpeed;

            // Гравитация и физика
            playerVelocity.y += gravity;
            
            // Прыжок
            if(keys.space && isGrounded) {
                playerVelocity.y = jumpForce;
                isGrounded = false;
            }

            // Перемещение с проверкой коллизий
            let nextPos = playerPos.clone();
            nextPos.x += moveX;
            if (!checkCollisionAt(new THREE.Vector3(nextPos.x, playerPos.y, playerPos.z)) &&
                !checkCollisionAt(new THREE.Vector3(nextPos.x, playerPos.y - 1.0, playerPos.z))) {
                playerPos.x = nextPos.x;
            }

            nextPos = playerPos.clone();
            nextPos.z += moveZ;
            if (!checkCollisionAt(new THREE.Vector3(playerPos.x, playerPos.y, nextPos.z)) &&
                !checkCollisionAt(new THREE.Vector3(playerPos.x, playerPos.y - 1.0, nextPos.z))) {
                playerPos.z = nextPos.z;
            }

            // Вертикальная физика коллизий пола
            playerPos.y += playerVelocity.y;
            let feetPos = playerPos.clone();
            feetPos.y -= 1.62; // Рост Стива до уровня глаз

            if (checkCollisionAt(feetPos)) {
                playerPos.y = Math.floor(feetPos.y) + 1.62 + 1.0;
                playerVelocity.y = 0;
                isGrounded = true;
            } else {
                isGrounded = false;
            }

            // Камера жестко закреплена в голове игрока!
            camera.position.copy(playerPos);

            // 3. Динамическая выгрузка/загрузка Чанков мира
            updateVisibleChunks();

            // Небо: плавная анимация дня/ночи
            let dayTime = Date.now() * 0.0001;
            let skyColor = new THREE.Color().setHSL(0.6, 0.8, 0.4 + Math.sin(dayTime) * 0.25);
            scene.background = skyColor;
            scene.fog.color = skyColor;

            // Анимация руки игрока при клике
            let handSwingValue = 0;
            if(handSwinging) {
                swingTimer += 0.2;
                handSwingValue = Math.sin(swingTimer);
                if(swingTimer >= Math.PI) {
                    handSwinging = false;
                    handSwingValue = 0;
                }
            }

            // Отправка данных на сервер
            if (socket.readyState === WebSocket.OPEN && myId) {
                socket.send(JSON.stringify({
                    type: 'move',
                    x: playerPos.x, y: playerPos.y, z: playerPos.z,
                    ry: cameraRotation.y, rx: cameraRotation.x,
                    handSwing: handSwingValue
                }));
            }

            renderer.render(scene, camera);
        }

        // --- СЕТЕВАЯ СИНХРОНИЗАЦИЯ ЧЕРЕЗ WEBSOCKET ---
        socket.onmessage = (event) => {
            let data = JSON.parse(event.data);

            if (data.type === 'init') {
                myId = data.id;
                seed = data.seed;
                worldChanges = data.worldChanges;

                // Создаем уже играющих пользователей
                for (let id in data.players) {
                    if (id !== myId) {
                        otherPlayers[id] = createPlayerModel(data.players[id]);
                    }
                }
            }

            if (data.type === 'playerJoined') {
                if (data.player.id !== myId && !otherPlayers[data.player.id]) {
                    otherPlayers[data.player.id] = createPlayerModel(data.player);
                }
            }

            if (data.type === 'update') {
                let p = otherPlayers[data.id];
                if (p) {
                    p.position.set(data.x, data.y - 1.62, data.z);
                    p.rotation.y = data.ry; // Поворот тела
                    if (p.head) p.head.rotation.x = data.rx; // Поворот головы

                    // Анимация руки Стива у другого игрока
                    if (p.rightArm) {
                        p.rightArm.rotation.x = -data.handSwing * 1.5;
                    }
                }
            }

            if (data.type === 'blockChange') {
                const blockKey = \`\${data.x},\${data.y},\${data.z}\`;
                if (data.blockType === 0) {
                    delete worldChanges[blockKey];
                } else {
                    worldChanges[blockKey] = data.blockType;
                }
                
                // Перегенерируем локально чанк, в котором произошли изменения
                let cx = Math.floor(data.x / CHUNK_SIZE);
                let cz = Math.floor(data.z / CHUNK_SIZE);
                let key = \`\${cx},\${cz}\`;
                if (loadedChunks[key]) {
                    scene.remove(loadedChunks[key].group);
                    delete loadedChunks[key];
                    buildChunk(cx, cz);
                }
            }

            if (data.type === 'playerLeft') {
                if (otherPlayers[data.id]) {
                    scene.remove(otherPlayers[data.id]);
                    delete otherPlayers[data.id];
                }
            }

            if (data.type === 'chat') {
                appendChatMessage(data.name, data.text);
            }
        };

        // --- ЧАТ И АВТОРИЗАЦИЯ ---
        document.getElementById('start-btn').addEventListener('click', () => {
            let nick = document.getElementById('nickname-input').value.trim();
            if (nick) {
                myName = nick;
                document.getElementById('auth-screen').style.display = 'none';
                document.getElementById('crosshair').style.display = 'block';
                document.getElementById('hotbar').style.display = 'flex';
                document.getElementById('chat-wrapper').style.display = 'flex';

                initEngine();
                socket.send(JSON.stringify({ type: 'join', name: myName }));
            }
        });

        const chatMessages = document.getElementById('chat-messages');
        const chatInput = document.getElementById('chat-input');

        function appendChatMessage(sender, text) {
            let msg = document.createElement('div');
            msg.innerHTML = \`<strong>\${sender}:</strong> \${text}\`;
            chatMessages.appendChild(msg);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (document.activeElement === chatInput) {
                    let text = chatInput.value.trim();
                    if(text) {
                        socket.send(JSON.stringify({ type: 'chat', text: text }));
                    }
                    chatInput.value = '';
                    chatInput.blur();
                    if(!isMobile) document.body.requestPointerLock();
                } else {
                    chatInput.focus();
                    if(!isMobile && document.pointerLockElement === document.body) document.exitPointerLock();
                }
            }
        });
    </script>
</body>
</html>
`;
