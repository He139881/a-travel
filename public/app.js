// 高德地图 API 配置
const AMAP_KEY = '2c5385f0963e09c03c60546742d12f0c';
const API_BASE = 'http://localhost:3000/api';

// ========== 语音管理器（新增） ==========
class SpeechManager {
    constructor() {
        this.queue = [];
        this.isPlaying = false;
        this.currentUtterance = null;
        this.synth = window.speechSynthesis;
        this.voice = null;
        this.loadVoices();
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = () => this.loadVoices();
        }
    }

    loadVoices() {
        const voices = this.synth.getVoices();
        this.voice = voices.find(v => v.lang.includes('zh') && v.name.includes('Google')) ||
            voices.find(v => v.lang.includes('zh')) ||
            voices[0];
    }

    // 添加播报内容，priority: 'urgent' 或 'normal'
    speak(text, priority = 'normal') {
        if (!text) return;
        const cleanText = this.cleanText(text);
        if (!cleanText) return;

        const item = { text: cleanText, priority };

        if (priority === 'urgent') {
            this.stop();
            this.queue = [item];
            this.playNext();
        } else {
            this.queue.push(item);
            if (!this.isPlaying) {
                this.playNext();
            }
        }
    }

    // 文本清洗：保留中英文、数字、常用标点
    cleanText(text) {
        return text.replace(/[^\p{L}\p{N}\p{P}。，？、；：“”‘’！—\s]/gu, '').trim();
    }

    playNext() {
        if (this.queue.length === 0) {
            this.isPlaying = false;
            this.currentUtterance = null;
            return;
        }

        const item = this.queue.shift();
        const utterance = new SpeechSynthesisUtterance(item.text);
        utterance.lang = 'zh-CN';
        utterance.rate = item.priority === 'urgent' ? 1.1 : 0.95;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        if (this.voice) utterance.voice = this.voice;

        utterance.onstart = () => {
            this.isPlaying = true;
            this.currentUtterance = utterance;
            updateVoiceButtonState();
        };
        utterance.onend = () => {
            this.isPlaying = false;
            this.currentUtterance = null;
            updateVoiceButtonState();
            this.playNext();
        };
        utterance.onerror = (e) => {
            console.warn('语音播报错误:', e);
            this.isPlaying = false;
            this.currentUtterance = null;
            updateVoiceButtonState();
            this.playNext();
        };

        this.synth.speak(utterance);
    }

    pause() {
        if (this.isPlaying) {
            this.synth.pause();
            updateVoiceButtonState();
        }
    }

    resume() {
        if (this.synth.paused) {
            this.synth.resume();
            updateVoiceButtonState();
        }
    }

    stop() {
        this.synth.cancel();
        this.queue = [];
        this.isPlaying = false;
        this.currentUtterance = null;
        updateVoiceButtonState();
    }

    get isSpeaking() {
        return this.isPlaying && !this.synth.paused;
    }

    get isPaused() {
        return this.synth.paused;
    }
}

const speechManager = new SpeechManager();

// ========== 语音识别相关 ==========
let recognition = null;
let isListening = false;
let inactivityTimer = null;
const inactivityTimeout = 30000;
let noSpeechCount = 0;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// ========== 全局变量 ==========
let map, poiMarkers = [], obstacleMarkers = [], currentRouteLayer = null;
let startMarker = null, endMarker = null, detailMarkers = [], campusMarker = null;
const ZOOM_THRESHOLD = 15;
let obstacleDetailMarkers = [];
let poiList = [], facilityStatus = {}, obstacles = [];
let context = {
    lastDestination: null,
    lastFacilityType: null,
    lastSearchResults: [],
    lastRouteInfo: null,
    waitingConfirmation: false
};
let suggestionCache = { start: [], end: [] };

// ========== 认证相关 ==========
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}
function isLoggedIn() { return !!localStorage.getItem('token'); }
function requireLogin(action) {
    if (!isLoggedIn()) {
        if (confirm('此功能需要登录，是否前往登录？')) window.location.href = 'login.html';
        return false;
    }
    return true;
}

// ========== 坐标系转换 ==========
const a = 6378245.0, ee = 0.00669342162296594323;
function outOfChina(lat, lng) { return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271; }
function transformLat(lng, lat) {
    let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
    ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(lat * Math.PI) + 40.0 * Math.sin(lat / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(lat / 12.0 * Math.PI) + 320 * Math.sin(lat * Math.PI / 30.0)) * 2.0 / 3.0;
    return ret;
}
function transformLng(lng, lat) {
    let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
    ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(lng * Math.PI) + 40.0 * Math.sin(lng / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(lng / 12.0 * Math.PI) + 300.0 * Math.sin(lng / 30.0 * Math.PI)) * 2.0 / 3.0;
    return ret;
}
function gcj02ToWgs84(lng, lat) {
    if (outOfChina(lat, lng)) return [lng, lat];
    let dlat = transformLat(lng - 105.0, lat - 35.0);
    let dlng = transformLng(lng - 105.0, lat - 35.0);
    let radlat = lat / 180.0 * Math.PI;
    let magic = Math.sin(radlat);
    magic = 1 - ee * magic * magic;
    let sqrtmagic = Math.sqrt(magic);
    dlat = (dlat * 180.0) / ((a * (1 - ee)) / (magic * sqrtmagic) * Math.PI);
    dlng = (dlng * 180.0) / (a / sqrtmagic * Math.cos(radlat) * Math.PI);
    let mglat = lat + dlat;
    let mglng = lng + dlng;
    return [lng * 2 - mglng, lat * 2 - mglat];
}
function convertPoiToWgs84(poi) {
    const [wgsLng, wgsLat] = gcj02ToWgs84(poi.lng, poi.lat);
    return { ...poi, lng: wgsLng, lat: wgsLat };
}
function wgs84ToGcj02(lng, lat) {
    if (outOfChina(lat, lng)) return [lng, lat];
    let dlat = transformLat(lng - 105.0, lat - 35.0);
    let dlng = transformLng(lng - 105.0, lat - 35.0);
    let radlat = lat / 180.0 * Math.PI;
    let magic = Math.sin(radlat);
    magic = 1 - ee * magic * magic;
    let sqrtmagic = Math.sqrt(magic);
    dlat = (dlat * 180.0) / ((a * (1 - ee)) / (magic * sqrtmagic) * Math.PI);
    dlng = (dlng * 180.0) / (a / sqrtmagic * Math.cos(radlat) * Math.PI);
    return [lng + dlng, lat + dlat];
}

