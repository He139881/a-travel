// 高德地图 API 配置
const AMAP_KEY = '2c5385f0963e09c03c60546742d12f0c';

// API 基础地址（开发时用 localhost，部署时替换为域名）
const API_BASE = 'http://localhost:3000/api';

// ========== 坐标系转换（GCJ-02 转 WGS-84）==========
// 高德/百度/腾讯地图使用的是 GCJ-02 坐标系
// Leaflet/OpenStreetMap 使用的是 WGS-84 坐标系

const a = 6378245.0;
const ee = 0.00669342162296594323;

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

// GCJ-02 转 WGS-84
function gcj02ToWgs84(lng, lat) {
    if (outOfChina(lat, lng)) {
        return [lng, lat];
    }
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

// 批量转换 POI 坐标（GCJ-02 → WGS-84）
function convertPoiToWgs84(poi) {
    const [wgsLng, wgsLat] = gcj02ToWgs84(poi.lng, poi.lat);
    return { ...poi, lng: wgsLng, lat: wgsLat };
}

// WGS-84 转 GCJ-02（用于调用高德 API）
function wgs84ToGcj02(lng, lat) {
    if (outOfChina(lat, lng)) {
        return [lng, lat];
    }
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

// 全局变量
let map;
let poiMarkers = [];
let obstacleMarkers = [];
let currentRouteLayer = null;
let highlightedObstacleMarkers = [];
let startMarker = null;   // 起点标记
let endMarker = null;     // 终点标记
let detailMarkers = [];      // 详细POI标记（带文字）
let campusMarker = null;     // 校园总标记
const ZOOM_THRESHOLD = 15;   // 缩放阈值：>=15显示详细标记，<15显示校园总标记
let obstacleDetailMarkers = []; // 障碍物标记数组（用于缩放控制）
let isSpeaking = false;      // 是否正在语音播报

// 语音持续监听相关
let isListening = false;
let recognition = null;
let inactivityTimer = null;
const inactivityTimeout = 30000; // 30秒

// 对话上下文（支持多轮）
let context = {
  lastDestination: null,      // 上一次查询的地点名称或坐标
  lastFacilityType: null,     // 上一次查询的无障碍设施类型（电梯/坡道/卫生间/盲道）
  lastSearchResults: [],      // 上一次搜索到的地点列表
  lastRouteInfo: null,        // 上一次规划的路线信息（距离、时间）
  waitingConfirmation: false   // 是否等待用户确认（例如“是否开始导航”）
};



// 从后端加载障碍物数据
async function loadObstaclesFromServer() {
    try {
        const res = await fetch(`${API_BASE}/obstacles`);
        const data = await res.json();
        obstacles = data;
        updateObstacleMarkers();
        // 如果管理员面板也打开，会自动通过轮询更新
    } catch (err) {
        console.error('加载障碍物失败:', err);
    }
}

// 上报障碍物到后端
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

// 加载 POI 和设施状态（如果后端有对应接口，否则仍用 mockData）
async function loadPoiFromServer() {
    try {
        const [poiRes, statusRes] = await Promise.all([
            fetch(`${API_BASE}/poi`),
            fetch(`${API_BASE}/poi/facility-status`)
        ]);
        if (poiRes.ok) {
            const pois = await poiRes.json();
            // 将 poiList 替换为后端数据
            poiList.length = 0;
            poiList.push(...pois);
        }
        if (statusRes.ok) {
            const status = await statusRes.json();
            // 合并到 facilityStatus
            Object.assign(facilityStatus, status);
        }
    } catch (err) {
        console.warn('加载 POI 失败，使用本地 mock 数据', err);
    }
}



function initMap() {
    map = L.map('map').setView([31.2304, 121.4737], 14); // 默认中心（作为后备）
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    
    // 添加缩放监听 - 同时控制POI和障碍物
    map.on('zoomend', function() {
        updateMarkersByZoom();      // 控制绿色POI标记和校园总标记
        updateObstaclesByZoom();    // 控制黄色障碍物标记
    });
    
    locateAndSetView();
}

// 新增函数：自动定位并设置地图视图（静默执行，不弹出提示）
function locateAndSetView() {
    document.getElementById('status').innerText = '📍 正在定位...';
    if (!navigator.geolocation) {
        console.warn("浏览器不支持地理定位，使用默认地图中心");
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            map.setView([lat, lng], 16);
            // 可选：添加一个定位标记
            L.marker([lat, lng], {
                icon: L.divIcon({ className: 'current-location', html: '📍', iconSize: [24, 24] })
            }).addTo(map).bindPopup('您当前的位置').openPopup();
            // 语音提示（可选）
            // speak("已自动定位到您的位置");
        },
        (error) => {
            console.warn("自动定位失败，使用默认地图中心:", error.message);
            // 定位失败时不打扰用户，保持默认视图
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
}

// 语音播报
function speak(text) {
    if (!window.speechSynthesis) return;
    // 移除所有可能的表情符号或特殊字符，只保留中文、英文、数字、常用标点
    const cleanText = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9，。？、：；""''！]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9;  // 语速稍慢，适合老年人/视障人士
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
}

// 震动反馈
function vibrate(pattern) {
    if (!navigator.vibrate) return;
    const patterns = { 1: [200, 100], 2: [200, 100, 200], 3: [500], 4: [500, 200, 500] };
    navigator.vibrate(patterns[pattern] || 200);
}

function addPoiMarkers() {
    // 清除旧标记
    detailMarkers.forEach(m => map.removeLayer(m));
    detailMarkers = [];
    
    // ⭐ 转换所有 POI 坐标为 WGS-84（如果还没转换过）
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
    
    // 校园总标记也需要转换
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

// 根据缩放级别切换标记显示
function updateMarkersByZoom() {
    const currentZoom = map.getZoom();
    
    if (currentZoom >= ZOOM_THRESHOLD) {
        // 放大状态：显示详细POI标记，隐藏校园总标记
        if (campusMarker) map.removeLayer(campusMarker);
        detailMarkers.forEach(marker => marker.addTo(map));
    } else {
        // 缩小状态：显示校园总标记，隐藏详细POI标记
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

// 添加障碍物标记
function updateObstacleMarkers() {
    // 清除旧标记
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
            上报: ${obs.reportTime}
            ${obs.photo ? '<br><img src="' + obs.photo + '" style="max-width:100%; margin-top:5px;">' : ''}
        `);
        obstacleDetailMarkers.push(marker);
        obstacleMarkers.push(marker);
    });
    
    // 根据当前缩放级别决定是否显示
    updateObstaclesByZoom();
}

// 根据缩放级别控制障碍物标记显示
function updateObstaclesByZoom() {
    const currentZoom = map.getZoom();
    
    if (currentZoom >= ZOOM_THRESHOLD) {
        // 放大：显示障碍物标记
        obstacleDetailMarkers.forEach(marker => marker.addTo(map));
    } else {
        // 缩小：隐藏障碍物标记
        obstacleDetailMarkers.forEach(marker => map.removeLayer(marker));
    }
}

// ========== 成员A新增：路径规划增强 ==========
function getAvoidTypes() {
    const checks = document.querySelectorAll('.avoid-type:checked');
    return Array.from(checks).map(cb => cb.value);
}
function getRampPrefer() {
    return document.getElementById('rampPrefer')?.checked || false;
}

function pointToSegmentDistance(point, segStart, segEnd) {
    const [x0, y0] = [point.lat, point.lng];
    const [x1, y1] = [segStart.lat, segStart.lng];
    const [x2, y2] = [segEnd.lat, segEnd.lng];
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(x0 - x1, y0 - y1);
    const t = ((x0 - x1) * dx + (y0 - y1) * dy) / (dx * dx + dy * dy);
    if (t < 0) return Math.hypot(x0 - x1, y0 - y1);
    if (t > 1) return Math.hypot(x0 - x2, y0 - y2);
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(x0 - projX, y0 - projY);
}

/* function isEdgeBlockedByAvoidTypes(edge, avoidTypes) {
    if (!avoidTypes.length) return false;
    const fromNode = graph.nodes[edge.from];
    const toNode = graph.nodes[edge.to];
    if (!fromNode || !toNode) return false;
    for (let obs of obstacles) {
        if (avoidTypes.includes(obs.type)) {
            const dist = pointToSegmentDistance({ lat: obs.lat, lng: obs.lng }, fromNode, toNode);
            if (dist < 0.003) return true;
        }
    }
    return false;
} */

/* function getEdgeWeightWithRampPrefer(edge) {
    let weight = edge.distance;
    const fromName = graph.nodes[edge.from]?.name;
    const toName = graph.nodes[edge.to]?.name;
    let rampGood = true;
    [fromName, toName].forEach(name => {
        if (name && facilityStatus[name] && (facilityStatus[name].ramp === '维修中' || facilityStatus[name].ramp === '无')) {
            rampGood = false;
        }
    });
    return rampGood ? weight * 0.8 : weight * 1.2;
} */

/* function findAccessiblePath(startNodeId, endNodeId, wheelchairMode = true, avoidTypes = [], rampPrefer = false) {
    const nodes = graph.nodes;
    const edges = graph.edges;
    const adj = {};
    Object.keys(nodes).forEach(id => adj[id] = []);
    edges.forEach(edge => {
        if (wheelchairMode && !edge.accessible) return;
        if (isEdgeBlockedByAvoidTypes(edge, avoidTypes)) return;
        let dist = edge.distance;
        if (rampPrefer) dist = getEdgeWeightWithRampPrefer(edge);
        adj[edge.from].push({ to: edge.to, dist });
        adj[edge.to].push({ to: edge.from, dist });
    });
    const dist = {}, prev = {};
    Object.keys(nodes).forEach(id => { dist[id] = Infinity; prev[id] = null; });
    dist[startNodeId] = 0;
    const pq = [{ id: startNodeId, dist: 0 }];
    while (pq.length) {
        pq.sort((a, b) => a.dist - b.dist);
        const current = pq.shift();
        if (current.id == endNodeId) break;
        if (!adj[current.id]) continue;
        adj[current.id].forEach(neighbor => {
            const alt = dist[current.id] + neighbor.dist;
            if (alt < dist[neighbor.to]) {
                dist[neighbor.to] = alt;
                prev[neighbor.to] = current.id;
                pq.push({ id: neighbor.to, dist: alt });
            }
        });
    }
    const path = [];
    let u = endNodeId;
    if (prev[u] !== null || u == startNodeId) {
        while (u) {
            path.unshift(u);
            u = prev[u];
        }
    }
    return { path: path.map(id => nodes[id]), distance: dist[endNodeId] };
} */

/* function findNodeIdByName(name) {
    for (let id in graph.nodes) {
        if (graph.nodes[id].name === name) return parseInt(id);
    }
    return null;
} */

// 导航函数（增强版）
/* window.navigateTo = function (lat, lng, name) {
     const wheelchairMode = document.getElementById('wheelchairMode').checked;
    const startName = "市民中心图书馆";
    const startId = findNodeIdByName(startName);
    const endId = findNodeIdByName(name);
    if (!startId || !endId) {
        speak("无法规划路线，请重试");
        return;
    }
    const avoidTypes = getAvoidTypes();
    const rampPrefer = getRampPrefer();
    const result = findAccessiblePath(startId, endId, wheelchairMode, avoidTypes, rampPrefer);
    if (result.path.length < 2) {
        let msg = wheelchairMode ? "未找到无障碍路线，请尝试关闭轮椅优先模式或减少避开类型" : "未找到路线";
        document.getElementById('status').innerText = msg;
        speak(msg);
        vibrate(4);
        return;
    }
    if (currentRouteLayer) map.removeLayer(currentRouteLayer);
    const latlngs = result.path.map(p => [p.lat, p.lng]);
    currentRouteLayer = L.polyline(latlngs, { color: wheelchairMode ? '#007aff' : '#ff9500', weight: 6 }).addTo(map);
    map.fitBounds(currentRouteLayer.getBounds());
    const steps = result.path.map((p, i) => i === 0 ? `从${p.name}出发` : `前往${p.name}`);
    const distance = result.distance.toFixed(1);
    let modeStr = wheelchairMode ? '轮椅优先模式' : '普通模式';
    if (avoidTypes.length) modeStr += `，已避开${avoidTypes.join('、')}`;
    if (rampPrefer) modeStr += `，优先坡道路段`;
    const msg = `路线规划成功，全程约${distance}公里，${modeStr}。` + steps.join('，');
    document.getElementById('status').innerText = msg;
    speak(msg);
    vibrate(3);
    // 沿途预警
    highlightObstaclesAlongRoute(latlngs);
    speakRouteWarnings(latlngs);
}; */

// 沿途障碍物高亮
function highlightObstaclesAlongRoute(routeLatLngs) {
    if (window.highlightedMarkers) {
        window.highlightedMarkers.forEach(m => {
            if (m && m.setIcon) m.setIcon(L.divIcon({ className: 'obstacle-marker', html: '⚠️', iconSize: [24, 24] }));
        });
    }
    window.highlightedMarkers = [];
    const threshold = 0.0025;
    obstacles.forEach(obs => {
        let minDist = Infinity;
        for (let i = 0; i < routeLatLngs.length - 1; i++) {
            const p1 = { lat: routeLatLngs[i][0], lng: routeLatLngs[i][1] };
            const p2 = { lat: routeLatLngs[i + 1][0], lng: routeLatLngs[i + 1][1] };
            const dist = pointToSegmentDistance(obs, p1, p2);
            if (dist < minDist) minDist = dist;
        }
        if (minDist < threshold) {
            const marker = obstacleMarkers.find(m => {
                const pos = m.getLatLng();
                return Math.abs(pos.lat - obs.lat) < 0.0001 && Math.abs(pos.lng - obs.lng) < 0.0001;
            });
            if (marker) {
                marker.setIcon(L.divIcon({ className: 'obstacle-marker obstacle-highlight', html: '🔴⚠️', iconSize: [28, 28] }));
                window.highlightedMarkers.push(marker);
            }
        }
    });
}

function speakRouteWarnings(routeLatLngs) {
    const threshold = 0.0025;
    const nearby = obstacles.filter(obs => {
        let minDist = Infinity;
        for (let i = 0; i < routeLatLngs.length - 1; i++) {
            const p1 = { lat: routeLatLngs[i][0], lng: routeLatLngs[i][1] };
            const p2 = { lat: routeLatLngs[i + 1][0], lng: routeLatLngs[i + 1][1] };
            const dist = pointToSegmentDistance(obs, p1, p2);
            if (dist < minDist) minDist = dist;
        }
        return minDist < threshold;
    });
    if (nearby.length) {
        const types = [...new Set(nearby.map(o => o.type))];
        speak(`注意，沿途有${nearby.length}处障碍物，类型包括${types.join('、')}，请小心通行`);
        vibrate(4);
    }
}

// 实时设施状态面板渲染（增加台阶和盲道）
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
                const marker = poiMarkers.find(m => {
                    const pos = m.getLatLng();
                    return Math.abs(pos.lat - poi.lat) < 0.0001 && Math.abs(pos.lng - poi.lng) < 0.0001;
                });
                if (marker) marker.openPopup();
                speak(`${name}，电梯${facilityStatus[name].elevator}，坡道${facilityStatus[name].ramp}，盲道${facilityStatus[name].tactilePaving === '有' ? '有' : '无'}，${facilityStatus[name].stairs === '无台阶' ? '无台阶' : '有台阶'}`);
            }
        });
    });
}

// ==================== 核心：自然语言理解与多轮对话 ====================
// 清除上下文
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

// 解析意图（支持口语化、同义词）
function parseIntent(command) {
    const lower = command.toLowerCase();
    // 1. 清除上下文指令
    if (lower.includes('重新说') || lower.includes('取消') || lower.includes('重来') || lower.includes('清空')) {
        return { intent: 'clear' };
    }
    // 2. 求助意图
    if (lower.includes('救命') || lower.includes('sos') || lower.includes('帮助我') || lower.includes('求助')) {
        return { intent: 'sos' };
    }
    // 3. 导航意图（带我去、导航到、去、我想去、我要去）
    const navPatterns = [/带我去(.+)/, /导航到(.+)/, /去(.+)/, /我想去(.+)/, /我要去(.+)/];
    for (let pattern of navPatterns) {
        const match = command.match(pattern);
        if (match) {
            let destination = match[1].trim();
            // 移除末尾的“吧”“呗”“好吗”等语气词
            destination = destination.replace(/吧$|呗$|好吗$|谢谢$/g, '');
            if (destination) {
                return { intent: 'navigate', target: destination };
            }
        }
    }
    // 4. 查询无障碍设施（电梯、坡道、无障碍卫生间、盲道）
    if (lower.includes('电梯')) {
        return { intent: 'facility', type: '电梯' };
    }
    if (lower.includes('坡道')) {
        return { intent: 'facility', type: '坡道' };
    }
    if (lower.includes('无障碍卫生间') || lower.includes('残疾人卫生间') || lower.includes('第三卫生间')) {
        return { intent: 'facility', type: '无障碍卫生间' };
    }
    if (lower.includes('盲道')) {
        return { intent: 'facility', type: '盲道' };
    }
    // 5. 附近无障碍设施（附近有什么、附近有哪些）
    if (lower.includes('附近') && (lower.includes('无障碍') || lower.includes('设施') || lower.includes('电梯') || lower.includes('坡道'))) {
        return { intent: 'nearby' };
    }
    // 6. 多轮对话追问（然后呢、怎么去、还有多远、接下来）
    if (lower.includes('然后呢') || lower.includes('然后') || lower.includes('接下来')) {
        return { intent: 'then' };
    }
    if (lower.includes('怎么去') || lower.includes('如何前往') || lower.includes('路线')) {
        return { intent: 'howtogo' };
    }
    if (lower.includes('还有多远') || lower.includes('距离')) {
        return { intent: 'distance' };
    }
    // 7. 确认指令（例如“是”“开始导航”“好的”），用于等待确认状态
    if (context.waitingConfirmation && (lower.includes('是') || lower.includes('开始') || lower.includes('好') || lower.includes('导航'))) {
        return { intent: 'confirm' };
    }
    if (context.waitingConfirmation && (lower.includes('不') || lower.includes('取消') || lower.includes('不用'))) {
        return { intent: 'deny' };
    }
    // 默认未知
    return { intent: 'unknown' };
}

// 执行导航（使用高德地图 API）
async function executeNavigate(destination) {
    // 先尝试从POI列表匹配
    let matchedPoi = poiList.find(poi => poi.name.includes(destination) || destination.includes(poi.name));
    
    let endCoord;
    if (matchedPoi) {
        // 转换坐标系（高德坐标 → WGS-84）
        const [wgsLng, wgsLat] = gcj02ToWgs84(matchedPoi.lng, matchedPoi.lat);
        endCoord = { lng: wgsLng, lat: wgsLat };
        context.lastDestination = { name: matchedPoi.name, lat: wgsLat, lng: wgsLng };
        speak(`好的，正在为您规划到${matchedPoi.name}的路线`);
    } else {
        // 调用高德地理编码
        speak(`正在搜索${destination}的位置，请稍后`);
        endCoord = await geocodeAddress(destination);
        if (!endCoord) {
            speak(`抱歉，没有找到${destination}`);
            return;
        }
        context.lastDestination = { name: destination, lat: endCoord.lat, lng: endCoord.lng };
    }
    
    // 获取起点（用户当前位置）
    let startCoord = null;
    if (navigator.geolocation) {
        startCoord = await new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => resolve(null),
                { timeout: 5000 }
            );
        });
    }
    if (!startCoord) {
        const center = map.getCenter();
        startCoord = { lat: center.lat, lng: center.lng };
    }
    
    // 调用高德路线规划
    const route = await getAMapRoute(startCoord, endCoord);
    if (!route) {
        speak("路线规划失败，请稍后再试");
        return;
    }
    
    context.lastRouteInfo = { distance: route.distance, duration: route.duration };
    clearRoute();
    
    // 添加起点终点标记
    startMarker = L.marker([startCoord.lat, startCoord.lng], {
        icon: L.divIcon({ className: 'route-marker', html: '🚩', iconSize: [28, 28] })
    }).addTo(map).bindPopup('起点');
    
    endMarker = L.marker([endCoord.lat, endCoord.lng], {
        icon: L.divIcon({ className: 'route-marker', html: '🏁', iconSize: [28, 28] })
    }).addTo(map).bindPopup(`终点: ${context.lastDestination.name}`);
    
    // 绘制路线
    currentRouteLayer = L.geoJSON(route.geometry, {
        style: { color: '#007aff', weight: 6, opacity: 0.8 }
    }).addTo(map);
    
    map.fitBounds(currentRouteLayer.getBounds());
    
    const distanceKm = (route.distance / 1000).toFixed(1);
    const durationMin = Math.round(route.duration / 60);
    const msg = `到${context.lastDestination.name}的路线规划成功，距离约${distanceKm}公里，步行大约需要${durationMin}分钟。`;
    document.getElementById('status').innerText = msg;
    speak(msg);
    vibrate(3);
}

// 查询无障碍设施（根据类型）
function queryFacility(type) {
    let available = [];
    if (type === '电梯') {
        available = poiList.filter(poi => facilityStatus[poi.name]?.elevator === '正常');
    } else if (type === '坡道') {
        available = poiList.filter(poi => facilityStatus[poi.name]?.ramp === '正常');
    } else if (type === '无障碍卫生间') {
        // 模拟：假设评分>=4的POI有卫生间
        available = poiList.filter(poi => poi.score >= 4);
    } else if (type === '盲道') {
        // 模拟：假设评分>=3.5的有盲道
        available = poiList.filter(poi => poi.score >= 3.5);
    }
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

// 附近无障碍设施（基于当前地图视野）
function nearbyFacilities() {
    const center = map.getCenter();
    const radius = 0.05; // 约5公里
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

// 处理追问“然后呢”
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

// 处理“怎么去”
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

// 处理“还有多远”
function handleDistance() {
    if (context.lastRouteInfo && context.lastRouteInfo.distance) {
        const km = (context.lastRouteInfo.distance / 1000).toFixed(1);
        const min = Math.round(context.lastRouteInfo.duration / 60);
        speak(`全程约${km}公里，步行大约需要${min}分钟。`);
    } else {
        speak("您还没有规划路线，请先说导航到哪里。");
    }
}

// 处理确认（从等待状态中）
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

// 主入口：处理语音识别结果
async function processVoiceCommand(command) {
    if (!command || command.trim() === '') {
        speak("不好意思，我没有听清，可以请你再说一遍吗？");
        return;
    }
    const intentObj = parseIntent(command);
    console.log("解析意图:", intentObj);
    switch (intentObj.intent) {
        case 'clear':
            clearContext();
            break;
        case 'sos':
            sos();
            break;
        case 'navigate':
            await executeNavigate(intentObj.target);
            break;
        case 'facility':
            queryFacility(intentObj.type);
            break;
        case 'nearby':
            nearbyFacilities();
            break;
        case 'then':
            handleThen();
            break;
        case 'howtogo':
            handleHowToGo();
            break;
        case 'distance':
            handleDistance();
            break;
        case 'confirm':
            handleConfirm();
            break;
        case 'deny':
            handleDeny();
            break;
        default:
            speak("抱歉，我暂时无法理解这个需求，你可以试着说“导航到教学楼”或“找无障碍卫生间”。");
    }
}

// ==================== 持续语音监听（优化错误处理） ====================
function initSpeechRecognition() {
    if (!window.webkitSpeechRecognition) {
        console.warn("浏览器不支持语音识别");
        return null;
    }
    const recog = new webkitSpeechRecognition();
    recog.lang = 'zh-CN';
    recog.continuous = true;
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    
    recog.onresult = (event) => {
        resetInactivityTimer();
        const last = event.results[event.results.length - 1];
        if (last.isFinal) {
            const command = last[0].transcript;
            document.getElementById('status').innerText = `🎤 识别到: ${command}`;
            processVoiceCommand(command).catch(console.error);
        }
    };
    
recog.onerror = (event) => {
    console.warn("语音识别错误:", event.error);
    if (event.error === 'no-speech') {
        // 没有检测到声音，立即停止监听
        speak("没有检测到声音，语音识别已结束。");
        stopListening();
    } else if (event.error === 'audio-capture') {
        speak("没有检测到麦克风，请检查麦克风权限。");
        stopListening();
    } else if (event.error === 'not-allowed') {
        speak("请允许麦克风权限，才能使用语音功能。");
        stopListening();
    } else if (event.error === 'network') {
        speak("网络好像不太稳定，您可以稍后再试。");
    }
};
    
    recog.onend = () => {
        if (isListening) {
            // 意外结束时，延迟1秒重启
            setTimeout(() => {
                if (isListening && recognition) {
                    try {
                        recognition.start();
                    } catch (e) {
                        console.warn("重启识别失败", e);
                        stopListening();
                    }
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
            speak("尊敬的用户，未检测到您的声音，语音小助手暂时下线。");
            stopListening();
        }
    }, inactivityTimeout);
}

function startListening() {
    if (!window.webkitSpeechRecognition) {
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
         updateVoiceButtonState();   // 新增
        const voiceBtn = document.getElementById('voiceBtn');
        voiceBtn.innerHTML = '🎤 语音中...';
        voiceBtn.classList.add('listening');
        document.getElementById('status').innerText = '🎙️ 持续监听中，您可以说话...';
        resetInactivityTimer();
        return true;
    } catch (e) {
        console.error("启动语音识别失败:", e);
        if (e.message && e.message.includes('start')) {
            try { recognition.stop(); } catch(ex) {}
            setTimeout(() => startListening(), 500);
        } else {
            alert("无法启动语音识别，请刷新页面重试");
        }
        return false;
    }
}

function stopListening() {
    if (recognition && isListening) {
        try {
            recognition.stop();
        } catch (e) {}
        isListening = false;
        if (inactivityTimer) clearTimeout(inactivityTimer);
        const voiceBtn = document.getElementById('voiceBtn');
        voiceBtn.innerHTML = '🎤 语音';
        voiceBtn.style.background = '';
        voiceBtn.classList.remove('listening');
        document.getElementById('status').innerHTML = '👋 欢迎使用无障碍出行伴侣';
    updateVoiceButtonState();   
    }
}

function toggleVoiceRecognition() {
    // 1. 如果正在播报，立即停止播报
    if (isSpeaking) {
        window.speechSynthesis.cancel();
        isSpeaking = false;
        updateVoiceButtonState();
        document.getElementById('status').innerHTML = '👋 欢迎使用无障碍出行伴侣';
        return;
    }
    
    // 2. 如果正在录音，则停止录音
    if (isListening) {
        stopListening();
        return;
    }
    
    // 3. 否则开始录音
    startListening();
}

// ========== 原有功能（SOS、上报、数据看板等） ==========
function sos() {
    const msg = "SOS求助！已通知社区管理员（模拟）。当前位置：市民中心图书馆附近。";
    speak(msg);
    document.getElementById('status').innerHTML = `<span style="color:red;">🚨 ${msg}</span>`;
    vibrate(4);
    alert(msg);
}

// 上报模态框（增强版：显示具体地点名称）
async function showReportModal() {
    const center = map.getCenter();
    const lat = center.lat;
    const lng = center.lng;

    // 设置隐藏字段
    document.getElementById('obstacleLat').value = lat.toFixed(6);
    document.getElementById('obstacleLng').value = lng.toFixed(6);

    // 显示经纬度
    document.getElementById('reportLocationCoords').innerText = `经度: ${lng.toFixed(6)}, 纬度: ${lat.toFixed(6)}`;
    document.getElementById('reportLocationName').innerText = '正在获取地点名称...';

    // 显示模态框
    document.getElementById('reportModal').style.display = 'flex';

    // 异步获取地址名称
    try {
        const addr = await reverseGeocode(lat, lng);
        document.getElementById('reportLocationName').innerHTML = `<strong>${addr}</strong>`;
    } catch (e) {
        document.getElementById('reportLocationName').innerText = '无法获取地点名称';
    }

    // 原有的 locationHint 也可以同步更新（可选）
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
        counts.push(obstacles.filter(o => o.reportTime === d.toISOString().slice(0, 10)).length);
    }
    const trendChart = echarts.init(document.getElementById('trendChart'));
    trendChart.setOption({ title: { text: '近一周上报趋势' }, xAxis: { type: 'category', data: days }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: counts }] });
}

function locateUser() {
    if (!navigator.geolocation) { alert("浏览器不支持地理定位"); return; }
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            map.setView([lat, lng], 16);
            L.marker([lat, lng], { icon: L.divIcon({ className: 'current-location', html: '📍', iconSize: [24, 24] }) }).addTo(map).bindPopup('您当前的位置').openPopup();
            speak("已定位到您的位置");
        },
        (error) => { alert("定位失败：" + error.message); },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// 页面初始化
document.addEventListener('DOMContentLoaded', () => {
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
        id: Date.now(),
        lat, lng,
        type: type,
        description: desc,
        status: "未处理",
        report_time: new Date().toISOString().slice(0, 10),
        photo: photoData || null
    };
    
    const success = await addObstacleToServer(newObstacle);
    if (success) {
        // 添加到本地数组并刷新标记
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
});

window.onload = async () => {
    initMap();
     await loadPoiFromServer();
    await loadObstaclesFromServer();
    
    addPoiMarkers();
    updateObstacleMarkers();
    renderFacilityPanel();

document.getElementById('voiceBtn').onclick = toggleVoiceRecognition;
    document.getElementById('sosBtn').onclick = sos;
    document.getElementById('reportBtn').onclick = showReportModal;
    document.getElementById('statsBtn').onclick = showStats;
    document.getElementById('closeModal').onclick = () => document.getElementById('chartModal').style.display = 'none';
    document.getElementById('closeReportModal').onclick = () => document.getElementById('reportModal').style.display = 'none';
    document.getElementById('agreePrivacy').onclick = () => document.getElementById('privacyModal').style.display = 'none';
    document.getElementById('locateBtn').onclick = locateUser;
    // 新增搜索路线按钮
    document.getElementById('searchRouteBtn').addEventListener('click', planRealRoute);
    // 使用我的位置
    document.getElementById('useMyLocationBtn').addEventListener('click', useMyLocationAsStart);
    // 清除路线
    document.getElementById('clearRouteBtn').addEventListener('click', () => {
        clearRoute();
        speak('路线已清除');
    });

    const contrastBtn = document.getElementById('contrastBtn');
    if (loadContrastPref()) document.body.classList.add('high-contrast');
    contrastBtn.onclick = () => {
        document.body.classList.toggle('high-contrast');
        saveContrastPref(document.body.classList.contains('high-contrast'));
    };
    document.getElementById('clearDataBtn').onclick = () => {
        if (confirm('清除所有本地数据？不可恢复。')) {
            localStorage.clear();
            location.reload();
        }
    };
    window.onclick = (e) => { if (e.target.classList.contains('modal')) e.target.style.display = 'none'; };

    // 模拟设施状态实时更新（每30秒）
    setInterval(() => {
        const keys = Object.keys(facilityStatus);
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        const newElevator = Math.random() > 0.5 ? "正常" : "维修中";
        const newRamp = Math.random() > 0.5 ? "正常" : "维修中";
        facilityStatus[randomKey] = { elevator: newElevator, ramp: newRamp };
        poiMarkers.forEach((marker, idx) => { marker.getPopup().setContent(createPopupContent(poiList[idx])); });
        renderFacilityPanel();
        document.getElementById('refreshIndicator').style.opacity = '0.6';
        setTimeout(() => document.getElementById('refreshIndicator').style.opacity = '1', 300);
    }, 30000);
};

// 路线规划功能
//清除旧路线
function clearRoute() {
    if (currentRouteLayer) map.removeLayer(currentRouteLayer);
    if (startMarker) map.removeLayer(startMarker);
    if (endMarker) map.removeLayer(endMarker);
    startMarker = endMarker = null;
    document.getElementById('status').innerText = '👋 欢迎使用无障碍出行伴侣';
    // 重置障碍物高亮
    if (window.highlightedMarkers) {
        window.highlightedMarkers.forEach(m => m.setIcon(L.divIcon({ className: 'obstacle-marker', html: '⚠️', iconSize: [24, 24] })));
    }
}

// 路线规划函数 - 直接使用 POI 坐标（不依赖地理编码）
async function planRealRoute() {
    let startAddr = document.getElementById('startAddress').value.trim();
    let endAddr = document.getElementById('endAddress').value.trim();
    
    if (!startAddr || !endAddr) {
        alert('请输入起点和终点地址');
        return;
    }

    document.getElementById('status').innerText = '🔍 正在匹配地点坐标...';

    // 1. 先从 POI 列表中匹配坐标
    const startPoi = poiList.find(poi => 
        poi.name.includes(startAddr) || startAddr.includes(poi.name)
    );
    const endPoi = poiList.find(poi => 
        poi.name.includes(endAddr) || endAddr.includes(poi.name)
    );

    if (!startPoi) {
        alert(`未找到起点"${startAddr}"，请从以下地点中选择：\n${poiList.slice(0, 20).map(p => p.name).join('\n')}`);
        return;
    }
    if (!endPoi) {
        alert(`未找到终点"${endAddr}"，请从以下地点中选择：\n${poiList.slice(0, 20).map(p => p.name).join('\n')}`);
        return;
    }

    // 2. 清除旧路线
    clearRoute();

    // 3. 添加起点/终点标记（地图显示用 WGS-84）
    const [startMapLng, startMapLat] = gcj02ToWgs84(startPoi.lng, startPoi.lat);
    const [endMapLng, endMapLat] = gcj02ToWgs84(endPoi.lng, endPoi.lat);

    startMarker = L.marker([startMapLat, startMapLng], {
        icon: L.divIcon({ className: 'route-marker', html: '🚩', iconSize: [28, 28] })
    }).addTo(map).bindPopup(`起点: ${startPoi.name}`);

    endMarker = L.marker([endMapLat, endMapLng], {
        icon: L.divIcon({ className: 'route-marker', html: '🏁', iconSize: [28, 28] })
    }).addTo(map).bindPopup(`终点: ${endPoi.name}`);

    // 4. 获取路线（高德 API 需要 GCJ-02 坐标）
    const route = await getAMapRouteByPoi(startPoi, endPoi);
    
    if (!route) {
        // 降级：绘制直线
        const latlngs = [[startMapLat, startMapLng], [endMapLat, endMapLng]];
        currentRouteLayer = L.polyline(latlngs, { color: 'red', weight: 4, dashArray: '5, 10' }).addTo(map);
        map.fitBounds(currentRouteLayer.getBounds());
        const distance = getDistance({ lat: startMapLat, lng: startMapLng }, { lat: endMapLat, lng: endMapLng }).toFixed(2);
        document.getElementById('status').innerText = `直线距离约 ${distance} 公里（无法获取步行路线）`;
        speak(`直线距离约 ${distance} 公里，请参考地图`);
        return;
    }

    // 5. 绘制路线
    const geojson = route.geometry;
    currentRouteLayer = L.geoJSON(geojson, {
        style: { color: '#007aff', weight: 6, opacity: 0.8 }
    }).addTo(map);

    map.fitBounds(currentRouteLayer.getBounds());

    const distance = (route.distance / 1000).toFixed(2);
    const duration = Math.round(route.duration / 60);
    const wheelchairMode = document.getElementById('wheelchairModeSearch').checked;
    const modeText = wheelchairMode ? '轮椅优先模式' : '普通模式';

    const baseMsg = `从${startPoi.name}到${endPoi.name}，路线规划成功（${modeText}），全程约 ${distance} 公里，预计步行 ${duration} 分钟。`;
    document.getElementById('status').innerText = baseMsg;
    speak(baseMsg);
    vibrate(3);

    // 6. 沿途障碍物检测
    const warnings = checkObstaclesAlongRoute(geojson, wheelchairMode);
    if (warnings.length > 0) {
        const totalObstacles = warnings.length;
        const types = [...new Set(warnings.map(o => o.type))];
        const warningMsg = wheelchairMode
            ? `⚠️ 轮椅优先模式：沿途发现 ${totalObstacles} 处障碍物（${types.join('、')}），强烈建议手动绕行！`
            : `📢 普通模式：沿途有 ${totalObstacles} 处障碍物，请注意安全。`;

        speak(warningMsg);
        if (wheelchairMode) {
            vibrate(4);
            document.getElementById('status').innerHTML = `<span style="color:red;">🚨 ${warningMsg}</span>`;
        } else {
            vibrate(1);
            document.getElementById('status').innerText = baseMsg + ' ' + warningMsg;
        }
        highlightNearbyObstacles(warnings);
    } else {
        document.getElementById('status').innerText = baseMsg;
    }
}


// 计算两点直线距离（降级备用）
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

// 地址转坐标（使用高德地图 API，限定南华大学雨母校区）
async function geocodeAddress(address) {
    // 加上城市限定，避免解析到其他城市
    const fullAddress = `南华大学雨母校区${address}`;
    const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(fullAddress)}&city=衡阳市&key=${AMAP_KEY}&output=JSON`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        console.log('高德地理编码响应:', data);
        if (data.status === '1' && data.geocodes && data.geocodes.length > 0) {
            const location = data.geocodes[0].location.split(',');
            console.log('原始GCJ-02坐标:', location);
            const [wgsLng, wgsLat] = gcj02ToWgs84(parseFloat(location[0]), parseFloat(location[1]));
            console.log('转换后WGS-84坐标:', wgsLng, wgsLat);
            return { lng: wgsLng, lat: wgsLat };
        } else {
            console.error('地理编码失败:', data);
            return null;
        }
    } catch (error) {
        console.error('地理编码请求失败:', error);
        return null;
    }
}

// 反向地理编码（坐标→地址，使用高德地图 API）
async function reverseGeocode(lat, lng) {
    const url = `https://restapi.amap.com/v3/geocode/regeo?location=${lng},${lat}&key=${AMAP_KEY}&output=JSON`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.status === '1' && data.regeocode) {
            return data.regeocode.formatted_address;
        } else {
            return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }
    } catch (error) {
        console.error('逆地理编码失败:', error);
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
}

// 调用高德地图步行路线规划 API（直接传入 POI 对象）
async function getAMapRoute(startPoi, endPoi) {
    // POI 里的坐标已经是 GCJ-02，不需要转换
    const origin = `${startPoi.lng},${startPoi.lat}`;
    const destination = `${endPoi.lng},${endPoi.lat}`;
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
                    let coords = decodeAMapPolyline(polyline);
                    // 将 GCJ-02 坐标转换为 WGS-84（用于地图显示）
                    coords = coords.map(coord => {
                        const [wgsLng, wgsLat] = gcj02ToWgs84(coord[0], coord[1]);
                        return [wgsLng, wgsLat];
                    });
                    allCoords = allCoords.concat(coords);
                }
            }
            
            return {
                distance: path.distance,
                duration: path.duration,
                geometry: {
                    type: 'LineString',
                    coordinates: allCoords
                }
            };
        } else {
            console.error('路线规划失败:', data);
            return null;
        }
    } catch (error) {
        console.error('高德路线规划请求失败:', error);
        return null;
    }
}

