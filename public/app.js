// 高德地图 API 配置
const AMAP_KEY = '2c5385f0963e09c03c60546742d12f0c';
const API_BASE = 'http://localhost:3000/api';

// ========== 坐标系转换（WGS-84 → GCJ-02，用于GPS定位） ==========
const a = 6378245.0;
const ee = 0.00669342162296594323;

const pinyinMap = {
    '图': 't', '书': 's', '馆': 'g', '教': 'j', '学': 'x', '楼': 'l', '食': 's', '堂': 't',
    '宿': 's', '舍': 's', '西': 'x', '门': 'm', '东': 'd', '南': 'n', '北': 'b',
    '一': 'y', '二': 'e', '三': 's', '四': 's', '五': 'w', '六': 'l', '七': 'q',
    '逸': 'y', '夫': 'f', '计': 'j', '算': 's', '机': 'j', '电': 'd', '气': 'q',
    '机': 'j', '械': 'x', '崇': 'c', '业': 'y', '义': 'y', '德': 'd', '礼': 'l',
    '慎': 's', '行': 'x', '语': 'y', '言': 'y', '文': 'w', '松': 's', '霖': 'l',
    '建': 'j', '筑': 'z', '设': 's', '艺': 'y', '术': 's', '校': 'x', '史': 's',
    '笃': 'd', '行': 'x', '园': 'y', '尚': 's', '学': 'x', '田': 't', '径': 'j',
    '场': 'c', '篮': 'l', '球': 'q', '网': 'w', '羽': 'y', '毛': 'm', '乒': 'p',
    '乓': 'p', '活': 'h', '动': 'd', '中': 'z', '心': 'x', '医': 'y', '务': 'w',
    '室': 's', '菜': 'c', '鸟': 'n', '驿': 'y', '站': 'z', '库': 'k', '底': 'd',
    '咖': 'k', '啡': 'f', '蜜': 'm', '雪': 'x', '冰': 'b', '城': 'c', '瑞': 'r',
    '幸': 'x', '吧': 'b', '零': 'l', '食': 's', '很': 'h', '忙': 'm', '皇': 'h',
    '迪': 'd', '炸': 'z', '鸡': 'j', '腿': 't'
};

// 二级地标（区域聚合点）
const regionPois = [
    { name: "三省园宿舍区", lat: 26.888983, lng: 112.520248, type: "宿舍区" },
    { name: "雨母楼教学区", lat: 26.884949, lng: 112.522902, type: "教学楼群" },
    { name: "笃行园宿舍区", lat: 26.888505, lng: 112.525452, type: "宿舍区" },
    { name: "南门入口区", lat: 26.880822, lng: 112.523210, type: "校门" },
    { name: "东门入口区", lat: 26.886840, lng: 112.527157, type: "校门" },
    { name: "松霖建筑与设计艺术学院", lat: 26.886844, lng: 112.524511, type: "学院楼" },
    { name: "计算机/电气学院区", lat: 26.8869, lng: 112.5198, type: "学院楼群" }
];

function getPinyinInitials(str) {
    return str.split('').map(ch => pinyinMap[ch] || ch).join('').toLowerCase();
}

let fuseInstance = null;
function initFuse(poiList) {
    const listWithPinyin = poiList.map(p => ({
        ...p,
        pinyin: getPinyinInitials(p.name)
    }));
    fuseInstance = new Fuse(listWithPinyin, {
        keys: ['name', 'type', 'pinyin'],
        threshold: 0.4,
        distance: 100,
        includeScore: true
    });
}

function outOfChina(lat, lng) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

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

let roadSegments = [];
let roadLayers = [];
let detailMarkers = [];     // 一级详细地标
let regionMarkers = [];     // 二级区域地标
let campusMarker = null;    // 校园总标记

async function loadRoadSegments() {
    try {
        const res = await fetch(`${API_BASE}/roads`);
        const data = await res.json();
        roadSegments = data;
        drawRoadSegments();
    } catch (err) {
        console.error('加载道路数据失败:', err);
    }
}

function drawRoadSegments() {
    roadLayers.forEach(layer => map.removeLayer(layer));
    roadLayers = [];
    roadSegments.forEach(seg => {
        let color = '#888888';
        let weight = 4;
        if (seg.wheelchair_passable === '是') {
            color = '#34c759';
        } else if (seg.wheelchair_passable === '否' || seg.wheelchair_passable === '否（有台阶）') {
            color = '#ff3b30';
        } else if (seg.segment_type === '坡道' || seg.wheelchair_passable === '坡道陡，仅电动轮椅可通行') {
            color = '#ff9500';
        } else if (seg.segment_type === '坡道台阶混合') {
            color = '#ff9500';
            weight = 5;
        }
        const latlngs = [
            [seg.start_lat, seg.start_lng],
            [seg.end_lat, seg.end_lng]
        ];
        const polyline = L.polyline(latlngs, {
            color: color,
            weight: weight,
            opacity: 0.8,
            className: 'custom-road'
        }).addTo(map);
        let popupText = `<b>${seg.segment_type || '道路'}</b><br>`;
        popupText += `轮椅通行: ${seg.wheelchair_passable}<br>`;
        if (seg.notes) popupText += `备注: ${seg.notes}`;
        polyline.bindPopup(popupText);
        roadLayers.push(polyline);
    });
    console.log(`✅ 已绘制 ${roadSegments.length} 条自定义道路`);
}

// ========== 语音管理器 ==========
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
const inactivityTimeout = 60000;
let noSpeechCount = 0;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// ========== 全局变量 ==========
let map, poiMarkers = [], obstacleMarkers = [], currentRouteLayer = null;
let startMarker = null, endMarker = null; 
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
let routeDragDebounceTimer = null;

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
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
            initFuse(poiList);
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
    L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
        subdomains: ['1', '2', '3', '4'],
        attribution: '&copy; <a href="https://www.amap.com">高德地图</a>'
    }).addTo(map);
    map.on('zoomend', () => {
        updateMarkersByZoom();
        updateObstaclesByZoom();
    });
    locateAndSetView();
}