// ========== 后端数据加载 ==========
async function loadObstaclesFromServer() {
    try {
        const res = await fetch(`${API_BASE}/obstacles`);
        const data = await res.json();
        obstacles = data;
        updateObstacleMarkers();
    } catch (err) {
        console.error('加载障碍物失败:', err);
    }
}
async function addObstacleToServer(obstacleData) {
    try {
        const res = await fetch(`${API_BASE}/obstacles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(obstacleData)
        });
        return res.ok;
    } catch (err) {
        console.error('上报失败:', err);
        return false;
    }
}
async function loadPoiFromServer() {
    try {
        const [poiRes, statusRes] = await Promise.all([
            fetch(`${API_BASE}/poi`),
            fetch(`${API_BASE}/poi/facility-status`)
        ]);
        if (poiRes.ok) {
            const pois = await poiRes.json();
            poiList = pois;
            window.poiList = pois;
        }
        if (statusRes.ok) {
            const status = await statusRes.json();
            facilityStatus = status;
            window.facilityStatus = status;
        }
        return true;
    } catch (err) {
        console.error('加载 POI 失败', err);
        return false;
    }
}

// ========== 地图初始化 ==========
function initMap() {
    map = L.map('map').setView([26.879, 112.516], 15);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    map.on('zoomend', () => {
        updateMarkersByZoom();
        updateObstaclesByZoom();
    });
    locateAndSetView();
}
function locateAndSetView() {
    document.getElementById('statusText').innerText = '📍 正在定位...';
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            map.setView([lat, lng], 16);
            L.marker([lat, lng], {
                icon: L.divIcon({ className: 'current-location', html: '📍', iconSize: [24, 24] })
            }).addTo(map).bindPopup('您当前的位置').openPopup();
        },
        (error) => console.warn("自动定位失败:", error.message),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
}

// ========== POI 标记 ==========
function addPoiMarkers() {
    detailMarkers.forEach(m => map.removeLayer(m));
    detailMarkers = [];
    const convertedPoiList = poiList.map(poi => convertPoiToWgs84(poi));
    convertedPoiList.forEach(poi => {
        const color = poi.score >= 4 ? '#34c759' : (poi.score >= 3 ? '#ff9500' : '#ff3b30');
        const html = `
            <div style="display: flex; align-items: center; gap: 4px;">
                <div style="background:${color}; width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow:0 1px 2px rgba(0,0,0,0.1);"></div>
                <span style="color: #1a1a1a; font-size: 12px; font-weight: 500; text-shadow: 0 0 2px white, 0 0 2px white; white-space: nowrap;">${poi.name}</span>
            </div>
        `;
        const marker = L.marker([poi.lat, poi.lng], {
            icon: L.divIcon({
                className: 'custom-poi',
                html: html,
                iconSize: [80, 20],
                popupAnchor: [0, -8]
            })
        });
        marker.bindPopup(createPopupContent(poi));
        detailMarkers.push(marker);
    });
    const [campusLng, campusLat] = gcj02ToWgs84(112.516, 26.879);
    const campusCenter = [campusLat, campusLng];
    campusMarker = L.marker(campusCenter, {
        icon: L.divIcon({
            className: 'campus-marker',
            html: `<div style="background:#007aff; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:3px solid white; box-shadow:0 2px 8px rgba(0,0,0,0.2);">
                    <span style="color:white; font-size:18px; font-weight:bold;">🏫</span>
                   </div>
                   <div style="color:#1a1a1a; font-size:12px; font-weight:600; text-align:center; margin-top:4px; background:rgba(255,255,255,0.85); padding:2px 8px; border-radius:16px;">南华大学<br>雨母校区</div>`,
            iconSize: [50, 50],
            popupAnchor: [0, -20]
        })
    }).bindPopup('<b>🏫 南华大学（雨母校区）</b><br>点击放大可查看校园内各建筑的无障碍设施');
    updateMarkersByZoom();
}
function updateMarkersByZoom() {
    const currentZoom = map.getZoom();
    if (currentZoom >= ZOOM_THRESHOLD) {
        if (campusMarker) map.removeLayer(campusMarker);
        detailMarkers.forEach(marker => marker.addTo(map));
    } else {
        detailMarkers.forEach(marker => map.removeLayer(marker));
        if (campusMarker) campusMarker.addTo(map);
    }
}
function createPopupContent(poi) {
    const status = facilityStatus[poi.name] || { elevator: '未知', ramp: '未知', tactilePaving: '未知', stairs: '未知' };
    return `
        <b>${poi.name}</b><br>
        ⭐ 可达性评分: ${poi.score}/5<br>
        🛗 电梯: <span style="color:${status.elevator === '正常' ? 'green' : 'red'}">${status.elevator}</span><br>
        ♿ 坡道: <span style="color:${status.ramp === '正常' ? 'green' : 'red'}">${status.ramp}</span><br>
        🟨 盲道: <span style="color:${status.tactilePaving === '有' ? 'green' : 'red'}">${status.tactilePaving === '有' ? '✓ 有' : '✗ 无'}</span><br>
        📶 台阶: <span style="color:${status.stairs === '无台阶' ? 'green' : 'red'}">${status.stairs === '无台阶' ? '✓ 无障碍' : '⚠️ 有台阶'}</span><br>
        <button onclick="window.navigateTo(${poi.lat}, ${poi.lng}, '${poi.name}')" style="margin-top:5px;padding:5px 10px;">🧭 导航至此</button>
    `;
}

// ========== 障碍物标记 ==========
function updateObstacleMarkers() {
    obstacleDetailMarkers.forEach(m => map.removeLayer(m));
    obstacleDetailMarkers = [];
    obstacleMarkers = [];
    obstacles.forEach(obs => {
        const marker = L.marker([obs.lat, obs.lng], {
            icon: L.divIcon({ className: 'obstacle-marker', html: '⚠️', iconSize: [24, 24] })
        }).addTo(map);
        marker.bindPopup(`
            <b>🚧 ${obs.type}</b><br>
            ${obs.description ? '📝 ' + obs.description + '<br>' : ''}
            状态: ${obs.status}<br>
            上报: ${obs.report_time}
            ${obs.photo ? '<br><img src="' + obs.photo + '" style="max-width:100%; margin-top:5px;">' : ''}
        `);
        obstacleDetailMarkers.push(marker);
        obstacleMarkers.push(marker);
    });
    updateObstaclesByZoom();
}
function updateObstaclesByZoom() {
    const currentZoom = map.getZoom();
    if (currentZoom >= ZOOM_THRESHOLD) {
        obstacleDetailMarkers.forEach(marker => marker.addTo(map));
    } else {
        obstacleDetailMarkers.forEach(marker => map.removeLayer(marker));
    }
}

// ========== 语音播报（封装） ==========
function speak(text, priority = 'normal') {
    speechManager.speak(text, priority);
}

function updateVoiceButtonState() {
    const voiceBtn = document.getElementById('voiceBtn');
    if (isListening) {
        voiceBtn.innerHTML = '🎤 录音中...';
        voiceBtn.style.background = '#ff3b30';
    } else if (speechManager.isSpeaking) {
        voiceBtn.innerHTML = '🔊 播报中...';
        voiceBtn.style.background = '#34c759';
    } else if (speechManager.isPaused) {
        voiceBtn.innerHTML = '⏸️ 已暂停';
        voiceBtn.style.background = '#ff9500';
    } else {
        voiceBtn.innerHTML = '🎤 语音';
        voiceBtn.style.background = '';
    }
}

// 更新顶部用户状态显示
function updateUserStatus() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const statusSpan = document.getElementById('userStatus');
    const loginBtn = document.getElementById('loginBtn');
    if (token && user.username) {
        statusSpan.innerHTML = `✅ ${user.username}`;
        if (loginBtn) loginBtn.innerHTML = '🚪 退出';
    } else {
        statusSpan.innerHTML = '';
        if (loginBtn) loginBtn.innerHTML = '👤 登录';
    }
}

// 处理登录/退出按钮点击
function handleLoginLogout() {
    const token = localStorage.getItem('token');
    if (token) {
        // 已登录 -> 退出
        if (confirm('确定要退出登录吗？')) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            updateUserStatus();
            speak('您已退出登录');
            location.reload(); // 刷新页面重置状态
        }
    } else {
        // 未登录 -> 跳转到登录页
        window.location.href = 'login.html';
    }
}

function vibrate(pattern) {
    if (!navigator.vibrate) return;
    const patterns = { 1: [200, 100], 2: [200, 100, 200], 3: [500], 4: [500, 200, 500] };
    navigator.vibrate(patterns[pattern] || 200);
}

// ========== 设施面板 ==========
function renderFacilityPanel() {
    const container = document.getElementById('facilityList');
    if (!container) return;
    let html = '';
    for (let name in facilityStatus) {
        const status = facilityStatus[name];
        const elevatorClass = status.elevator === '正常' ? 'status-normal' : 'status-warning';
        const rampClass = status.ramp === '正常' ? 'status-normal' : 'status-warning';
        const tactileClass = status.tactilePaving === '有' ? 'status-normal' : 'status-warning';
        const stairsClass = status.stairs === '无台阶' ? 'status-normal' : 'status-warning';
        html += `
            <div class="facility-item" data-name="${name}">
                <div class="facility-name">🏢 ${name}</div>
                <div class="facility-detail">🛗 电梯: <span class="${elevatorClass}">${status.elevator}</span></div>
                <div class="facility-detail">♿ 坡道: <span class="${rampClass}">${status.ramp}</span></div>
                <div class="facility-detail">🟨 盲道: <span class="${tactileClass}">${status.tactilePaving === '有' ? '✓ 有' : '✗ 无'}</span></div>
                <div class="facility-detail">📶 台阶: <span class="${stairsClass}">${status.stairs === '无台阶' ? '✓ 无障碍' : '⚠️ 有台阶'}</span></div>
            </div>
        `;
    }
    container.innerHTML = html;
    document.querySelectorAll('.facility-item').forEach(el => {
        el.addEventListener('click', () => {
            const name = el.getAttribute('data-name');
            const poi = poiList.find(p => p.name === name);
            if (poi) {
                map.setView([poi.lat, poi.lng], 16);
                speak(`${name}，电梯${facilityStatus[name].elevator}，坡道${facilityStatus[name].ramp}，盲道${facilityStatus[name].tactilePaving === '有' ? '有' : '无'}，${facilityStatus[name].stairs === '无台阶' ? '无台阶' : '有台阶'}`);
            }
        });
    });
}

// ========== 路径规划 ==========
function clearRoute() {
    // 清除地图上的路线和标记
    if (currentRouteLayer) map.removeLayer(currentRouteLayer);
    if (startMarker) map.removeLayer(startMarker);
    if (endMarker) map.removeLayer(endMarker);
    startMarker = endMarker = null;
    currentRouteLayer = null;

    // 清空输入框内容
    const startInput = document.getElementById('startAddress');
    const endInput = document.getElementById('endAddress');
    if (startInput) {
        startInput.value = '';
        delete startInput.dataset.location;
        delete startInput.dataset.name;
    }
    if (endInput) {
        endInput.value = '';
        delete endInput.dataset.location;
        delete endInput.dataset.name;
    }

    // 清空建议下拉框
    document.querySelectorAll('.autocomplete-items').forEach(el => {
        el.innerHTML = '';
        el.style.display = 'none';
    });

    // 恢复障碍物标记高亮
    if (window.highlightedMarkers) {
        window.highlightedMarkers.forEach(m => m.setIcon(L.divIcon({ className: 'obstacle-marker', html: '⚠️', iconSize: [24, 24] })));
        window.highlightedMarkers = null;
    }

    // 重置状态栏文字
    document.getElementById('statusText').innerText = '👋 欢迎使用无障碍出行伴侣';
}
function getDistance(coord1, coord2) {
    const R = 6371;
    const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
    const dLng = (coord2.lng - coord1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
async function geocodeAddress(address) {
    const fullAddress = `南华大学雨母校区${address}`;
    const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(fullAddress)}&city=衡阳市&key=${AMAP_KEY}&output=JSON`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.status === '1' && data.geocodes && data.geocodes.length > 0) {
            const location = data.geocodes[0].location.split(',');
            return { lng: parseFloat(location[0]), lat: parseFloat(location[1]) };
        }
        return null;
    } catch (error) {
        console.error('地理编码失败:', error);
        return null;
    }
}
async function reverseGeocode(lat, lng) {
    const url = `https://restapi.amap.com/v3/geocode/regeo?location=${lng},${lat}&key=${AMAP_KEY}&output=JSON`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.status === '1' && data.regeocode) {
            return data.regeocode.formatted_address;
        }
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch (error) {
        console.error('逆地理编码失败:', error);
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
}
async function getAMapRouteByCoords(startCoord, endCoord) {
    const origin = `${startCoord.lng},${startCoord.lat}`;
    const destination = `${endCoord.lng},${endCoord.lat}`;
    const url = `https://restapi.amap.com/v3/direction/walking?origin=${origin}&destination=${destination}&key=${AMAP_KEY}&output=JSON`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.status === '1' && data.route && data.route.paths && data.route.paths.length > 0) {
            const path = data.route.paths[0];
            const steps = path.steps;
            let allCoords = [];
            for (const step of steps) {
                const polyline = step.polyline;
                if (polyline) {
                    let coords = polyline.split(';').map(p => p.split(',').map(Number));
                    coords = coords.map(coord => gcj02ToWgs84(coord[0], coord[1]));
                    allCoords = allCoords.concat(coords);
                }
            }
            return {
                distance: path.distance,
                duration: path.duration,
                geometry: { type: 'LineString', coordinates: allCoords }
            };
        }
        return null;
    } catch (error) {
        console.error('路线规划失败:', error);
        return null;
    }
}
function checkObstaclesAlongRoute(geojson, strictMode = false) {
    const coords = [];
    if (geojson.type === 'LineString') {
        geojson.coordinates.forEach(c => coords.push({ lng: c[0], lat: c[1] }));
    } else return [];
    const threshold = strictMode ? 0.003 : 0.0015;
    return obstacles.filter(obs => coords.some(c => Math.hypot(c.lat - obs.lat, c.lng - obs.lng) < threshold));
}
function highlightNearbyObstacles(obsArray) {
    obstacleMarkers.forEach(m => m.setIcon(L.divIcon({ className: 'obstacle-marker', html: '⚠️', iconSize: [24, 24] })));
    obsArray.forEach(obs => {
        const marker = obstacleMarkers.find(m => {
            const pos = m.getLatLng();
            return Math.abs(pos.lat - obs.lat) < 0.0001 && Math.abs(pos.lng - obs.lng) < 0.0001;
        });
        if (marker) {
            marker.setIcon(L.divIcon({ className: 'obstacle-marker obstacle-highlight', html: '🔴⚠️', iconSize: [28, 28] }));
        }
    });
}
async function planRealRoute() {
    let startAddr = document.getElementById('startAddress').value.trim();
    let endAddr = document.getElementById('endAddress').value.trim();
    const startInput = document.getElementById('startAddress');
    const endInput = document.getElementById('endAddress');
    if (!startAddr || !endAddr) {
        alert('请输入起点和终点地址');
        return;
    }
    document.getElementById('statusText').innerText = '🔍 正在规划路线...';
    let startCoord = null, endCoord = null;
    let startName = startAddr, endName = endAddr;
    if (startInput.dataset.location) {
        const [lng, lat] = startInput.dataset.location.split(',').map(Number);
        startCoord = { lng, lat };
        startName = startInput.dataset.name || startAddr;
    }
    if (endInput.dataset.location) {
        const [lng, lat] = endInput.dataset.location.split(',').map(Number);
        endCoord = { lng, lat };
        endName = endInput.dataset.name || endAddr;
    }
    if (!startCoord) {
        const poi = poiList.find(p => p.name.includes(startAddr) || startAddr.includes(p.name));
        if (poi) { startCoord = { lng: poi.lng, lat: poi.lat }; startName = poi.name; }
    }
    if (!endCoord) {
        const poi = poiList.find(p => p.name.includes(endAddr) || endAddr.includes(p.name));
        if (poi) { endCoord = { lng: poi.lng, lat: poi.lat }; endName = poi.name; }
    }
    if (!startCoord) {
        const coord = await geocodeAddress(startAddr);
        if (coord) startCoord = coord;
    }
    if (!endCoord) {
        const coord = await geocodeAddress(endAddr);
        if (coord) endCoord = coord;
    }
    if (!startCoord || !endCoord) {
        alert('无法解析起点或终点坐标，请从下拉列表中选择校园内的地点，或输入更具体的位置');
        return;
    }
    clearRoute();
    const [startMapLng, startMapLat] = gcj02ToWgs84(startCoord.lng, startCoord.lat);
    const [endMapLng, endMapLat] = gcj02ToWgs84(endCoord.lng, endCoord.lat);
    startMarker = L.marker([startMapLat, startMapLng], {
        icon: L.divIcon({ className: 'route-marker', html: '🚩', iconSize: [28, 28] })
    }).addTo(map).bindPopup(`起点: ${startName}`);
    endMarker = L.marker([endMapLat, endMapLng], {
        icon: L.divIcon({ className: 'route-marker', html: '🏁', iconSize: [28, 28] })
    }).addTo(map).bindPopup(`终点: ${endName}`);
    const route = await getAMapRouteByCoords(startCoord, endCoord);
    if (!route) {
        const latlngs = [[startMapLat, startMapLng], [endMapLat, endMapLng]];
        currentRouteLayer = L.polyline(latlngs, { color: 'red', weight: 4, dashArray: '5, 10' }).addTo(map);
        map.fitBounds(currentRouteLayer.getBounds());
        const distance = getDistance({ lat: startMapLat, lng: startMapLng }, { lat: endMapLat, lng: endMapLng }).toFixed(2);
        document.getElementById('statusText').innerText = `直线距离约 ${distance} 公里（无法获取步行路线）`;
        speak(`直线距离约 ${distance} 公里，请参考地图`);
        return;
    }
    currentRouteLayer = L.geoJSON(route.geometry, {
        style: { color: '#007aff', weight: 6, opacity: 0.8 }
    }).addTo(map);
    map.fitBounds(currentRouteLayer.getBounds());
    const distance = (route.distance / 1000).toFixed(2);
    const duration = Math.round(route.duration / 60);
    const wheelchairMode = document.getElementById('wheelchairModeSearch').checked;
    const modeText = wheelchairMode ? '轮椅优先模式' : '普通模式';
    const baseMsg = `从${startName}到${endName}，路线规划成功（${modeText}），全程约 ${distance} 公里，预计步行 ${duration} 分钟。`;
    document.getElementById('statusText').innerText = baseMsg;
    speak(baseMsg);
    vibrate(3);
    const warnings = checkObstaclesAlongRoute(route.geometry, wheelchairMode);
    if (warnings.length > 0) {
        const types = [...new Set(warnings.map(o => o.type))];
        const warningMsg = wheelchairMode
            ? `⚠️ 轮椅优先模式：沿途发现 ${warnings.length} 处障碍物（${types.join('、')}），强烈建议手动绕行！`
            : `📢 普通模式：沿途有 ${warnings.length} 处障碍物，请注意安全。`;
        speak(warningMsg, 'urgent');
        if (wheelchairMode) vibrate(4);
        highlightNearbyObstacles(warnings);
    }
}
async function useMyLocationAsStart() {
    if (!navigator.geolocation) { alert('浏览器不支持定位'); return; }
    document.getElementById('statusText').innerText = '📍 正在获取您的位置...';
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const addr = await reverseGeocode(lat, lng);
        document.getElementById('startAddress').value = addr;
        document.getElementById('statusText').innerText = '✅ 已设置起点为当前位置';
        speak('起点已设置为当前位置');
    }, (err) => {
        alert('定位失败：' + err.message);
        document.getElementById('statusText').innerText = '❌ 定位失败';
    }, { enableHighAccuracy: true, timeout: 10000 });
}