// 调用高德地图步行路线规划 API（直接传入 POI 对象，使用 GCJ-02 坐标）
async function getAMapRouteByPoi(startPoi, endPoi) {
    // POI 里的坐标已经是 GCJ-02，直接使用
    const origin = `${startPoi.lng},${startPoi.lat}`;
    const destination = `${endPoi.lng},${endPoi.lat}`;
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
                    let coords = decodeAMapPolyline(polyline);
                    // 将 GCJ-02 坐标转换为 WGS-84（用于地图显示）
                    coords = coords.map(coord => {
                        const [wgsLng, wgsLat] = gcj02ToWgs84(coord[0], coord[1]);
                        return [wgsLng, wgsLat];
                    });
                    allCoords = allCoords.concat(coords);
                }
            }
            
            return {
                distance: path.distance,
                duration: path.duration,
                geometry: {
                    type: 'LineString',
                    coordinates: allCoords
                }
            };
        } else {
            console.error('路线规划失败:', data);
            return null;
        }
    } catch (error) {
        console.error('高德路线规划请求失败:', error);
        return null;
    }
}

// 解析高德地图返回的 polyline 字符串
function decodeAMapPolyline(polyline) {
    const coords = [];
    const points = polyline.split(';');
    for (const point of points) {
        const [lng, lat] = point.split(',');
        coords.push([parseFloat(lng), parseFloat(lat)]);
    }
    return coords;
}