function locateAndSetView() {
    const statusEl = document.getElementById('statusText');
    statusEl.innerText = '📍 正在定位...';
    if (!navigator.geolocation) {
        statusEl.innerText = '⚠️ 浏览器不支持定位，使用默认校园位置';
        map.setView([26.879, 112.516], 15);
        return;
    }
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const [lng, lat] = wgs84ToGcj02(position.coords.longitude, position.coords.latitude);
            map.setView([lat, lng], 16);
            L.marker([lat, lng], {
                icon: L.divIcon({ className: 'current-location', html: '📍', iconSize: [24, 24] })
            }).addTo(map).bindPopup('您当前的位置').openPopup();
            let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            try {
                const addr = await reverseGeocode(lat, lng);
                if (addr) address = addr;
            } catch (e) {}
            const successMsg = `📍 当前位置：${address}`;
            statusEl.innerText = successMsg;
            speak(successMsg);
            const startInput = document.getElementById('startAddress');
            if (startInput) {
                startInput.value = address;
                startInput.dataset.location = `${lng},${lat}`;
                startInput.dataset.name = '我的位置';
            }
        },
        (error) => {
            console.warn("自动定位失败:", error.message);
            let msg = '📍 定位失败，使用默认校园位置';
            if (error.code === 1) msg = '📍 定位权限被拒绝，使用默认位置';
            else if (error.code === 3) msg = '⏱️ 定位超时，使用默认位置';
            statusEl.innerText = msg;
            map.setView([26.879, 112.516], 15);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
}