// ========== 自动完成 ==========
function searchLocalPoi(keyword) {
    if (!keyword || keyword.trim().length === 0) return [];
    const lowerKey = keyword.toLowerCase();
    return poiList.filter(poi =>
        poi.name.toLowerCase().includes(lowerKey) ||
        (poi.type && poi.type.toLowerCase().includes(lowerKey))
    ).slice(0, 10);
}
function renderSuggestions(type, suggestions) {
    const container = document.getElementById(`${type}Suggestions`);
    const input = document.getElementById(`${type}Address`);
    if (!container) return;
    if (!suggestions || suggestions.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }
    let html = '';
    suggestions.forEach((poi, index) => {
        const subText = poi.type ? `${poi.type} · 评分 ${poi.score}` : `评分 ${poi.score}`;
        html += `
            <div class="autocomplete-item" data-index="${index}" data-location="${poi.lng},${poi.lat}" data-name="${poi.name.replace(/"/g, '&quot;')}">
                <div class="main-text">${poi.name}</div>
                <div class="sub-text">${subText}</div>
            </div>
        `;
    });
    container.innerHTML = html;
    container.style.display = 'block';
    suggestionCache[type] = suggestions;
    container.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const index = item.dataset.index;
            const selected = suggestionCache[type][index];
            if (selected) {
                input.value = selected.name;
                input.dataset.location = `${selected.lng},${selected.lat}`;
                input.dataset.name = selected.name;
            }
            container.innerHTML = '';
            container.style.display = 'none';
        });
    });
}
function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}
function handleInput(e, type) {
    const keyword = e.target.value.trim();
    if (keyword.length === 0) {
        document.getElementById(`${type}Suggestions`).style.display = 'none';
        return;
    }
    const suggestions = searchLocalPoi(keyword);
    renderSuggestions(type, suggestions);
}
function initAutocomplete() {
    const startInput = document.getElementById('startAddress');
    const endInput = document.getElementById('endAddress');
    const debouncedStart = debounce((e) => handleInput(e, 'start'), 200);
    const debouncedEnd = debounce((e) => handleInput(e, 'end'), 200);
    startInput.addEventListener('input', debouncedStart);
    endInput.addEventListener('input', debouncedEnd);
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-wrapper')) {
            document.querySelectorAll('.autocomplete-items').forEach(el => el.style.display = 'none');
        }
    });
}