async function useMyLocationAsStart() {
    if (!navigator.geolocation) {
        alert('浏览器不支持定位');
        return;
    }
    document.getElementById('status').innerText = '📍 正在获取您的位置...';
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const addr = await reverseGeocode(lat, lng);
        document.getElementById('startAddress').value = addr;
        document.getElementById('status').innerText = '✅ 已设置起点为当前位置';
        speak('起点已设置为当前位置');
    }, (err) => {
        alert('定位失败：' + err.message);
        document.getElementById('status').innerText = '❌ 定位失败';
    }, { enableHighAccuracy: true, timeout: 10000 });
}

// 检测沿途障碍物（返回障碍物数组）
function checkObstaclesAlongRoute(geojson, strictMode = false) {
    const coords = [];
    if (geojson.type === 'LineString') {
        geojson.coordinates.forEach(c => coords.push({ lng: c[0], lat: c[1] }));
    } else return [];

    const threshold = strictMode ? 0.003 : 0.0015; // 轮椅模式更敏感（约300米 vs 150米）
    return obstacles.filter(obs => {
        return coords.some(c => Math.hypot(c.lat - obs.lat, c.lng - obs.lng) < threshold);
    });
}

// 高亮沿途障碍物
function highlightNearbyObstacles(obsArray) {
    // 先重置所有障碍物为默认样式
    obstacleMarkers.forEach(m => m.setIcon(L.divIcon({ className: 'obstacle-marker', html: '⚠️', iconSize: [24, 24] })));
    // 高亮传入的障碍物
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

document.addEventListener('DOMContentLoaded', () => {
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
    const reportForm = document.getElementById('reportForm');
    if (reportForm) {
        reportForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const type = document.getElementById('obstacleType').value;
            const desc = document.getElementById('obstacleDesc').value;
            const photoData = document.getElementById('photoPreview').src;
            const lat = parseFloat(document.getElementById('obstacleLat').value);
            const lng = parseFloat(document.getElementById('obstacleLng').value);
            const newObstacle = { id: Date.now(), lat, lng, type: type, description: desc, status: "未处理", reportTime: new Date().toISOString().slice(0, 10), photo: photoData || null };
            obstacles.push(newObstacle);
            
            updateObstacleMarkers();
            document.getElementById('reportModal').style.display = 'none';
            speak("感谢上报，管理员会尽快处理");
            vibrate(1);
            reportForm.reset();
            document.getElementById('photoPreview').style.display = 'none';
        }
    );
    }
});