// ========== POI 标记 ==========
function addPoiMarkers() {
    detailMarkers.forEach(m => map.removeLayer(m));
    regionMarkers.forEach(m => map.removeLayer(m));
    if (campusMarker) map.removeLayer(campusMarker);
    detailMarkers = [];
    regionMarkers = [];

    poiList.forEach(poi => {
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

    regionPois.forEach(region => {
        const html = `
            <div style="display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.9); padding: 4px 8px; border-radius: 20px; box-shadow: 0 2px 6px rgba(0,0,0,0.15);">
                <span style="font-size: 16px;">📍</span>
                <span style="color: #1a1a1a; font-size: 13px; font-weight: 600; white-space: nowrap;">${region.name}</span>
            </div>
        `;
        const marker = L.marker([region.lat, region.lng], {
            icon: L.divIcon({
                className: 'region-marker',
                html: html,
                iconSize: [120, 30],
                popupAnchor: [0, -12]
            })
        });
        marker.bindPopup(`<b>${region.name}</b><br>类型: ${region.type}<br><i>放大查看详细建筑</i>`);
        regionMarkers.push(marker);
    });

    const campusCenter = [26.879, 112.516];
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
    detailMarkers.forEach(m => map.removeLayer(m));
    regionMarkers.forEach(m => map.removeLayer(m));
    if (campusMarker) map.removeLayer(campusMarker);
    if (currentZoom >= 15) {
        detailMarkers.forEach(m => m.addTo(map));
    } else if (currentZoom >= 13) {
        regionMarkers.forEach(m => m.addTo(map));
    } else {
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
        voiceBtn.style.color = 'white';
    } else if (speechManager.isSpeaking) {
        voiceBtn.innerHTML = '🔊 播报中';
        voiceBtn.style.background = '#34c759';
        voiceBtn.style.color = 'white';
    } else {
        voiceBtn.innerHTML = '🎤 语音';
        voiceBtn.style.background = '';
        voiceBtn.style.color = '';
    }
}

function updateUserStatus() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const statusSpan = document.getElementById('userStatus');
    const userCenterBtn = document.getElementById('userCenterBtn');
    if (token && user.username) {
        statusSpan.innerHTML = `✅ ${user.username}`;
        if (userCenterBtn) {
            userCenterBtn.innerHTML = '👤 我的';
            userCenterBtn.href = 'user.html';
            userCenterBtn.onclick = null;
        }
    } else {
        statusSpan.innerHTML = '';
        if (userCenterBtn) {
            userCenterBtn.innerHTML = '👤 登录';
            userCenterBtn.href = 'javascript:void(0)';
            userCenterBtn.onclick = (e) => {
                e.preventDefault();
                window.location.href = 'login.html';
            };
        }
    }
}

function handleLoginLogout() {
    const token = localStorage.getItem('token');
    if (token) {
        if (confirm('确定要退出登录吗？')) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            updateUserStatus();
            speak('您已退出登录');
            location.reload();
        }
    } else {
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
    if (currentRouteLayer) map.removeLayer(currentRouteLayer);
    if (startMarker) map.removeLayer(startMarker);
    if (endMarker) map.removeLayer(endMarker);
    startMarker = endMarker = null;
    currentRouteLayer = null;
    const startInput = document.getElementById('startAddress');
    const endInput = document.getElementById('endAddress');
    if (startInput) {
        startInput.value = '';
        delete startInput.dataset.location;
        delete startInput.dataset.name;
        startInput.classList.remove('input-invalid');
    }
    if (endInput) {
        endInput.value = '';
        delete endInput.dataset.location;
        delete endInput.dataset.name;
        endInput.classList.remove('input-invalid');
    }
    document.querySelectorAll('.autocomplete-items').forEach(el => {
        el.innerHTML = '';
        el.style.display = 'none';
    });
    if (window.highlightedMarkers) {
        window.highlightedMarkers.forEach(m => m.setIcon(L.divIcon({ className: 'obstacle-marker', html: '⚠️', iconSize: [24, 24] })));
        window.highlightedMarkers = null;
    }
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
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        if (data.status === '1' && data.geocodes && data.geocodes.length > 0) {
            const location = data.geocodes[0].location.split(',');
            return { lng: parseFloat(location[0]), lat: parseFloat(location[1]) };
        }
        console.warn('高德地理编码返回空:', data);
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

async function replanRouteAfterDrag(newStartCoord, newEndCoord, startName, endName) {
    if (currentRouteLayer) map.removeLayer(currentRouteLayer);
    const statusEl = document.getElementById('statusText');
    statusEl.innerText = '🔄 重新规划路线中...';
    let route = null;
    try {
        route = await getAMapRouteByCoords(newStartCoord, newEndCoord);
    } catch (e) {
        console.error('获取路线异常:', e);
    }
    if (!route) {
        console.warn('[重规划] 高德路线失败，使用直线');
        const latlngs = [[newStartCoord.lat, newStartCoord.lng], [newEndCoord.lat, newEndCoord.lng]];
        currentRouteLayer = L.polyline(latlngs, { color: 'red', weight: 4, dashArray: '5, 10' }).addTo(map);
        const distance = getDistance({ lat: newStartCoord.lat, lng: newStartCoord.lng }, { lat: newEndCoord.lat, lng: newEndCoord.lng }).toFixed(2);
        const msg = `直线距离约 ${distance} 公里（无法获取步行路线）`;
        statusEl.innerText = msg;
        speak(msg);
        return;
    }
    currentRouteLayer = L.geoJSON(route.geometry, {
        style: { color: '#007aff', weight: 6, opacity: 0.8 }
    }).addTo(map);
    const distance = (route.distance / 1000).toFixed(2);
    const duration = Math.round(route.duration / 60);
    const wheelchairMode = document.getElementById('wheelchairModeSearch').checked;
    const modeText = wheelchairMode ? '轮椅优先模式' : '普通模式';
    const baseMsg = `从${startName}到${endName}，路线规划成功（${modeText}），全程约 ${distance} 公里，预计步行 ${duration} 分钟。`;
    statusEl.innerText = baseMsg;
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

async function planRealRoute() {
    const startInput = document.getElementById('startAddress');
    const endInput = document.getElementById('endAddress');
    const startAddr = startInput.value.trim();
    const endAddr = endInput.value.trim();
    const statusEl = document.getElementById('statusText');
    if (!startAddr || !endAddr) {
        alert('请输入起点和终点地址');
        return;
    }
    statusEl.innerText = '🔍 正在规划路线...';
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
        const poi = poiList.find(p => p.name === startAddr || p.name.includes(startAddr) || startAddr.includes(p.name));
        if (poi) {
            startCoord = { lng: poi.lng, lat: poi.lat };
            startName = poi.name;
        }
    }
    if (!endCoord) {
        const poi = poiList.find(p => p.name === endAddr || p.name.includes(endAddr) || endAddr.includes(p.name));
        if (poi) {
            endCoord = { lng: poi.lng, lat: poi.lat };
            endName = poi.name;
        }
    }
    if (!startCoord) {
        statusEl.innerText = '❌ 起点无效，请输入正确的校园地点或从下拉列表中选择';
        speak('起点无法识别，请重新输入');
        startInput.classList.add('input-invalid');
        return;
    } else {
        startInput.classList.remove('input-invalid');
    }
    if (!endCoord) {
        statusEl.innerText = '❌ 终点无效，请输入正确的校园地点或从下拉列表中选择';
        speak('终点无法识别，请重新输入');
        endInput.classList.add('input-invalid');
        return;
    } else {
        endInput.classList.remove('input-invalid');
    }

    clearRoute();
    const startWgsLng = startCoord.lng;
    const startWgsLat = startCoord.lat;
    const endWgsLng = endCoord.lng;
    const endWgsLat = endCoord.lat;

    // 创建醒目的起点标记（红色大旗 + "起点"标签）
    const startIconHtml = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
            <div style="font-size: 32px; line-height: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🚩</div>
            <div style="background: #ff3b30; color: white; padding: 2px 8px; border-radius: 20px; font-size: 12px; font-weight: bold; margin-top: -8px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">起点</div>
        </div>
    `;
    startMarker = L.marker([startWgsLat, startWgsLng], {
        icon: L.divIcon({
            className: 'custom-route-marker',
            html: startIconHtml,
            iconSize: [60, 50],
            popupAnchor: [0, -25]
        }),
        draggable: true
    }).addTo(map).bindPopup(`起点: ${startName}`);

    // 创建醒目的终点标记（红色大旗 + "终点"标签）
    const endIconHtml = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
            <div style="font-size: 32px; line-height: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🏁</div>
            <div style="background: #ff3b30; color: white; padding: 2px 8px; border-radius: 20px; font-size: 12px; font-weight: bold; margin-top: -8px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">终点</div>
        </div>
    `;
    endMarker = L.marker([endWgsLat, endWgsLng], {
        icon: L.divIcon({
            className: 'custom-route-marker',
            html: endIconHtml,
            iconSize: [60, 50],
            popupAnchor: [0, -25]
        }),
        draggable: true
    }).addTo(map).bindPopup(`终点: ${endName}`);

    let currentStartName = startName;
    let currentEndName = endName;

    function getNearestPoiName(lat, lng, maxDistance = 0.002) {
        let nearest = null;
        let minDist = Infinity;
        poiList.forEach(poi => {
            const dist = Math.hypot(poi.lat - lat, poi.lng - lng);
            if (dist < minDist && dist < maxDistance) {
                minDist = dist;
                nearest = poi;
            }
        });
        return nearest ? nearest.name : null;
    }

    startMarker.on('dragend', async (e) => {
        const newLatLng = e.target.getLatLng();
        const newStartCoord = { lng: newLatLng.lng, lat: newLatLng.lat };
        const poiName = getNearestPoiName(newLatLng.lat, newLatLng.lng);
        if (poiName) {
            currentStartName = poiName;
        } else {
            try {
                const addr = await reverseGeocode(newLatLng.lat, newLatLng.lng);
                currentStartName = addr || `坐标 ${newLatLng.lat.toFixed(4)}, ${newLatLng.lng.toFixed(4)}`;
            } catch (e) {
                currentStartName = `坐标 ${newLatLng.lat.toFixed(4)}, ${newLatLng.lng.toFixed(4)}`;
            }
        }
        startMarker.setPopupContent(`起点: ${currentStartName}`);
        const endPos = endMarker.getLatLng();
        const newEndCoord = { lng: endPos.lng, lat: endPos.lat };
        if (routeDragDebounceTimer) clearTimeout(routeDragDebounceTimer);
        routeDragDebounceTimer = setTimeout(() => {
            replanRouteAfterDrag(newStartCoord, newEndCoord, currentStartName, currentEndName);
        }, 300);
    });

    endMarker.on('dragend', async (e) => {
        const newLatLng = e.target.getLatLng();
        const newEndCoord = { lng: newLatLng.lng, lat: newLatLng.lat };
        const poiName = getNearestPoiName(newLatLng.lat, newLatLng.lng);
        if (poiName) {
            currentEndName = poiName;
        } else {
            try {
                const addr = await reverseGeocode(newLatLng.lat, newLatLng.lng);
                currentEndName = addr || `坐标 ${newLatLng.lat.toFixed(4)}, ${newLatLng.lng.toFixed(4)}`;
            } catch (e) {
                currentEndName = `坐标 ${newLatLng.lat.toFixed(4)}, ${newLatLng.lng.toFixed(4)}`;
            }
        }
        endMarker.setPopupContent(`终点: ${currentEndName}`);
        const startPos = startMarker.getLatLng();
        const newStartCoord = { lng: startPos.lng, lat: startPos.lat };
        if (routeDragDebounceTimer) clearTimeout(routeDragDebounceTimer);
        routeDragDebounceTimer = setTimeout(() => {
            replanRouteAfterDrag(newStartCoord, newEndCoord, currentStartName, currentEndName);
        }, 300);
    });

    let route = null;
    try {
        route = await getAMapRouteByCoords(startCoord, endCoord);
    } catch (e) {
        console.error('获取路线异常:', e);
    }
    if (!route) {
        const latlngs = [[startWgsLat, startWgsLng], [endWgsLat, endWgsLng]];
        currentRouteLayer = L.polyline(latlngs, { color: 'red', weight: 4, dashArray: '5, 10' }).addTo(map);
        map.fitBounds(currentRouteLayer.getBounds());
        const distance = getDistance({ lat: startWgsLat, lng: startWgsLng }, { lat: endWgsLat, lng: endWgsLng }).toFixed(2);
        const msg = `直线距离约 ${distance} 公里（无法获取步行路线）`;
        statusEl.innerText = msg;
        speak(msg);
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
    const baseMsg = `从${currentStartName}到${currentEndName}，路线规划成功（${modeText}），全程约 ${distance} 公里，预计步行 ${duration} 分钟。`;
    statusEl.innerText = baseMsg;
    addHistoryItem({ name: startName, lat: startCoord.lat, lng: startCoord.lng });
    addHistoryItem({ name: endName, lat: endCoord.lat, lng: endCoord.lng });
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

function useMyLocationAsStart() {
    const statusEl = document.getElementById('statusText');
    const startInput = document.getElementById('startAddress');
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            alert('浏览器不支持定位');
            reject(new Error('浏览器不支持定位'));
            return;
        }
        statusEl.innerText = '📍 正在获取您的位置...';
        speak('正在获取您的位置');
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const [lng, lat] = wgs84ToGcj02(pos.coords.longitude, pos.coords.latitude);
                let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                try {
                    const addr = await reverseGeocode(lat, lng);
                    if (addr && !addr.includes('NaN')) address = addr;
                } catch (e) {
                    console.warn('逆地理编码失败:', e);
                }
                startInput.value = address;
                startInput.dataset.location = `${lng},${lat}`;
                startInput.dataset.name = '我的位置';
                const successMsg = `✅ 起点已设置为：${address}`;
                statusEl.innerText = successMsg;
                speak('起点已设置为当前位置');
                resolve();
            },
            (err) => {
                statusEl.innerText = '❌ 定位失败，请检查权限或网络';
                alert('定位失败：' + err.message);
                reject(err);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    });
}

// ========== 自动完成 & 历史记录 ==========
function searchLocalPoi(keyword) {
    if (!keyword || keyword.trim().length === 0) return [];
    if (!fuseInstance) return [];
    const results = fuseInstance.search(keyword.trim());
    return results.map(r => r.item).slice(0, 10);
}

const HISTORY_KEY = 'routeHistory';
const MAX_HISTORY = 5;
function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}
function saveHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}
function addHistoryItem(item) {
    if (!item.name) return;
    let history = loadHistory();
    history = history.filter(h => !(h.name === item.name && Math.abs(h.lat - item.lat) < 0.0001 && Math.abs(h.lng - item.lng) < 0.0001));
    history.unshift({ name: item.name, lat: item.lat, lng: item.lng });
    saveHistory(history);
}
function showHistoryForInput(type) {
    const container = document.getElementById(`${type}Suggestions`);
    const history = loadHistory();
    if (!history.length) {
        container.innerHTML = '<div class="autocomplete-no-result">暂无历史记录</div>';
        container.style.display = 'block';
        return;
    }
    let html = '';
    history.forEach((item, idx) => {
        html += `<div class="autocomplete-item history-item" data-index="${idx}" data-location="${item.lng},${item.lat}" data-name="${item.name.replace(/"/g, '&quot;')}">
            <div class="main-text">🕒 ${item.name}</div>
            <div class="sub-text">最近使用</div>
        </div>`;
    });
    container.innerHTML = html;
    container.style.display = 'block';
    container.querySelectorAll('.history-item').forEach(el => {
        el.addEventListener('click', () => {
            const input = document.getElementById(`${type}Address`);
            input.value = el.dataset.name;
            input.dataset.location = el.dataset.location;
            input.dataset.name = el.dataset.name;
            input.classList.remove('input-invalid');
            container.innerHTML = '';
            container.style.display = 'none';
        });
    });
}
function renderSuggestions(type, suggestions) {
    const container = document.getElementById(`${type}Suggestions`);
    const input = document.getElementById(`${type}Address`);
    if (!container) return;
    if (!suggestions || suggestions.length === 0) {
        container.innerHTML = '<div class="autocomplete-no-result">未找到匹配的校园地点</div>';
        container.style.display = 'block';
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
                input.classList.remove('input-invalid');
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
    const container = document.getElementById(`${type}Suggestions`);
    if (keyword.length === 0) {
        container.style.display = 'none';
        return;
    }
    const suggestions = searchLocalPoi(keyword);
    renderSuggestions(type, suggestions);
}
function validateInputField(input) {
    const value = input.value.trim();
    if (value === '') {
        input.classList.remove('input-invalid');
        return;
    }
    if (input.dataset.location) {
        input.classList.remove('input-invalid');
        return;
    }
    const matched = poiList.some(p => p.name === value || p.name.includes(value) || value.includes(p.name));
    if (!matched) {
        input.classList.add('input-invalid');
    } else {
        input.classList.remove('input-invalid');
    }
}
function initAutocomplete() {
    const startInput = document.getElementById('startAddress');
    const endInput = document.getElementById('endAddress');
    startInput.addEventListener('focus', () => {
        if (!startInput.value.trim()) showHistoryForInput('start');
    });
    endInput.addEventListener('focus', () => {
        if (!endInput.value.trim()) showHistoryForInput('end');
    });
    const debouncedStart = debounce((e) => {
        const val = e.target.value.trim();
        if (val) {
            const suggestions = searchLocalPoi(val);
            renderSuggestions('start', suggestions);
        } else {
            showHistoryForInput('start');
        }
    }, 200);
    const debouncedEnd = debounce((e) => {
        const val = e.target.value.trim();
        if (val) {
            const suggestions = searchLocalPoi(val);
            renderSuggestions('end', suggestions);
        } else {
            showHistoryForInput('end');
        }
    }, 200);
    startInput.addEventListener('input', debouncedStart);
    endInput.addEventListener('input', debouncedEnd);
    startInput.addEventListener('blur', () => validateInputField(startInput));
    endInput.addEventListener('blur', () => validateInputField(endInput));
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-wrapper')) {
            document.querySelectorAll('.autocomplete-items').forEach(el => el.style.display = 'none');
        }
    });
}