// ========== 语音助手意图处理 ==========
function clearContext() {
    context = {
        lastDestination: null,
        lastFacilityType: null,
        lastSearchResults: [],
        lastRouteInfo: null,
        waitingConfirmation: false
    };
    speak("好的，已经清空，您可以重新说出需求。");
}
function parseIntent(command) {
    const lower = command.toLowerCase();
    if (lower.includes('重新说') || lower.includes('取消') || lower.includes('重来') || lower.includes('清空')) {
        return { intent: 'clear' };
    }
    if (lower.includes('救命') || lower.includes('sos') || lower.includes('帮助我') || lower.includes('求助')) {
        return { intent: 'sos' };
    }
    const navPatterns = [/带我去(.+)/, /导航到(.+)/, /去(.+)/, /我想去(.+)/, /我要去(.+)/];
    for (let pattern of navPatterns) {
        const match = command.match(pattern);
        if (match) {
            let destination = match[1].trim();
            destination = destination.replace(/吧$|呗$|好吗$|谢谢$/g, '');
            if (destination) return { intent: 'navigate', target: destination };
        }
    }
    if (lower.includes('电梯')) return { intent: 'facility', type: '电梯' };
    if (lower.includes('坡道')) return { intent: 'facility', type: '坡道' };
    if (lower.includes('无障碍卫生间') || lower.includes('残疾人卫生间') || lower.includes('第三卫生间')) return { intent: 'facility', type: '无障碍卫生间' };
    if (lower.includes('盲道')) return { intent: 'facility', type: '盲道' };
    if (lower.includes('附近') && (lower.includes('无障碍') || lower.includes('设施') || lower.includes('电梯') || lower.includes('坡道'))) return { intent: 'nearby' };
    if (lower.includes('然后呢') || lower.includes('然后') || lower.includes('接下来')) return { intent: 'then' };
    if (lower.includes('怎么去') || lower.includes('如何前往') || lower.includes('路线')) return { intent: 'howtogo' };
    if (lower.includes('还有多远') || lower.includes('距离')) return { intent: 'distance' };
    if (context.waitingConfirmation && (lower.includes('是') || lower.includes('开始') || lower.includes('好') || lower.includes('导航'))) return { intent: 'confirm' };
    if (context.waitingConfirmation && (lower.includes('不') || lower.includes('取消') || lower.includes('不用'))) return { intent: 'deny' };
    return { intent: 'unknown' };
}
async function executeNavigate(destination) {
    // 1. 终点匹配
    let matchedPoi = poiList.find(poi =>
        poi.name === destination ||
        poi.name.includes(destination) ||
        destination.includes(poi.name)
    );

    let endCoord, endName;

    if (matchedPoi) {
        endCoord = { lng: matchedPoi.lng, lat: matchedPoi.lat };
        endName = matchedPoi.name;
        speak(`好的，正在为您规划到${endName}的路线`);
    } else {
        speak(`正在搜索${destination}的位置，请稍后`);
        const geoResult = await geocodeAddress(destination);
        if (!geoResult) {
            speak(`抱歉，没有找到${destination}，请尝试说出更具体的建筑名称。`);
            return;
        }
        endCoord = geoResult;
        endName = destination;
    }

    context.lastDestination = { name: endName, lat: endCoord.lat, lng: endCoord.lng };

    // 2. 获取起点（优先GPS，失败则使用西门作为默认起点）
    let startCoord = null;
    let startName = '当前位置';

    if (navigator.geolocation) {
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 30000
                });
            });
            startCoord = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            // 尝试逆地理编码，但不阻塞
            reverseGeocode(startCoord.lat, startCoord.lng).then(addr => {
                startName = addr;
            }).catch(() => { });
            speak(`已定位到您的位置，开始规划路线`);
        } catch (err) {
            console.warn('GPS定位失败:', err);
            // 回退到西门（南华大学雨母校区主入口）
            const defaultPoi = poiList.find(p => p.name === '西门');
            if (defaultPoi) {
                startCoord = { lat: defaultPoi.lat, lng: defaultPoi.lng };
                startName = defaultPoi.name;
                speak('无法获取您的位置，已将起点设为西门');
            } else {
                // 最终回退：地图中心
                const center = map.getCenter();
                startCoord = { lat: center.lat, lng: center.lng };
                startName = '地图中心';
                speak('无法获取位置，使用当前地图中心为起点');
            }
        }
    } else {
        // 浏览器不支持定位，使用西门
        const defaultPoi = poiList.find(p => p.name === '西门');
        if (defaultPoi) {
            startCoord = { lat: defaultPoi.lat, lng: defaultPoi.lng };
            startName = defaultPoi.name;
        } else {
            const center = map.getCenter();
            startCoord = { lat: center.lat, lng: center.lng };
            startName = '地图中心';
        }
    }

    // 3. 路线规划
    const route = await getAMapRouteByCoords(startCoord, endCoord);
    if (!route) {
        speak("路线规划失败，请检查网络或稍后再试");
        return;
    }

    context.lastRouteInfo = { distance: route.distance, duration: route.duration };

    // 4. 绘制路线
    clearRoute();

    const [startWgsLng, startWgsLat] = gcj02ToWgs84(startCoord.lng, startCoord.lat);
    const [endWgsLng, endWgsLat] = gcj02ToWgs84(endCoord.lng, endCoord.lat);

    startMarker = L.marker([startWgsLat, startWgsLng], {
        icon: L.divIcon({ className: 'route-marker', html: '🚩', iconSize: [28, 28] })
    }).addTo(map).bindPopup(`起点: ${startName}`);

    endMarker = L.marker([endWgsLat, endWgsLng], {
        icon: L.divIcon({ className: 'route-marker', html: '🏁', iconSize: [28, 28] })
    }).addTo(map).bindPopup(`终点: ${endName}`);

    currentRouteLayer = L.geoJSON(route.geometry, {
        style: { color: '#007aff', weight: 6, opacity: 0.8 }
    }).addTo(map);

    map.fitBounds(currentRouteLayer.getBounds());

    // 5. 播报路线信息（确保一定执行）
    const distanceKm = (route.distance / 1000).toFixed(1);
    const durationMin = Math.round(route.duration / 60);
    const msg = `从${startName}到${endName}的路线规划成功，距离约${distanceKm}公里，步行大约需要${durationMin}分钟。`;
    document.getElementById('statusText').innerText = msg;
    console.log('准备播报:', msg); // 调试日志
    speak(msg);
    vibrate(3);

    // 6. 障碍物检测
    const wheelchairMode = document.getElementById('wheelchairModeSearch').checked;
    const warnings = checkObstaclesAlongRoute(route.geometry, wheelchairMode);
    if (warnings.length > 0) {
        const types = [...new Set(warnings.map(o => o.type))];
        const hasStairs = types.includes('台阶');

        let warningMsg = '';
        if (wheelchairMode) {
            if (hasStairs) {
                warningMsg = `🚫 轮椅优先模式：沿途发现台阶障碍，轮椅无法通行！请务必更换目的地或手动选择其他路径。`;
                document.getElementById('statusText').innerHTML = `<span style="color:red;">🚫 ${warningMsg}</span>`;
            } else {
                warningMsg = `⚠️ 轮椅优先模式：沿途发现 ${warnings.length} 处障碍物（${types.join('、')}），请注意绕行。`;
                document.getElementById('statusText').innerHTML = `<span style="color:#ff9500;">⚠️ ${warningMsg}</span>`;
            }
        } else {
            warningMsg = `📢 普通模式：沿途有 ${warnings.length} 处障碍物，请注意安全。`;
            document.getElementById('statusText').innerHTML = warningMsg;
        }

        speak(warningMsg, 'urgent');
        if (wheelchairMode) vibrate(hasStairs ? 4 : 2);
        highlightNearbyObstacles(warnings);
    }
} function queryFacility(type) {
    let available = [];
    if (type === '电梯') available = poiList.filter(poi => facilityStatus[poi.name]?.elevator === '正常');
    else if (type === '坡道') available = poiList.filter(poi => facilityStatus[poi.name]?.ramp === '正常');
    else if (type === '无障碍卫生间') available = poiList.filter(poi => poi.score >= 4);
    else if (type === '盲道') available = poiList.filter(poi => poi.score >= 3.5);
    if (available.length === 0) {
        speak(`抱歉，当前地图数据中没有找到${type}正常的场所，您可以尝试上报或移动位置。`);
        context.lastSearchResults = [];
        return;
    }
    const names = available.map(p => p.name).join('、');
    speak(`找到${available.length}个${type}正常的场所，包括${names}。需要我为您导航到最近的一个吗？`);
    context.lastFacilityType = type;
    context.lastSearchResults = available;
    context.waitingConfirmation = true;
}
function nearbyFacilities() {
    const center = map.getCenter();
    const radius = 0.05;
    const nearby = poiList.filter(poi => {
        const dist = Math.hypot(poi.lat - center.lat, poi.lng - center.lng);
        return dist < radius;
    });
    if (nearby.length === 0) {
        speak("您附近没有找到无障碍设施，您可以移动地图到更繁华的区域。");
        context.lastSearchResults = [];
        return;
    }
    const names = nearby.map(p => p.name).join('、');
    speak(`您附近有${nearby.length}个地点，包括${names}。需要查询其中某个地点的无障碍设施吗？`);
    context.lastSearchResults = nearby;
    context.waitingConfirmation = true;
}
function handleThen() {
    if (context.lastDestination) {
        speak(`您刚才查询的是${typeof context.lastDestination === 'string' ? context.lastDestination : context.lastDestination.name}，需要我为您重新规划路线吗？`);
    } else if (context.lastFacilityType) {
        speak(`您刚才查询的是${context.lastFacilityType}，需要我为您导航到最近的一个吗？`);
    } else if (context.lastSearchResults.length > 0) {
        speak(`您刚才搜索到${context.lastSearchResults.length}个结果，需要我详细介绍吗？`);
    } else {
        speak("您还没有进行过任何查询，请先说出您的需求，比如导航到图书馆。");
    }
}
function handleHowToGo() {
    if (context.lastDestination) {
        executeNavigate(typeof context.lastDestination === 'string' ? context.lastDestination : context.lastDestination.name);
    } else if (context.lastSearchResults.length > 0) {
        const first = context.lastSearchResults[0];
        speak(`好的，为您规划到${first.name}的路线。`);
        executeNavigate(first.name);
    } else {
        speak("请先告诉我您想去哪里，比如说导航到食堂。");
    }
}
function handleDistance() {
    if (context.lastRouteInfo && context.lastRouteInfo.distance) {
        const km = (context.lastRouteInfo.distance / 1000).toFixed(1);
        const min = Math.round(context.lastRouteInfo.duration / 60);
        speak(`全程约${km}公里，步行大约需要${min}分钟。`);
    } else {
        speak("您还没有规划路线，请先说导航到哪里。");
    }
}
function handleConfirm() {
    if (context.lastSearchResults.length > 0 && context.lastFacilityType) {
        const first = context.lastSearchResults[0];
        speak(`好的，正在为您规划到${first.name}的路线。`);
        executeNavigate(first.name);
    } else if (context.lastDestination) {
        executeNavigate(typeof context.lastDestination === 'string' ? context.lastDestination : context.lastDestination.name);
    } else {
        speak("好的，请说出您的具体需求。");
    }
    context.waitingConfirmation = false;
}
function handleDeny() {
    speak("好的，已取消。您可以重新说出其他需求。");
    context.waitingConfirmation = false;
}
async function processVoiceCommand(command) {
    if (!command || command.trim() === '') {
        speak("不好意思，我没有听清，可以请你再说一遍吗？");
        return;
    }
    const intentObj = parseIntent(command);
    console.log("解析意图:", intentObj);
    switch (intentObj.intent) {
        case 'clear': clearContext(); break;
        case 'sos': sos(); break;
        case 'navigate': await executeNavigate(intentObj.target); break;
        case 'facility': queryFacility(intentObj.type); break;
        case 'nearby': nearbyFacilities(); break;
        case 'then': handleThen(); break;
        case 'howtogo': handleHowToGo(); break;
        case 'distance': handleDistance(); break;
        case 'confirm': handleConfirm(); break;
        case 'deny': handleDeny(); break;
        default: speak("抱歉，我暂时无法理解这个需求，你可以试着说“导航到教学楼”或“找无障碍卫生间”。");
    }
}