window.onload = () => {
    initMap();
    addPoiMarkers();
    updateObstacleMarkers();
    renderFacilityPanel();
    if (document.getElementById('voiceBtn')) document.getElementById('voiceBtn').onclick = toggleVoiceRecognition;
    if (document.getElementById('sosBtn')) document.getElementById('sosBtn').onclick = sos;
    if (document.getElementById('reportBtn')) document.getElementById('reportBtn').onclick = showReportModal;
    if (document.getElementById('statsBtn')) document.getElementById('statsBtn').onclick = showStats;
    if (document.getElementById('closeModal')) document.getElementById('closeModal').onclick = () => document.getElementById('chartModal').style.display = 'none';
    if (document.getElementById('closeReportModal')) document.getElementById('closeReportModal').onclick = () => document.getElementById('reportModal').style.display = 'none';
    if (document.getElementById('agreePrivacy')) document.getElementById('agreePrivacy').onclick = () => document.getElementById('privacyModal').style.display = 'none';
    if (document.getElementById('locateBtn')) document.getElementById('locateBtn').onclick = locateUser;
    if (document.getElementById('searchRouteBtn')) document.getElementById('searchRouteBtn').addEventListener('click', planRealRoute);
    if (document.getElementById('useMyLocationBtn')) document.getElementById('useMyLocationBtn').addEventListener('click', useMyLocationAsStart);
    if (document.getElementById('clearRouteBtn')) document.getElementById('clearRouteBtn').addEventListener('click', () => { clearRoute(); speak('路线已清除'); });
    if (document.getElementById('contrastBtn')) {
        if (loadContrastPref()) document.body.classList.add('high-contrast');
        document.getElementById('contrastBtn').onclick = () => {
            document.body.classList.toggle('high-contrast');
            saveContrastPref(document.body.classList.contains('high-contrast'));
        };
    }
    if (document.getElementById('clearDataBtn')) {
        document.getElementById('clearDataBtn').onclick = () => {
            if (confirm('清除所有本地数据？不可恢复。')) {
                localStorage.clear();
                location.reload();
            }
        };
    }
    window.onclick = (e) => { if (e.target.classList.contains('modal')) e.target.style.display = 'none'; };
    setInterval(() => {
        const keys = Object.keys(facilityStatus);
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        const newElevator = Math.random() > 0.5 ? "正常" : "维修中";
        const newRamp = Math.random() > 0.5 ? "正常" : "维修中";
        facilityStatus[randomKey] = { elevator: newElevator, ramp: newRamp };
        poiMarkers.forEach((marker, idx) => { if (marker && marker.getPopup) marker.getPopup().setContent(createPopupContent(poiList[idx])); });
        renderFacilityPanel();
        document.getElementById('refreshIndicator').style.opacity = '0.6';
        setTimeout(() => document.getElementById('refreshIndicator').style.opacity = '1', 300);
    }, 30000);
};

function speak(text) {
    if (!window.speechSynthesis) return;
    // 先停止当前可能正在播放的语音
    window.speechSynthesis.cancel();
    
    const cleanText = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9，。？、：；""''！]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9;
    
    // 开始播报
    isSpeaking = true;
    updateVoiceButtonState();
    
    utterance.onend = () => {
        isSpeaking = false;
        updateVoiceButtonState();
    };
    utterance.onerror = () => {
        isSpeaking = false;
        updateVoiceButtonState();
    };
    
    window.speechSynthesis.speak(utterance);
}

function updateVoiceButtonState() {
    const voiceBtn = document.getElementById('voiceBtn');
    if (isListening) {
        voiceBtn.innerHTML = '🎤 录音中...';
        voiceBtn.style.background = '#ff3b30';
    } else if (isSpeaking) {
        voiceBtn.innerHTML = '🔊 播报中...';
        voiceBtn.style.background = '#34c759';
    } else {
        voiceBtn.innerHTML = '🎤 语音';
        voiceBtn.style.background = '';
    }
}