// ========== 语音助手意图处理 ==========
function clearContext() {
    context = { lastDestination: null, lastFacilityType: null, lastSearchResults: [], lastRouteInfo: null, waitingConfirmation: false };
    speak("好的，已经清空，您可以重新说出需求。");
}
function parseIntent(command) {
    const lower = command.toLowerCase();
    if (lower.includes('重新说') || lower.includes('取消') || lower.includes('重来') || lower.includes('清空')) return { intent: 'clear' };
    const setStartPatterns = [/起点设为(.+)/, /设置起点(.+)/, /从(.+)出发/, /起点是(.+)/];
    for (let p of setStartPatterns) { const match = command.match(p); if (match) return { intent: 'setStart', target: match[1].trim() }; }
    const setEndPatterns = [/终点设为(.+)/, /设置终点(.+)/, /到(.+)去/, /目的地(.+)/];
    for (let p of setEndPatterns) { const match = command.match(p); if (match) return { intent: 'setEnd', target: match[1].trim() }; }
    if (lower.includes('救命') || lower.includes('sos') || lower.includes('帮助我') || lower.includes('求助')) return { intent: 'sos' };
    const navPatterns = [/带我去(.+)/, /导航到(.+)/, /去(.+)/, /我想去(.+)/, /我要去(.+)/];
    for (let pattern of navPatterns) {
        const match = command.match(pattern);
        if (match) {
            let destination = match[1].trim().replace(/吧$|呗$|好吗$|谢谢$/g, '');
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
    let matchedPoi = poiList.find(poi => poi.name === destination || poi.name.includes(destination) || destination.includes(poi.name));
    let endCoord, endName;
    if (matchedPoi) {
        endCoord = { lng: matchedPoi.lng, lat: matchedPoi.lat };
        endName = matchedPoi.name;
        speak(`好的，正在为您规划到${endName}的路线`);
    } else {
        speak(`抱歉，没有找到${destination}，请尝试说出更具体的建筑名称。`);
        return;
    }
    context.lastDestination = { name: endName, lat: endCoord.lat, lng: endCoord.lng };
    let startCoord = null, startName = '当前位置';
    if (navigator.geolocation) {
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 });
            });
            const [lng, lat] = wgs84ToGcj02(position.coords.longitude, position.coords.latitude);
            startCoord = { lat, lng };
            reverseGeocode(startCoord.lat, startCoord.lng).then(addr => { startName = addr; }).catch(() => {});
            speak(`已定位到您的位置，开始规划路线`);
        } catch (err) {
            console.warn('GPS定位失败:', err);
            const defaultPoi = poiList.find(p => p.name === '西门');
            if (defaultPoi) { startCoord = { lat: defaultPoi.lat, lng: defaultPoi.lng }; startName = defaultPoi.name; speak('无法获取您的位置，已将起点设为西门'); }
            else { const center = map.getCenter(); startCoord = { lat: center.lat, lng: center.lng }; startName = '地图中心'; speak('无法获取位置，使用当前地图中心为起点'); }
        }
    } else {
        const defaultPoi = poiList.find(p => p.name === '西门');
        if (defaultPoi) { startCoord = { lat: defaultPoi.lat, lng: defaultPoi.lng }; startName = defaultPoi.name; }
        else { const center = map.getCenter(); startCoord = { lat: center.lat, lng: center.lng }; startName = '地图中心'; }
    }
    const route = await getAMapRouteByCoords(startCoord, endCoord);
    if (!route) { speak("路线规划失败，请检查网络或稍后再试"); return; }
    context.lastRouteInfo = { distance: route.distance, duration: route.duration };
    clearRoute();
    const startWgsLng = startCoord.lng, startWgsLat = startCoord.lat;
    const endWgsLng = endCoord.lng, endWgsLat = endCoord.lat;
    startMarker = L.marker([startWgsLat, startWgsLng], { icon: L.divIcon({ className: 'route-marker', html: '🚩', iconSize: [28, 28] }) }).addTo(map).bindPopup(`起点: ${startName}`);
    endMarker = L.marker([endWgsLat, endWgsLng], { icon: L.divIcon({ className: 'route-marker', html: '🏁', iconSize: [28, 28] }) }).addTo(map).bindPopup(`终点: ${endName}`);
    currentRouteLayer = L.geoJSON(route.geometry, { style: { color: '#007aff', weight: 6, opacity: 0.8 } }).addTo(map);
    map.fitBounds(currentRouteLayer.getBounds());
    const distanceKm = (route.distance / 1000).toFixed(1);
    const durationMin = Math.round(route.duration / 60);
    const msg = `从${startName}到${endName}的路线规划成功，距离约${distanceKm}公里，步行大约需要${durationMin}分钟。`;
    document.getElementById('statusText').innerText = msg;
    speak(msg);
    vibrate(3);
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
}
function queryFacility(type) {
    let available = [];
    if (type === '电梯') available = poiList.filter(poi => facilityStatus[poi.name]?.elevator === '正常');
    else if (type === '坡道') available = poiList.filter(poi => facilityStatus[poi.name]?.ramp === '正常');
    else if (type === '无障碍卫生间') available = poiList.filter(poi => poi.score >= 4);
    else if (type === '盲道') available = poiList.filter(poi => poi.score >= 3.5);
    if (available.length === 0) { speak(`抱歉，当前地图数据中没有找到${type}正常的场所，您可以尝试上报或移动位置。`); context.lastSearchResults = []; return; }
    const names = available.map(p => p.name).join('、');
    speak(`找到${available.length}个${type}正常的场所，包括${names}。需要我为您导航到最近的一个吗？`);
    context.lastFacilityType = type;
    context.lastSearchResults = available;
    context.waitingConfirmation = true;
}
function nearbyFacilities() {
    const center = map.getCenter();
    const radius = 0.05;
    const nearby = poiList.filter(poi => Math.hypot(poi.lat - center.lat, poi.lng - center.lng) < radius);
    if (nearby.length === 0) { speak("您附近没有找到无障碍设施，您可以移动地图到更繁华的区域。"); context.lastSearchResults = []; return; }
    const names = nearby.map(p => p.name).join('、');
    speak(`您附近有${nearby.length}个地点，包括${names}。需要查询其中某个地点的无障碍设施吗？`);
    context.lastSearchResults = nearby;
    context.waitingConfirmation = true;
}
function handleThen() {
    if (context.lastDestination) speak(`您刚才查询的是${typeof context.lastDestination === 'string' ? context.lastDestination : context.lastDestination.name}，需要我为您重新规划路线吗？`);
    else if (context.lastFacilityType) speak(`您刚才查询的是${context.lastFacilityType}，需要我为您导航到最近的一个吗？`);
    else if (context.lastSearchResults.length > 0) speak(`您刚才搜索到${context.lastSearchResults.length}个结果，需要我详细介绍吗？`);
    else speak("您还没有进行过任何查询，请先说出您的需求，比如导航到图书馆。");
}
function handleHowToGo() {
    if (context.lastDestination) executeNavigate(typeof context.lastDestination === 'string' ? context.lastDestination : context.lastDestination.name);
    else if (context.lastSearchResults.length > 0) { const first = context.lastSearchResults[0]; speak(`好的，为您规划到${first.name}的路线。`); executeNavigate(first.name); }
    else speak("请先告诉我您想去哪里，比如说导航到食堂。");
}
function handleDistance() {
    if (context.lastRouteInfo && context.lastRouteInfo.distance) {
        const km = (context.lastRouteInfo.distance / 1000).toFixed(1);
        const min = Math.round(context.lastRouteInfo.duration / 60);
        speak(`全程约${km}公里，步行大约需要${min}分钟。`);
    } else speak("您还没有规划路线，请先说导航到哪里。");
}
function handleConfirm() {
    if (context.lastSearchResults.length > 0 && context.lastFacilityType) { const first = context.lastSearchResults[0]; speak(`好的，正在为您规划到${first.name}的路线。`); executeNavigate(first.name); }
    else if (context.lastDestination) executeNavigate(typeof context.lastDestination === 'string' ? context.lastDestination : context.lastDestination.name);
    else speak("好的，请说出您的具体需求。");
    context.waitingConfirmation = false;
}
function handleDeny() { speak("好的，已取消。您可以重新说出其他需求。"); context.waitingConfirmation = false; }
async function processVoiceCommand(command) {
    if (!command || command.trim() === '') { speak("不好意思，我没有听清，可以请你再说一遍吗？"); return; }
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
        case 'setStart': fillInputFromVoice('start', intentObj.target); speak(`起点已设为${intentObj.target}`); break;
        case 'setEnd': fillInputFromVoice('end', intentObj.target); speak(`终点已设为${intentObj.target}`); break;
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
            if (noSpeechCount >= 2) { speak("未检测到声音，语音模式已自动退出。", 'urgent'); stopListening(); noSpeechCount = 0; }
        } else if (event.error === 'audio-capture') { speak("没有检测到麦克风，请检查权限。", 'urgent'); stopListening(); }
        else if (event.error === 'not-allowed') { speak("请允许麦克风权限才能使用语音功能。", 'urgent'); stopListening(); }
        else if (event.error === 'network') { speak("网络不稳定，请稍后再试。"); }
    };
    recog.onend = () => { if (isListening) setTimeout(() => { if (isListening && recognition) { try { recognition.start(); } catch (e) { stopListening(); } } }, 1000); };
    return recog;
}
function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => { if (isListening) { speak("尊敬的用户，由于长时间未检测到声音，语音小助手暂时下线。"); stopListening(); } }, inactivityTimeout);
}
function startListening() {
    if (!SpeechRecognition) { alert("浏览器不支持语音识别"); return false; }
    if (!recognition) { recognition = initSpeechRecognition(); if (!recognition) return false; }
    try {
        recognition.start();
        isListening = true;
        noSpeechCount = 0;
        updateVoiceButtonState();
        document.getElementById('statusText').innerText = '🎙️ 正在聆听... 说出您的需求';
        resetInactivityTimer();
        const hintShown = localStorage.getItem('voiceHintShown');
        if (!hintShown) { setTimeout(() => { document.getElementById('voiceHintPanel').style.display = 'block'; localStorage.setItem('voiceHintShown', 'true'); }, 500); }
        return true;
    } catch (e) { console.error("启动语音识别失败:", e); return false; }
}
function stopListening() {
    if (recognition && isListening) { try { recognition.stop(); } catch (e) {} isListening = false; if (inactivityTimer) clearTimeout(inactivityTimer); updateVoiceButtonState(); document.getElementById('statusText').innerHTML = '👋 欢迎使用无障碍出行伴侣'; }
}
function togglePauseResume() { if (speechManager.isPaused) speechManager.resume(); else if (speechManager.isSpeaking) speechManager.pause(); }
function stopSpeaking() { speechManager.stop(); }
function toggleVoiceRecognition() {
    if (speechManager.isSpeaking) { speechManager.pause(); speak("语音播报已暂停，您可以说话"); }
    if (isListening) stopListening(); else startListening();
}