// ========== 语音识别 ==========
function initSpeechRecognition() {
    if (!SpeechRecognition) return null;
    const recog = new SpeechRecognition();
    recog.lang = 'zh-CN';
    recog.continuous = true;
    recog.interimResults = false;
    recog.maxAlternatives = 1;

    recog.onresult = (event) => {
        resetInactivityTimer();
        noSpeechCount = 0;
        const last = event.results[event.results.length - 1];
        if (last.isFinal) {
            const command = last[0].transcript;
            document.getElementById('statusText').innerText = `🎤 识别到: ${command}`;
            processVoiceCommand(command).catch(console.error);
        }
    };

    recog.onerror = (event) => {
        console.warn("语音识别错误:", event.error);
        if (event.error === 'no-speech') {
            noSpeechCount++;
            if (noSpeechCount >= 2) {
                speak("未检测到声音，语音模式已自动退出。", 'urgent');
                stopListening();
                noSpeechCount = 0;
            }
        } else if (event.error === 'audio-capture') {
            speak("没有检测到麦克风，请检查权限。", 'urgent');
            stopListening();
        } else if (event.error === 'not-allowed') {
            speak("请允许麦克风权限才能使用语音功能。", 'urgent');
            stopListening();
        } else if (event.error === 'network') {
            speak("网络不稳定，请稍后再试。");
        }
    };

    recog.onend = () => {
        if (isListening) {
            setTimeout(() => {
                if (isListening && recognition) {
                    try { recognition.start(); } catch (e) { stopListening(); }
                }
            }, 1000);
        }
    };
    return recog;
}
function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        if (isListening) {
            speak("尊敬的用户，由于长时间未检测到声音，语音小助手暂时下线。");
            stopListening();
        }
    }, inactivityTimeout);
}
function startListening() {
    if (!SpeechRecognition) {
        alert("浏览器不支持语音识别");
        return false;
    }
    if (!recognition) {
        recognition = initSpeechRecognition();
        if (!recognition) return false;
    }
    try {
        recognition.start();
        isListening = true;
        noSpeechCount = 0;
        updateVoiceButtonState();
        document.getElementById('statusText').innerText = '🎙️ 持续监听中，您可以说话...';
        resetInactivityTimer();
        return true;
    } catch (e) {
        console.error("启动语音识别失败:", e);
        if (e.message && e.message.includes('start')) {
            try { recognition.stop(); } catch (ex) { }
            setTimeout(() => startListening(), 500);
        }
        return false;
    }
}
function stopListening() {
    if (recognition && isListening) {
        try { recognition.stop(); } catch (e) { }
        isListening = false;
        if (inactivityTimer) clearTimeout(inactivityTimer);
        updateVoiceButtonState();
        document.getElementById('statusText').innerHTML = '👋 欢迎使用无障碍出行伴侣';
    }
}
function togglePauseResume() {
    if (speechManager.isPaused) {
        speechManager.resume();
    } else if (speechManager.isSpeaking) {
        speechManager.pause();
    }
}
function stopSpeaking() {
    speechManager.stop();
}
function toggleVoiceRecognition() {
    if (speechManager.isSpeaking) {
        speechManager.pause();
        speak("语音播报已暂停，您可以继续说出指令。");
        return;
    }
    if (isListening) {
        stopListening();
        return;
    }
    startListening();
}

