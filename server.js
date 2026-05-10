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

let players = {};
let worldChanges = {}; 
const SEED = 666; // Хоррор-сид

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
                handSwing: 0,
                isMoving: false
            };
            ws.send(JSON.stringify({ type: 'init', id: playerId, players, worldChanges, seed: SEED }));
            broadcast({ type: 'playerJoined', player: players[playerId] });
        }

        if (data.type === 'move') {
            if (players[playerId]) {
                Object.assign(players[playerId], {
                    x: data.x, y: data.y, z: data.z,
                    ry: data.ry, rx: data.rx,
                    handSwing: data.handSwing,
                    isMoving: data.isMoving
                });
                broadcast({
                    type: 'update', id: playerId,
                    x: data.x, y: data.y, z: data.z,
                    ry: data.ry, rx: data.rx,
                    handSwing: data.handSwing,
                    isMoving: data.isMoving
                }, playerId);
            }
        }

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
                broadcast({ type: 'chat', id: playerId, name: players[playerId].name, text: data.text });
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
    console.log(`Horror Craft Server running on port ${port}`);
});

// КЛИЕНТСКИЙ КОД (БЕЗ ВНЕШНИХ ТЕКСТУР И КАРТИНОК)
const clientHTML = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>Horror Craft 3D</title>
    <style>
        body, html { margin: 0; padding: 0; overflow: hidden; width: 100%; height: 100%; font-family: 'Courier New', monospace; background: #050508; user-select: none; }
        #canvas-container { width: 100%; height: 100%; display: block; }
        
        /* Авторизация */
        #auth-screen { position: absolute; top:0; left:0; width:100%; height:100%; background: #0a0a0f; display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 100; color: #8a0000; text-shadow: 0 0 8px #ff0000; }
        #auth-screen h1 { font-size: 3rem; margin-bottom: 20px; text-align: center; letter-spacing: 5px; }
        #auth-screen input { padding: 12px; font-size: 1.2rem; border: 2px solid #8a0000; background: #111; color: #ff3333; text-align: center; margin-bottom: 20px; outline: none; width: 250px; box-shadow: 0 0 10px rgba(255,0,0,0.2); }
        #auth-screen button { padding: 12px 30px; font-size: 1.2rem; background: #5a0000; border: 2px solid #8a0000; color: #ff3333; cursor: pointer; font-weight: bold; text-shadow: 1px 1px 0px #000; transition: 0.3s; }
        #auth-screen button:hover { background: #8a0000; color: #fff; box-shadow: 0 0 15px #ff0000; }

        /* Прицел */
        #crosshair { position: absolute; top: 50%; left: 50%; width: 12px; height: 12px; transform: translate(-50%, -50%); pointer-events: none; z-index: 5; display: none; }
        #crosshair::before, #crosshair::after { content: ''; position: absolute; background: rgba(138, 0, 0, 0.8); }
        #crosshair::before { top: 5px; left: 0; width: 12px; height: 2px; }
        #crosshair::after { top: 0; left: 5px; width: 2px; height: 12px; }

        /* Хотбар */
        #hotbar { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); display: none; gap: 6px; background: rgba(10,10,15,0.85); padding: 6px; border: 3px solid #5a0000; border-radius: 4px; z-index: 10; }
        .hotbar-slot { width: 40px; height: 40px; border: 2px solid #3a0000; display: flex; justify-content: center; align-items: center; cursor: pointer; background: #15151c; position: relative; }
        .hotbar-slot.active { border-color: #ff0000; background: #2a1515; box-shadow: 0 0 8px #ff0000; }
        .hotbar-slot-color { width: 26px; height: 26px; border-radius: 2px; }
        
        /* Чат */
        #chat-wrapper { position: absolute; top: 15px; left: 15px; width: 320px; display: none; flex-direction: column; z-index: 10; pointer-events: none; }
        #chat-box { background: rgba(0,0,0,0.6); border: 1px solid #5a0000; border-radius: 4px; overflow: hidden; pointer-events: auto; }
        #chat-messages { height: 120px; overflow-y: auto; padding: 8px; font-size: 0.85rem; color: #ff6666; text-shadow: 1px 1px 1px #000; }
        #chat-input-container { display: none; border-top: 1px solid #5a0000; }
        #chat-input { flex: 1; background: #0a0a0f; border: none; color: #fff; padding: 8px; outline: none; font-size: 0.9rem; }

        /* Мобильное управление */
        #mobile-controls { display: none; position: absolute; width: 100%; height: 100%; top:0; left:0; pointer-events: none; z-index: 8; }
        #joystick-zone { position: absolute; bottom: 30px; left: 30px; width: 110px; height: 110px; background: rgba(0,0,0,0.5); border: 2px solid #5a0000; border-radius: 50%; pointer-events: auto; }
        #joystick-stick { position: absolute; top: 30px; left: 30px; width: 46px; height: 46px; background: #8a0000; border-radius: 50%; }
        #action-buttons { position: absolute; bottom: 30px; right: 30px; display: flex; gap: 15px; pointer-events: auto; }
        .action-btn { width: 55px; height: 55px; border-radius: 50%; background: rgba(10,10,15,0.8); border: 2px solid #5a0000; color: #ff3333; font-size: 1.2rem; font-weight: bold; display: flex; justify-content: center; align-items: center; }
        
        #horror-overlay { position: absolute; width: 100%; height: 100%; top: 0; left: 0; background: radial-gradient(circle, transparent 30%, rgba(0,0,0,0.9) 100%); pointer-events: none; z-index: 4; }
        #instructions { position: absolute; bottom: 15px; right: 15px; color: #5a5a6a; font-size: 0.75rem; text-align: right; pointer-events: none; }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
</head>
<body>

    <div id="auth-screen">
        <h1>BLOOD CRAFT</h1>
        <input type="text" id="nickname-input" placeholder="Ваше имя" maxlength="10" value="Выживший">
        <button id="start-btn">СПУСТИТЬСЯ В АД</button>
    </div>

    <div id="horror-overlay"></div>
    <div id="crosshair"></div>

    <div id="hotbar"></div>

    <div id="chat-wrapper">
        <div id="chat-box">
            <div id="chat-messages"></div>
            <div id="chat-input-container">
                <input type="text" id="chat-input" placeholder="Напишите что-нибудь..." maxlength="40">
            </div>
        </div>
    </div>

    <div id="mobile-controls">
        <div id="joystick-zone"><div id="joystick-stick"></div></div>
        <div id="action-buttons">
            <div class="action-btn" id="btn-jump">▲</div>
            <div class="action-btn" id="btn-build">➕</div>
            <div class="action-btn" id="btn-break">⛏️</div>
        </div>
    </div>

    <div id="instructions">ПК: WASD + Мышь | Строить: ПКМ, Ломать: ЛКМ | Чат: Клавиша "T" или "E"</div>

    <div id="canvas-container"></div>

    <script>
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(protocol + '//' + window.location.host);

        let myId = null, myName = "Steve", otherPlayers = {}, worldChanges = {}, seed = 666;
        let scene, camera, renderer, clock, flashlight;
        let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent);

        const CHUNK_SIZE = 16;
        const CHUNK_HEIGHT = 16;
        const VIEW_DISTANCE = 3; 
        let loadedChunks = {}; 

        let playerPos = new THREE.Vector3(0, 15, 0);
        let playerVelocity = new THREE.Vector3();
        let cameraRotation = { x: 0, y: 0 };
        let isGrounded = false;
        const playerSpeed = 0.06; 
        const gravity = -0.008;
        const jumpForce = 0.16;
        const keys = { w: false, a: false, s: false, d: false, space: false };

        let touchStart = { x: 0, y: 0 }, joystickActive = false, moveVector = { x: 0, y: 0 };

        // Цвета вместо картинок-текстур для 100% стабильности работы и страшного стиля
        const BLOCKS = {
            1: { name: "Гнилая Трава", color: "#222c1a" }, 
            2: { name: "Грязь", color: "#1c140e" }, 
            3: { name: "Черный Камень", color: "#111115" }, 
            4: { name: "Красный Песок", color: "#4a1212" }, 
            5: { name: "Иссохшее Дерево", color: "#2d1f18" }, 
            6: { name: "Кровавая Листва", color: "#500606" }, 
            7: { name: "Пепел", color: "#3a3a42" }, 
            8: { name: "Мертвая Вода", color: "#0c051a" }
        };
        let activeBlockSlot = 1;

        // Инициализация
        function initEngine() {
            clock = new THREE.Clock();
            const container = document.getElementById('canvas-container');
            scene = new THREE.Scene();
            
            // Атмосфера кромешной тьмы
            scene.background = new THREE.Color('#030305');
            scene.fog = new THREE.FogExp2('#030305', 0.08); // Очень густой туман хоррора

            camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
            camera.position.copy(playerPos);
            scene.add(camera);

            renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
            container.appendChild(renderer.domElement);

            // Слабый зловещий верхний свет (Кровавая Луна)
            const moonLight = new THREE.DirectionalLight('#4a0505', 0.4);
            moonLight.position.set(20, 40, 20);
            scene.add(moonLight);

            // Направленный фонарик игрока (жуткий желтоватый конус света)
            flashlight = new THREE.SpotLight('#ffefb6', 1.5, 18, Math.PI / 5, 0.6, 1.2);
            flashlight.position.set(0, 0, 0);
            camera.add(flashlight);
            flashlight.target = new THREE.Object3D();
            flashlight.target.position.set(0, 0, -1);
            camera.add(flashlight.target);

            // Создаем хотбар из цветов
            const hotbar = document.getElementById('hotbar');
            for (let id in BLOCKS) {
                let slot = document.createElement('div');
                slot.className = 'hotbar-slot' + (id == activeBlockSlot ? ' active' : '');
                slot.dataset.id = id;
                slot.innerHTML = `<div class="hotbar-slot-color" style="background:${BLOCKS[id].color}"></div>`;
                slot.addEventListener('click', () => selectSlot(id));
                hotbar.appendChild(slot);
            }

            setupControls();
            startHorrorMusic();
            setupHorrorEvents();
            animate();
        }

        function selectSlot(id) {
            activeBlockSlot = parseInt(id);
            document.querySelectorAll('.hotbar-slot').forEach(s => s.classList.remove('active'));
            document.querySelector(`.hotbar-slot[data-id="${id}"]`).classList.add('active');
        }

        // Шум генерации ландшафта
        function pseudoNoise2D(x, z) {
            let n = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453;
            return n - Math.floor(n);
        }

        function getNoiseHeight(x, z) {
            let h1 = Math.sin(x * 0.06) * Math.cos(z * 0.06) * 4;
            let h2 = Math.sin(x * 0.12) * 1.5;
            return Math.floor(h1 + h2 + 6);
        }

        function getBiome(x, z) {
            let val = pseudoNoise2D(Math.floor(x/24), Math.floor(z/24));
            if (val < 0.3) return "ash_wasteland"; // Пепельная пустошь
            if (val > 0.7) return "crimson_forest"; // Багровый лес
            return "dark_hills"; 
        }

        // --- ГЕНЕРАЦИЯ ЧАНКОВ (InstancedMesh) ---
        const chunkGeometry = new THREE.BoxGeometry(1, 1, 1);
        const materials = {};
        for(let id in BLOCKS) {
            materials[id] = new THREE.MeshLambertMaterial({ color: BLOCKS[id].color });
        }

        function buildChunk(cx, cz) {
            const key = `${cx},${cz}`;
            if (loadedChunks[key]) return;

            let chunkBlocks = [];

            for (let x = 0; x < CHUNK_SIZE; x++) {
                for (let z = 0; z < CHUNK_SIZE; z++) {
                    let worldX = cx * CHUNK_SIZE + x;
                    let worldZ = cz * CHUNK_SIZE + z;

                    let height = getNoiseHeight(worldX, worldZ);
                    let biome = getBiome(worldX, worldZ);

                    for (let y = 0; y < CHUNK_HEIGHT; y++) {
                        let finalBlockType = 0;
                        const blockKey = `${worldX},${y},${worldZ}`;

                        if (worldChanges[blockKey] !== undefined) {
                            finalBlockType = worldChanges[blockKey];
                        } else {
                            if (y === height) {
                                if (biome === "ash_wasteland") finalBlockType = 7; // Пепел
                                else if (biome === "crimson_forest") finalBlockType = 4; // Красный песок
                                else finalBlockType = 1; // Мертвая трава
                            } else if (y < height && y > height - 3) {
                                finalBlockType = 2; // Грязь
                            } else if (y <= height - 3) {
                                finalBlockType = 3; // Черный камень
                            } else if (y < 3 && y > height) {
                                finalBlockType = 8; // Черная вода
                            }
                        }

                        if (finalBlockType !== 0) {
                            chunkBlocks.push({ x: worldX, y, z: worldZ, type: finalBlockType });
                        }
                    }

                    // Мертвые деревья
                    if (biome === "crimson_forest" && y === height && pseudoNoise2D(worldX, worldZ) < 0.015) {
                        spawnDeadTree(worldX, height + 1, worldZ, chunkBlocks);
                    }
                }
            }

            let blocksByType = {};
            chunkBlocks.forEach(b => {
                if(!blocksByType[b.type]) blocksByType[b.type] = [];
                blocksByType[b.type].push(b);
            });

            let meshGroup = new THREE.Group();
            let tempMatrix = new THREE.Object3D();

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

        function spawnDeadTree(tx, ty, tz, chunkBlocks) {
            for(let h = 0; h < 5; h++) {
                chunkBlocks.push({ x: tx, y: ty + h, z: tz, type: 5 }); 
            }
            // Кровавая крона
            chunkBlocks.push({ x: tx, y: ty + 5, z: tz, type: 6 });
            chunkBlocks.push({ x: tx+1, y: ty + 4, z: tz, type: 6 });
            chunkBlocks.push({ x: tx-1, y: ty + 4, z: tz, type: 6 });
            chunkBlocks.push({ x: tx, y: ty + 4, z: tz+1, type: 6 });
            chunkBlocks.push({ x: tx, y: ty + 4, z: tz-1, type: 6 });
        }

        function updateVisibleChunks() {
            let currentCX = Math.floor(playerPos.x / CHUNK_SIZE);
            let currentCZ = Math.floor(playerPos.z / CHUNK_SIZE);

            for (let x = -VIEW_DISTANCE; x <= VIEW_DISTANCE; x++) {
                for (let z = -VIEW_DISTANCE; z <= VIEW_DISTANCE; z++) {
                    buildChunk(currentCX + x, currentCZ + z);
                }
            }

            for(let key in loadedChunks) {
                let [cx, cz] = key.split(',').map(Number);
                if(Math.abs(cx - currentCX) > VIEW_DISTANCE + 1 || Math.abs(cz - currentCZ) > VIEW_DISTANCE + 1) {
                    scene.remove(loadedChunks[key].group);
                    delete loadedChunks[key];
                }
            }
        }

        // --- КРАСИВЫЕ ХОРРОР-МОДЕЛИ ИГРОКОВ (Светящиеся во тьме глаза) ---
        function createPlayerModel(playerData) {
            const playerGroup = new THREE.Group();

            // Плащ / Тело
            const bodyGeo = new THREE.BoxGeometry(0.55, 1.1, 0.35);
            const bodyMat = new THREE.MeshLambertMaterial({ color: '#181822' }); 
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.position.y = 0.55;
            playerGroup.add(body);

            // Ноги (черные)
            const legGeo = new THREE.BoxGeometry(0.24, 0.65, 0.3);
            const legMat = new THREE.MeshLambertMaterial({ color: '#09090d' });
            
            const leftLeg = new THREE.Mesh(legGeo, legMat);
            leftLeg.position.set(-0.13, -0.32, 0);
            body.add(leftLeg);
            playerGroup.leftLeg = leftLeg;

            const rightLeg = leftLeg.clone();
            rightLeg.position.x = 0.13;
            body.add(rightLeg);
            playerGroup.rightLeg = rightLeg;

            // Руки
            const armGeo = new THREE.BoxGeometry(0.22, 0.9, 0.22);
            const armMat = new THREE.MeshLambertMaterial({ color: '#2d1a12' });
            
            const leftArm = new THREE.Mesh(armGeo, armMat);
            leftArm.position.set(-0.4, 0.1, 0);
            body.add(leftArm);

            const rightArm = leftArm.clone();
            rightArm.position.x = 0.4;
            body.add(rightArm);
            playerGroup.rightArm = rightArm;

            // Голова (С капюшоном)
            const headGeo = new THREE.BoxGeometry(0.46, 0.46, 0.46);
            const headMat = new THREE.MeshLambertMaterial({ color: '#111' });
            const head = new THREE.Mesh(headGeo, headMat);
            head.position.y = 1.35;
            playerGroup.add(head);
            playerGroup.head = head;

            // Зловещие самосветящиеся глаза (Glow-эффект)
            const eyeGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
            const eyeMat = new THREE.MeshBasicMaterial({ color: '#ff0000' });
            
            const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
            leftEye.position.set(-0.1, 0, 0.22);
            head.add(leftEye);

            const rightEye = leftEye.clone();
            rightEye.position.x = 0.1;
            head.add(rightEye);

            // Контейнер для 3D Чат-облачка над головой
            const chatGroup = new THREE.Group();
            chatGroup.position.set(0, 1.85, 0);
            playerGroup.add(chatGroup);
            playerGroup.chatBubble = chatGroup;

            scene.add(playerGroup);
            return playerGroup;
        }

        // Обновление текста 3D баббла над головой
        function show3DChatBubble(player, text) {
            if (!player || !player.chatBubble) return;
            
            // Очищаем старое облачко
            while(player.chatBubble.children.length > 0) { 
                player.chatBubble.remove(player.chatBubble.children[0]); 
            }

            const canvas = document.createElement('canvas');
            canvas.width = 256; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            
            // Отрисовка баббла (Темный страшный туманный стиль)
            ctx.fillStyle = 'rgba(10, 0, 0, 0.85)';
            ctx.strokeStyle = '#8a0000';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.roundRect(4, 4, 248, 56, 12);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ff9999';
            ctx.font = 'bold 16px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText(text, 128, 36);

            const tex = new THREE.CanvasTexture(canvas);
            const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(1.4, 0.35, 1);
            
            player.chatBubble.add(sprite);

            // Исчезновение ровно через 10 секунд
            setTimeout(() => {
                if (player.chatBubble && player.chatBubble.children.includes(sprite)) {
                    player.chatBubble.remove(sprite);
                }
            }, 10000);
        }

        // --- УПРАВЛЕНИЕ ПК И МОБИЛЬНЫХ ---
        function setupControls() {
            if (isMobile) {
                document.getElementById('mobile-controls').style.display = 'block';

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
                    stick.style.transform = `translate(${dx}px, ${dy}px)`;
                    moveVector = { x: dx / maxDist, y: -dy / maxDist };
                }, { passive: true });

                window.addEventListener('touchend', () => {
                    joystickActive = false;
                    stick.style.transform = 'translate(0px,0px)';
                    moveVector = { x: 0, y: 0 };
                });

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

                document.getElementById('btn-jump').addEventListener('touchstart', () => { keys.space = true; });
                document.getElementById('btn-jump').addEventListener('touchend', () => { keys.space = false; });
                document.getElementById('btn-build').addEventListener('touchstart', placeBlock);
                document.getElementById('btn-break').addEventListener('touchstart', breakBlock);
            } else {
                // ПК Управление
                window.addEventListener('keydown', (e) => {
                    const inputActive = document.activeElement === document.getElementById('chat-input');
                    
                    // Клавиши открытия чата (T или E)
                    if (!inputActive && (e.key.toLowerCase() === 't' || e.key.toLowerCase() === 'e' || e.key.toLowerCase() === 'е' || e.key.toLowerCase() === 'и')) {
                        e.preventDefault();
                        openChat();
                        return;
                    }

                    if (inputActive) return;

                    let k = e.key.toLowerCase();
                    if(k === 'w' || k === 'ц') keys.w = true;
                    if(k === 's' || k === 'ы') keys.s = true;
                    if(k === 'a' || k === 'ф') keys.a = true;
                    if(k === 'd' || k === 'в') keys.d = true;
                    if(e.code === 'Space') keys.space = true;

                    if(e.key >= 1 && e.key <= 8) selectSlot(e.key);
                });

                window.addEventListener('keyup', (e) => {
                    if (document.activeElement === document.getElementById('chat-input')) return;
                    let k = e.key.toLowerCase();
                    if(k === 'w' || k === 'ц') keys.w = false;
                    if(k === 's' || k === 'ы') keys.s = false;
                    if(k === 'a' || k === 'ф') keys.a = false;
                    if(k === 'd' || k === 'в') keys.d = false;
                    if(e.code === 'Space') keys.space = false;
                });

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

                window.addEventListener('mousedown', (e) => {
                    if (document.pointerLockElement === document.body) {
                        if (e.button === 0) breakBlock();
                        if (e.button === 2) placeBlock();
                    }
                });
            }
        }

        // Физика коллизий
        function checkCollisionAt(pos) {
            let bx = Math.round(pos.x);
            let by = Math.round(pos.y);
            let bz = Math.round(pos.z);

            const key = `${bx},${by},${bz}`;
            if (worldChanges[key] !== undefined) {
                return worldChanges[key] !== 0 && worldChanges[key] !== 8;
            }

            let height = getNoiseHeight(bx, bz);
            if (by <= height && by >= 0) {
                return true;
            }
            return false;
        }

        // Raycasting блоков
        function getLookingAtBlock() {
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
            
            let visibleGroupMeshes = [];
            for (let key in loadedChunks) {
                visibleGroupMeshes.push(...loadedChunks[key].group.children);
            }

            const intersects = raycaster.intersectObjects(visibleGroupMeshes);
            if (intersects.length > 0 && intersects[0].distance < 5.5) {
                const hit = intersects[0];
                const instMesh = hit.object;
                const instanceId = hit.instanceId;
                
                let matrix = new THREE.Matrix4();
                instMesh.getMatrixAt(instanceId, matrix);
                let position = new THREE.Vector3();
                position.setFromMatrixPosition(matrix);
                
                let normal = hit.face.normal.clone();
                return { pos: position, normal: normal };
            }
            return null;
        }

        function breakBlock() {
            let target = getLookingAtBlock();
            if (target) {
                socket.send(JSON.stringify({ type: 'blockChange', x: Math.round(target.pos.x), y: Math.round(target.pos.y), z: Math.round(target.pos.z), blockType: 0 }));
                swingHand();
            }
        }

        function placeBlock() {
            let target = getLookingAtBlock();
            if (target) {
                let bx = Math.round(target.pos.x + target.normal.x);
                let by = Math.round(target.pos.y + target.normal.y);
                let bz = Math.round(target.pos.z + target.normal.z);

                if (playerPos.distanceTo(new THREE.Vector3(bx, by, bz)) < 0.9) return;

                socket.send(JSON.stringify({ type: 'blockChange', x: bx, y: by, z: bz, blockType: activeBlockSlot }));
                swingHand();
            }
        }

        // --- БЕСКОНЕЧНЫЙ ТЕМНЫЙ ХОРРОР ЭМБИЕНТ (Web Audio API) ---
        let audioCtx;
        function startHorrorMusic() {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            function playDrone(freq, startTime, duration, volume) {
                let osc = audioCtx.createOscillator();
                let osc2 = audioCtx.createOscillator();
                let gain = audioCtx.createGain();
                
                osc.type = 'sawtooth'; // Плотный пугающий гул
                osc2.type = 'sine';
                
                osc.frequency.setValueAtTime(freq, startTime);
                osc2.frequency.setValueAtTime(freq * 1.01, startTime); // Эффект детюна для жути
                
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(volume, startTime + 2.5); 
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

                osc.connect(gain);
                osc2.connect(gain);
                gain.connect(audioCtx.destination);
                
                osc.start(startTime);
                osc2.start(startTime);
                osc.stop(startTime + duration);
                osc2.stop(startTime + duration);
            }

            function playRandomCreepSound(freq, startTime) {
                let osc = audioCtx.createOscillator();
                let gain = audioCtx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, startTime);
                // Скольжение частоты вниз (эффект падения звука)
                osc.frequency.exponentialRampToValueAtTime(freq / 2, startTime + 3);
                
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.05, startTime + 0.5);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + 3.0);

                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(startTime);
                osc.stop(startTime + 3.0);
            }

            function musicLoop() {
                let now = audioCtx.currentTime;
                // Суббасовый хоррор-гул (бесконечно)
                let baseFreq = 55 + Math.floor(Math.random() * 3) * 5; // Ноты Ля, Си, До суббаса
                playDrone(baseFreq, now, 15.0, 0.08);
                playDrone(baseFreq / 2, now, 15.0, 0.12); // Ультра-бас

                // Редкие скрипы и визги случайным образом во времени
                if (Math.random() > 0.4) {
                    playRandomCreepSound(120 + Math.random() * 300, now + 3 + Math.random() * 8);
                }

                setTimeout(musicLoop, 14000); // Наложение хвостов для бесшовности
            }
            musicLoop();
        }

        // --- СЛУЧАЙНЫЕ СТРАШНЫЕ И ЗЛОВЕЩИЕ СОБЫТИЯ ---
        function setupHorrorEvents() {
            setInterval(() => {
                let r = Math.random();
                
                // 1. Событие: Моргание света и фонарика
                if (r < 0.3 && flashlight) {
                    let flashInterval = setInterval(() => {
                        flashlight.intensity = Math.random() > 0.5 ? 1.8 : 0.0;
                    }, 100);
                    setTimeout(() => {
                        clearInterval(flashInterval);
                        flashlight.intensity = 1.5;
                    }, 1500);
                }
                
                // 2. Событие: Полное погружение во тьму (затмение на секунды)
                if (r > 0.8) {
                    let prevFog = scene.fog.density;
                    scene.fog.density = 0.5; // Ничего не видно в 2 шагах
                    setTimeout(() => {
                        scene.fog.density = prevFog;
                    }, 5000);
                }
            }, 25000);
        }

        let handSwinging = false, swingTimer = 0;
        function swingHand() {
            handSwinging = true;
            swingTimer = 0;
        }

        // --- ИГРОВОЙ ЦИКЛ ОБНОВЛЕНИЯ КАДРА ---
        function animate() {
            requestAnimationFrame(animate);
            let dt = clock.getDelta();

            camera.quaternion.setFromEuler(new THREE.Euler(cameraRotation.x, cameraRotation.y, 0, 'YXZ'));

            let moveX = 0, moveZ = 0;
            let forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            forward.y = 0; forward.normalize();
            
            let right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            right.y = 0; right.normalize();

            let wishDir = new THREE.Vector3();
            let isMoving = false;

            if (isMobile) {
                wishDir.addScaledVector(forward, moveVector.y);
                wishDir.addScaledVector(right, moveVector.x);
                if(Math.hypot(moveVector.x, moveVector.y) > 0.1) isMoving = true;
            } else {
                if(keys.w) wishDir.add(forward);
                if(keys.s) wishDir.addScaledVector(forward, -1);
                if(keys.a) wishDir.addScaledVector(right, -1);
                if(keys.d) wishDir.add(right);
                if(keys.w || keys.s || keys.a || keys.d) isMoving = true;
            }
            wishDir.normalize();
            moveX = wishDir.x * playerSpeed;
            moveZ = wishDir.z * playerSpeed;

            playerVelocity.y += gravity;
            if(keys.space && isGrounded) {
                playerVelocity.y = jumpForce;
                isGrounded = false;
            }

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

            playerPos.y += playerVelocity.y;
            let feetPos = playerPos.clone();
            feetPos.y -= 1.62; 

            if (checkCollisionAt(feetPos)) {
                playerPos.y = Math.floor(feetPos.y) + 1.62 + 1.0;
                playerVelocity.y = 0;
                isGrounded = true;
            } else {
                isGrounded = false;
            }

            camera.position.copy(playerPos);

            // Мягкое зловещее покачивание фонарика при ходьбе
            if(isMoving && flashlight) {
                let t = Date.now() * 0.008;
                flashlight.position.x = Math.sin(t) * 0.05;
                flashlight.position.y = Math.abs(Math.cos(t)) * 0.04;
            }

            updateVisibleChunks();

            // Анимации конечностей других игроков
            let time = Date.now() * 0.006;
            for(let id in otherPlayers) {
                let p = otherPlayers[id];
                if(p.isMoving) {
                    p.leftLeg.rotation.x = Math.sin(time) * 0.7;
                    p.rightLeg.rotation.x = -Math.sin(time) * 0.7;
                } else {
                    p.leftLeg.rotation.x = 0;
                    p.rightLeg.rotation.x = 0;
                }
            }

            let handSwingValue = 0;
            if(handSwinging) {
                swingTimer += 0.25;
                handSwingValue = Math.sin(swingTimer);
                if(swingTimer >= Math.PI) {
                    handSwinging = false;
                    handSwingValue = 0;
                }
            }

            if (socket.readyState === WebSocket.OPEN && myId) {
                socket.send(JSON.stringify({
                    type: 'move',
                    x: playerPos.x, y: playerPos.y, z: playerPos.z,
                    ry: cameraRotation.y, rx: cameraRotation.x,
                    handSwing: handSwingValue,
                    isMoving: isMoving
                }));
            }

            renderer.render(scene, camera);
        }

        // --- WEBSOCKET СЕТЕВАЯ ИНТЕГРАЦИЯ ---
        socket.onmessage = (event) => {
            let data = JSON.parse(event.data);

            if (data.type === 'init') {
                myId = data.id;
                seed = data.seed;
                worldChanges = data.worldChanges;

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
                    p.rotation.y = data.ry;
                    p.isMoving = data.isMoving;
                    if (p.head) p.head.rotation.x = data.rx; 
                    if (p.rightArm) {
                        p.rightArm.rotation.x = -data.handSwing * 1.5;
                    }
                }
            }

            if (data.type === 'blockChange') {
                const blockKey = `${data.x},${data.y},${data.z}`;
                if (data.blockType === 0) {
                    delete worldChanges[blockKey];
                } else {
                    worldChanges[blockKey] = data.blockType;
                }
                
                let cx = Math.floor(data.x / CHUNK_SIZE);
                let cz = Math.floor(data.z / CHUNK_SIZE);
                let key = `${cx},${cz}`;
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
                // Если это сообщение другого игрока, рендерим облачко над ним
                if(otherPlayers[data.id]) {
                    show3DChatBubble(otherPlayers[data.id], data.text);
                }
            }
        };

        // --- УЛУЧШЕННЫЙ ЧАТ НА ПК КНОПКИ (T / E / ENTER) ---
        const chatInputContainer = document.getElementById('chat-input-container');
        const chatInput = document.getElementById('chat-input');
        const chatMessages = document.getElementById('chat-messages');

        function openChat() {
            chatInputContainer.style.display = 'flex';
            chatInput.focus();
            if(!isMobile && document.pointerLockElement === document.body) {
                document.exitPointerLock();
            }
        }

        function closeChat() {
            chatInputContainer.style.display = 'none';
            chatInput.value = '';
            chatInput.blur();
            if(!isMobile) {
                document.body.requestPointerLock();
            }
        }

        function appendChatMessage(sender, text) {
            let msg = document.createElement('div');
            msg.innerHTML = `<span style="color:#8a0000">&lt;${sender}&gt;</span> ${text}`;
            chatMessages.appendChild(msg);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && document.activeElement === chatInput) {
                let text = chatInput.value.trim();
                if(text) {
                    socket.send(JSON.stringify({ type: 'chat', text: text }));
                }
                closeChat();
            }
        });

        // Вход в игру
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
    </script>
</body>
</html>
`;