// ========== 其他功能 ==========
async function sos() {
    if (!navigator.geolocation) { alert('浏览器不支持定位，无法发送SOS'); return; }
    document.getElementById('statusText').innerText = '🚨 正在获取位置并发送求助...';
    navigator.geolocation.getCurrentPosition(async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        let address = '';
        try { address = await reverseGeocode(lat, lng); } catch (e) {}
        const message = prompt('请输入求助详情（可选）', '需要帮助，请尽快联系！');
        const data = { lat, lng, address, message: message || 'SOS 紧急求助' };
        try {
            const res = await fetch(`${API_BASE}/sos`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify(data) });
            if (res.ok) {
                const msg = 'SOS求助已发送！管理员将尽快处理。';
                speak(msg, 'urgent');
                document.getElementById('statusText').innerHTML = `<span style="color:red;">🚨 ${msg}</span>`;
                vibrate(4);
                alert(msg);
            } else throw new Error('服务器响应失败');
        } catch (err) { console.error('SOS发送失败:', err); alert('网络错误，SOS求助发送失败，请稍后重试'); }
    }, (err) => { alert('获取位置失败，无法发送SOS'); document.getElementById('statusText').innerText = '❌ 定位失败，SOS未发送'; }, { enableHighAccuracy: true, timeout: 10000 });
}
async function showReportModal() {
    if (!isLoggedIn()) { if (confirm('上报障碍物需要登录，是否前往登录？')) window.location.href = 'login.html'; return; }
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
    } catch (e) { document.getElementById('reportLocationName').innerText = '无法获取地点名称'; }
    document.getElementById('locationHint').innerText = `📍 位置：${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
function showStats() {
    document.getElementById('chartModal').style.display = 'flex';
    const accessibleCount = poiList.filter(p => p.score >= 3.5).length;
    const notAccessible = poiList.length - accessibleCount;
    const coverageChart = echarts.init(document.getElementById('coverageChart'));
    coverageChart.setOption({ title: { text: '无障碍设施覆盖率' }, series: [{ type: 'pie', radius: '60%', data: [{ name: '无障碍友好', value: accessibleCount }, { name: '待改善', value: notAccessible }] }] });
    const days = [], counts = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(5, 10);
        days.push(dateStr);
        counts.push(obstacles.filter(o => o.report_time && o.report_time.startsWith(d.toISOString().slice(0, 10))).length);
    }
    const trendChart = echarts.init(document.getElementById('trendChart'));
    trendChart.setOption({ title: { text: '近一周上报趋势' }, xAxis: { type: 'category', data: days }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: counts }] });
}
function locateUser() {
    const statusEl = document.getElementById('statusText');
    if (!navigator.geolocation) { alert("浏览器不支持地理定位"); return; }
    statusEl.innerText = '📍 正在重新定位...';
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const [lng, lat] = wgs84ToGcj02(position.coords.longitude, position.coords.latitude);
            map.setView([lat, lng], 16);
            L.marker([lat, lng], { icon: L.divIcon({ className: 'current-location', html: '📍', iconSize: [24, 24] }) }).addTo(map).bindPopup('您当前的位置').openPopup();
            let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            try { const addr = await reverseGeocode(lat, lng); if (addr) address = addr; } catch (e) {}
            const successMsg = `📍 当前位置：${address}`;
            statusEl.innerText = successMsg;
            speak(successMsg);
        },
        (error) => { statusEl.innerText = '❌ 定位失败，请检查权限或网络'; alert("定位失败：" + error.message); },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
}
function saveContrastPref(enabled) { localStorage.setItem('highContrast', enabled); }
function loadContrastPref() { return localStorage.getItem('highContrast') === 'true'; }

// ========== 页面初始化 ==========
window.onload = async () => {
    initMap();
    await loadPoiFromServer();
    await loadObstaclesFromServer();
    await loadRoadSegments();
    addPoiMarkers();
    updateObstacleMarkers();
    renderFacilityPanel();
    initAutocomplete();
    updateUserStatus();
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
    contrastBtn.onclick = () => { document.body.classList.toggle('high-contrast'); saveContrastPref(document.body.classList.contains('high-contrast')); };
    document.getElementById('clearDataBtn').onclick = () => { if (confirm('清除所有本地数据？不可恢复。')) { localStorage.clear(); location.reload(); } };
    window.onclick = (e) => { if (e.target.classList.contains('modal')) e.target.style.display = 'none'; };
    const photoInput = document.getElementById('obstaclePhoto');
    if (photoInput) {
        photoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => { document.getElementById('photoPreview').src = ev.target.result; document.getElementById('photoPreview').style.display = 'block'; };
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
        const newObstacle = { id: Date.now(), lat, lng, type, description: desc, status: "未处理", report_time: new Date().toISOString().slice(0, 10), photo: photoData || null };
        const success = await addObstacleToServer(newObstacle);
        if (success) {
            obstacles.push(newObstacle);
            updateObstacleMarkers();
            document.getElementById('reportModal').style.display = 'none';
            speak("感谢上报，管理员会尽快处理");
            vibrate(1);
            document.getElementById('reportForm').reset();
            document.getElementById('photoPreview').style.display = 'none';
        } else { alert('上报失败，请稍后重试'); }
    });
    setInterval(() => { renderFacilityPanel(); document.getElementById('refreshIndicator').style.opacity = '0.6'; setTimeout(() => document.getElementById('refreshIndicator').style.opacity = '1', 300); }, 30000);
};

window.navigateTo = async function (lat, lng, name) {
    const endInput = document.getElementById('endAddress');
    endInput.value = name;
    endInput.dataset.location = `${lng},${lat}`;
    endInput.dataset.name = name;
    endInput.classList.remove('input-invalid');
    const startInput = document.getElementById('startAddress');
    if (!startInput.value || !startInput.dataset.location) {
        try { await useMyLocationAsStart(); } catch (e) { console.warn('起点定位失败，将使用默认起点'); }
    }
    planRealRoute();
};

function fillInputFromVoice(type, text) {
    const input = document.getElementById(`${type}Address`);
    const matched = poiList.find(p => p.name.includes(text) || text.includes(p.name));
    if (matched) {
        input.value = matched.name;
        input.dataset.location = `${matched.lng},${matched.lat}`;
        input.dataset.name = matched.name;
    } else { input.value = text; }
    input.classList.remove('input-invalid');
}

// 以下为自定义轮椅路径算法预留（当前未使用）
let roadGraph = null;
function buildRoadGraph(wheelchairMode = true) {
    const g = new graphlib.Graph({ directed: false });
    const nodes = new Map();
    roadSegments.forEach(seg => {
        const key1 = `${seg.start_lat.toFixed(6)},${seg.start_lng.toFixed(6)}`;
        const key2 = `${seg.end_lat.toFixed(6)},${seg.end_lng.toFixed(6)}`;
        if (!nodes.has(key1)) nodes.set(key1, { lat: seg.start_lat, lng: seg.start_lng });
        if (!nodes.has(key2)) nodes.set(key2, { lat: seg.end_lat, lng: seg.end_lng });
    });
    nodes.forEach((coord, key) => g.setNode(key, coord));
    roadSegments.forEach(seg => {
        const key1 = `${seg.start_lat.toFixed(6)},${seg.start_lng.toFixed(6)}`;
        const key2 = `${seg.end_lat.toFixed(6)},${seg.end_lng.toFixed(6)}`;
        let weight = getDistance({ lat: seg.start_lat, lng: seg.start_lng }, { lat: seg.end_lat, lng: seg.end_lng }) * 1000;
        if (wheelchairMode) {
            const passable = seg.wheelchair_passable;
            if (passable === '否' || passable === '否（有台阶）' || seg.segment_type === '台阶') weight = Infinity;
            else if (passable === '坡道陡，仅电动轮椅可通行') weight *= 5;
            else if (seg.segment_type === '坡道台阶混合') weight *= 3;
        }
        g.setEdge(key1, key2, weight);
    });
    return g;
}
function findAccessiblePath(graph, startKey, endKey) {
    const distances = {}, previous = {};
    const pq = new PriorityQueue((a, b) => a.distance - b.distance);
    graph.nodes().forEach(node => { distances[node] = Infinity; previous[node] = null; });
    distances[startKey] = 0;
    pq.enq({ node: startKey, distance: 0 });
    while (!pq.isEmpty()) {
        const { node: currentNode } = pq.deq();
        if (currentNode === endKey) break;
        const neighbors = graph.outEdges(currentNode) || [];
        neighbors.forEach(edge => {
            const neighbor = edge.w;
            const weight = graph.edge(edge);
            const newDist = distances[currentNode] + weight;
            if (newDist < distances[neighbor]) { distances[neighbor] = newDist; previous[neighbor] = currentNode; pq.enq({ node: neighbor, distance: newDist }); }
        });
    }
    const path = [];
    let node = endKey;
    while (node) { path.unshift(graph.node(node)); node = previous[node]; }
    return path;
}