// ========== 其他功能 ==========
async function sos() {
    // 获取当前位置
    if (!navigator.geolocation) {
        alert('浏览器不支持定位，无法发送SOS');
        return;
    }
    document.getElementById('statusText').innerText = '🚨 正在获取位置并发送求助...';
    navigator.geolocation.getCurrentPosition(async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        let address = '';
        try {
            address = await reverseGeocode(lat, lng);
        } catch (e) {}
        const message = prompt('请输入求助详情（可选）', '需要帮助，请尽快联系！');
        const data = { lat, lng, address, message: message || 'SOS 紧急求助' };
        try {
            const res = await fetch(`${API_BASE}/sos`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                const msg = 'SOS求助已发送！管理员将尽快处理。';
                speak(msg, 'urgent');
                document.getElementById('statusText').innerHTML = `<span style="color:red;">🚨 ${msg}</span>`;
                vibrate(4);
                alert(msg);
            } else {
                throw new Error('服务器响应失败');
            }
        } catch (err) {
            console.error('SOS发送失败:', err);
            alert('网络错误，SOS求助发送失败，请稍后重试');
        }
    }, (err) => {
        alert('获取位置失败，无法发送SOS');
        document.getElementById('statusText').innerText = '❌ 定位失败，SOS未发送';
    }, { enableHighAccuracy: true, timeout: 10000 });
}
async function showReportModal() {

    if (!isLoggedIn()) {
        if (confirm('上报障碍物需要登录，是否前往登录？')) {
            window.location.href = 'login.html';
        }
        return;
    }

    const center = map.getCenter();
    const lat = center.lat, lng = center.lng;
    document.getElementById('obstacleLat').value = lat.toFixed(6);
    document.getElementById('obstacleLng').value = lng.toFixed(6);
    document.getElementById('reportLocationCoords').innerText = `经度: ${lng.toFixed(6)}, 纬度: ${lat.toFixed(6)}`;
    document.getElementById('reportLocationName').innerText = '正在获取地点名称...';
    document.getElementById('reportModal').style.display = 'flex';
    try {
        const addr = await reverseGeocode(lat, lng);
        document.getElementById('reportLocationName').innerHTML = `<strong>${addr}</strong>`;
    } catch (e) {
        document.getElementById('reportLocationName').innerText = '无法获取地点名称';
    }
    document.getElementById('locationHint').innerText = `📍 位置：${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
function showStats() {
    document.getElementById('chartModal').style.display = 'flex';
    const accessibleCount = poiList.filter(p => p.score >= 3.5).length;
    const notAccessible = poiList.length - accessibleCount;
    const coverageChart = echarts.init(document.getElementById('coverageChart'));
    coverageChart.setOption({
        title: { text: '无障碍设施覆盖率' },
        series: [{ type: 'pie', radius: '60%', data: [{ name: '无障碍友好', value: accessibleCount }, { name: '待改善', value: notAccessible }] }]
    });
    const days = [], counts = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(5, 10);
        days.push(dateStr);
        counts.push(obstacles.filter(o => o.report_time && o.report_time.startsWith(d.toISOString().slice(0, 10))).length);
    }
    const trendChart = echarts.init(document.getElementById('trendChart'));
    trendChart.setOption({ title: { text: '近一周上报趋势' }, xAxis: { type: 'category', data: days }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: counts }] });
}
function locateUser() {
    if (!navigator.geolocation) { alert("浏览器不支持地理定位"); return; }
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude, lng = position.coords.longitude;
            map.setView([lat, lng], 16);
            L.marker([lat, lng], { icon: L.divIcon({ className: 'current-location', html: '📍', iconSize: [24, 24] }) }).addTo(map).bindPopup('您当前的位置').openPopup();
            speak("已定位到您的位置");
        },
        (error) => { alert("定位失败：" + error.message); },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}
function saveContrastPref(enabled) { localStorage.setItem('highContrast', enabled); }
function loadContrastPref() { return localStorage.getItem('highContrast') === 'true'; }

// ========== 页面初始化 ==========
window.onload = async () => {
    initMap();
    await loadPoiFromServer();
    await loadObstaclesFromServer();
    addPoiMarkers();
    updateObstacleMarkers();
    renderFacilityPanel();
    initAutocomplete();
    updateUserStatus();
    document.getElementById('loginBtn').onclick = handleLoginLogout;
    document.getElementById('voiceBtn').onclick = toggleVoiceRecognition;
    document.getElementById('sosBtn').onclick = sos;
    document.getElementById('reportBtn').onclick = showReportModal;
    document.getElementById('statsBtn').onclick = showStats;
    document.getElementById('closeModal').onclick = () => document.getElementById('chartModal').style.display = 'none';
    document.getElementById('closeReportModal').onclick = () => document.getElementById('reportModal').style.display = 'none';
    document.getElementById('agreePrivacy').onclick = () => document.getElementById('privacyModal').style.display = 'none';
    document.getElementById('locateBtn').onclick = locateUser;
    document.getElementById('searchRouteBtn').addEventListener('click', planRealRoute);
    document.getElementById('useMyLocationBtn').addEventListener('click', useMyLocationAsStart);
    document.getElementById('clearRouteBtn').addEventListener('click', () => { clearRoute(); speak('路线已清除'); });

    const pauseResumeBtn = document.getElementById('pauseResumeBtn');
    if (pauseResumeBtn) pauseResumeBtn.onclick = togglePauseResume;
    const stopSpeakBtn = document.getElementById('stopSpeakBtn');
    if (stopSpeakBtn) stopSpeakBtn.onclick = stopSpeaking;

    const contrastBtn = document.getElementById('contrastBtn');
    if (loadContrastPref()) document.body.classList.add('high-contrast');
    contrastBtn.onclick = () => {
        document.body.classList.toggle('high-contrast');
        saveContrastPref(document.body.classList.contains('high-contrast'));
    };
    document.getElementById('clearDataBtn').onclick = () => {
        if (confirm('清除所有本地数据？不可恢复。')) { localStorage.clear(); location.reload(); }
    };
    window.onclick = (e) => { if (e.target.classList.contains('modal')) e.target.style.display = 'none'; };

    const photoInput = document.getElementById('obstaclePhoto');
    if (photoInput) {
        photoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    document.getElementById('photoPreview').src = ev.target.result;
                    document.getElementById('photoPreview').style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });
    }
    document.getElementById('reportForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.getElementById('obstacleType').value;
        const desc = document.getElementById('obstacleDesc').value;
        const photoData = document.getElementById('photoPreview').src;
        const lat = parseFloat(document.getElementById('obstacleLat').value);
        const lng = parseFloat(document.getElementById('obstacleLng').value);
        const newObstacle = {
            id: Date.now(), lat, lng, type, description: desc, status: "未处理",
            report_time: new Date().toISOString().slice(0, 10), photo: photoData || null
        };
        const success = await addObstacleToServer(newObstacle);
        if (success) {
            obstacles.push(newObstacle);
            updateObstacleMarkers();
            document.getElementById('reportModal').style.display = 'none';
            speak("感谢上报，管理员会尽快处理");
            vibrate(1);
            document.getElementById('reportForm').reset();
            document.getElementById('photoPreview').style.display = 'none';
        } else {
            alert('上报失败，请稍后重试');
        }
    });

    setInterval(() => {
        renderFacilityPanel();
        document.getElementById('refreshIndicator').style.opacity = '0.6';
        setTimeout(() => document.getElementById('refreshIndicator').style.opacity = '1', 300);
    }, 30000);
};