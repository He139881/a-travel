const API_BASE = 'http://localhost:3000/api';

// ========== 美观弹窗函数 ==========
function showNiceAlert(message, icon = '💬', onConfirm = null) {
    const overlay = document.getElementById('customAlertOverlay');
    if (!overlay) {
        alert(message);
        if (onConfirm) onConfirm();
        return;
    }
    const msgEl = document.getElementById('customAlertMsg');
    const iconEl = document.getElementById('customAlertIcon');
    const btnsDiv = document.getElementById('customAlertBtns');
    iconEl.textContent = icon;
    msgEl.textContent = message;
    btnsDiv.innerHTML = '<button id="customAlertOkBtn" class="btn-primary custom-alert-ok">确 定</button>';
    const okBtn = document.getElementById('customAlertOkBtn');
    overlay.style.display = 'flex';
    const closeHandler = () => {
        overlay.style.display = 'none';
        if (onConfirm) onConfirm();
        okBtn.removeEventListener('click', closeHandler);
    };
    okBtn.addEventListener('click', closeHandler);
    overlay.onclick = (e) => { if (e.target === overlay) closeHandler(); };
}

function showConfirm(message, onYes, onNo, icon = '❓') {
    const overlay = document.getElementById('customConfirmOverlay');
    if (!overlay) {
        if (confirm(message)) { if (onYes) onYes(); } else { if (onNo) onNo(); }
        return;
    }
    const msgEl = document.getElementById('confirmMsg');
    const iconEl = document.getElementById('confirmIcon');
    const yesBtn = document.getElementById('confirmYesBtn');
    const noBtn = document.getElementById('confirmNoBtn');
    iconEl.textContent = icon;
    msgEl.textContent = message;
    overlay.style.display = 'flex';
    const close = () => { overlay.style.display = 'none'; };
    const handleYes = () => { close(); if (onYes) onYes(); cleanup(); };
    const handleNo = () => { close(); if (onNo) onNo(); cleanup(); };
    const cleanup = () => {
        yesBtn.removeEventListener('click', handleYes);
        noBtn.removeEventListener('click', handleNo);
        overlay.onclick = null;
    };
    yesBtn.addEventListener('click', handleYes);
    noBtn.addEventListener('click', handleNo);
    overlay.onclick = (e) => { if (e.target === overlay) handleNo(); };
}

// ========== 全局变量 ==========
let obstacles = [];
let poiList = [];
let facilityStatus = {};
let heatmapLayer = null;
let heatmapMap = null;
let selectedIds = new Set();
let notificationEnabled = false;
let heatmapInitialized = false; // 防止重复初始化

// ========== 认证相关 ==========
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function checkAdminAuth() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!token || user.role !== 'admin') {
        window.location.href = 'login.html';
        return false;
    }
    document.getElementById('adminNameDisplay').innerText = `👤 ${user.username}`;
    return true;
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}

if (!checkAdminAuth()) throw new Error('未授权访问');

// ========== 辅助函数 ==========
function showTableError(containerId, message) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<div style="padding:40px;text-align:center;color:#ff3b30;">⚠️ ${message}</div>`;
    }
}

// ========== 障碍物数据操作 ==========
async function loadObstaclesFromServer() {
    try {
        const res = await fetch(`${API_BASE}/obstacles`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        obstacles = data;
        renderTable(document.getElementById('searchInput').value, document.getElementById('statusFilter').value);
        renderCharts();
        // 热力图只在障碍物 Tab 可见时初始化
        const obstaclesTab = document.getElementById('obstaclesTab');
        if (obstaclesTab && !obstaclesTab.classList.contains('hidden')) {
            initHeatmap();
        }
        updateStats();
    } catch (err) {
        console.error('加载障碍物失败:', err);
        showNiceAlert(`加载障碍物失败：${err.message}\n请确保后端服务已启动`, '❌');
        showTableError('obstacleTable', '无法连接服务器，请检查后端是否运行');
    }
}

async function updateObstacleOnServer(id, updates) {
    try {
        await fetch(`${API_BASE}/obstacles/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify(updates)
        });
    } catch (err) {
        console.error(err);
        showNiceAlert('更新障碍物失败', '❌');
    }
}

// ========== POI 数据操作 ==========
async function loadPoiList() {
    try {
        const res = await fetch(`${API_BASE}/poi`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        poiList = data;
        renderPoiTable();
    } catch (err) {
        console.error('加载 POI 失败', err);
        showNiceAlert('加载 POI 失败：请检查后端服务', '❌');
        showTableError('poiTableContainer', '无法加载 POI 数据，请检查后端');
    }
}

async function loadFacilityStatus() {
    try {
        const res = await fetch(`${API_BASE}/poi/facility-status`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        facilityStatus = data;
    } catch (err) {
        console.error('加载设施状态失败', err);
        showNiceAlert('加载设施状态失败', '❌');
    }
}

async function updatePoiFacility(poiName, updates) {
    try {
        const res = await fetch(`${API_BASE}/poi/facility-status/${encodeURIComponent(poiName)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify(updates)
        });
        if (res.ok) {
            showNiceAlert('更新成功', '✅');
            await loadFacilityStatus();
            renderPoiTable();
        } else {
            const err = await res.json();
            showNiceAlert('更新失败：' + err.error, '❌');
        }
    } catch (err) {
        showNiceAlert('网络错误', '❌');
    }
}

async function deletePoi(id) {
    showConfirm('确定删除该 POI？', async () => {
        try {
            const res = await fetch(`${API_BASE}/poi/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                showNiceAlert('删除成功', '✅');
                loadPoiList();
            } else {
                showNiceAlert('删除失败', '❌');
            }
        } catch (err) {
            showNiceAlert('网络错误', '❌');
        }
    });
}

// 新增 POI 使用模态框代替 prompt
function showAddPoiModal() {
    document.getElementById('addPoiModal').style.display = 'flex';
    // 重置表单
    document.getElementById('addPoiForm').reset();
    document.getElementById('poiScore').value = '3.0';
    document.getElementById('scoreValue').innerText = '3.0';
}

async function submitAddPoi() {
    const name = document.getElementById('poiName').value.trim();
    const lat = parseFloat(document.getElementById('poiLat').value);
    const lng = parseFloat(document.getElementById('poiLng').value);
    const type = document.getElementById('poiType').value.trim() || '其他';
    const score = parseFloat(document.getElementById('poiScore').value);
    if (!name) { showNiceAlert('请填写 POI 名称', '⚠️'); return; }
    if (isNaN(lat) || isNaN(lng)) { showNiceAlert('请填写有效的坐标', '⚠️'); return; }
    try {
        const res = await fetch(`${API_BASE}/poi`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ name, lat, lng, type, score })
        });
        if (res.ok) {
            showNiceAlert('添加成功', '✅');
            document.getElementById('addPoiModal').style.display = 'none';
            loadPoiList();
        } else {
            showNiceAlert('添加失败', '❌');
        }
    } catch (err) {
        showNiceAlert('网络错误', '❌');
    }
}

function renderPoiTable() {
    const container = document.getElementById('poiTableContainer');
    if (!container) return;
    if (!poiList.length) {
        container.innerHTML = '<div style="padding:40px;text-align:center;color:#999;">暂无 POI 数据</div>';
        return;
    }
    let html = `<table><th>ID</th><th>名称</th><th>类型</th><th>评分</th><th>电梯</th><th>坡道</th><th>盲道</th><th>台阶</th><th>操作</th></tr>`;
    poiList.forEach(poi => {
        const status = facilityStatus[poi.name] || { elevator: '无', ramp: '无', tactilePaving: '无', stairs: '无台阶' };
        html += `<tr>
            <td>${poi.id}</td>
            <td>${poi.name}</td>
            <td>${poi.type || '其他'}</td>
            <td>${poi.score}</td>
            <td>${status.elevator}</td>
            <td>${status.ramp}</td>
            <td>${status.tactilePaving}</td>
            <td>${status.stairs}</td>
            <td>
                <button class="action-btn edit-btn" onclick="openFacilityEditModal('${poi.name}')">✏️ 编辑状态</button>
                <button class="action-btn delete-btn" onclick="deletePoi(${poi.id})">🗑️ 删除</button>
            </td>
        </tr>`;
    });
    html += '</table>';
    container.innerHTML = html;
}

function openFacilityEditModal(poiName) {
    const status = facilityStatus[poiName] || { elevator: '无', ramp: '无', tactilePaving: '无', stairs: '无台阶' };
    document.getElementById('editPoiName').value = poiName;
    document.getElementById('editElevator').value = status.elevator;
    document.getElementById('editRamp').value = status.ramp;
    document.getElementById('editTactilePaving').value = status.tactilePaving;
    document.getElementById('editStairs').value = status.stairs;
    document.getElementById('facilityEditModal').style.display = 'flex';
}

// ========== 热力图（修复宽度为0问题）==========
function initHeatmap() {
    const container = document.getElementById('heatmapContainer');
    if (!container) return;
    // 检查容器是否可见且宽度>0
    if (container.offsetWidth === 0 || container.offsetHeight === 0) {
        console.warn('热力图容器不可见，延迟初始化');
        setTimeout(initHeatmap, 200);
        return;
    }
    if (heatmapMap) {
        // 如果已存在，只更新图层
        updateHeatmapLayer();
        return;
    }
    heatmapMap = L.map('heatmapContainer').setView([26.879, 112.516], 15);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(heatmapMap);
    updateHeatmapLayer();
    heatmapInitialized = true;
}

function updateHeatmapLayer() {
    if (!heatmapMap) return;
    if (heatmapLayer) heatmapMap.removeLayer(heatmapLayer);
    const points = obstacles.map(obs => [obs.lat, obs.lng, 1.0]);
    if (points.length === 0) return;
    heatmapLayer = L.heatLayer(points, { radius: 25, blur: 15, maxZoom: 17 }).addTo(heatmapMap);
}

// ========== 障碍物表格渲染 ==========
function renderTable(filterText = '', statusFilter = 'all') {
    const container = document.getElementById('obstacleTable');
    if (!container) return;
    let filtered = obstacles.filter(obs => {
        const matchText = !filterText || obs.type.includes(filterText) || (obs.description && obs.description.includes(filterText));
        const matchStatus = statusFilter === 'all' || obs.status === statusFilter;
        return matchText && matchStatus;
    });
    if (!filtered.length) {
        container.innerHTML = '<div style="padding:40px;text-align:center;color:#999;">暂无障碍物记录</div>';
        return;
    }
    let html = `<table><thead><tr><th style="width:40px;"><input type="checkbox" id="selectAll"></th><th>ID</th><th>位置</th><th>类型</th><th>描述</th><th>状态</th><th>志愿者</th><th>上报时间</th><th>照片</th><th>操作</th></tr></thead><tbody>`;
    filtered.forEach(obs => {
        const checked = selectedIds.has(obs.id) ? 'checked' : '';
        html += `<tr>
            <td style="text-align:center;"><input type="checkbox" class="row-checkbox" value="${obs.id}" ${checked}></td>
            <td>${obs.id}</td>
            <td>${obs.lat.toFixed(4)}, ${obs.lng.toFixed(4)}</td>
            <td>${obs.type}</td>
            <td>${obs.description || '-'}</td>
            <td><span class="status-badge status-${obs.status}">${obs.status}</span></td>
            <td>${obs.claimed_by || '—'}</td>
            <td>${obs.report_time || ''}</td>
            <td>${obs.photo ? `<img src="${obs.photo}" class="photo-thumb" onclick="showPhoto('${obs.photo}')">` : '无'} ${obs.resolved_photo ? `<img src="${obs.resolved_photo}" class="photo-thumb" onclick="showPhoto('${obs.resolved_photo}')" title="处理后">` : ''}</td>
            <td>${obs.status === '未处理' ? `<button class="action-btn" onclick="openClaimModal(${obs.id})">🤝 认领</button>` : ''}
                ${obs.status === '处理中' && obs.claimed_by ? `<button class="action-btn" onclick="openResolveModal(${obs.id})">✅ 上传完成</button>` : ''}
                <button class="action-btn" onclick="changeStatus(${obs.id}, '${obs.status === '未处理' ? '处理中' : (obs.status === '处理中' ? '已完成' : '未处理')}')">✏️ 状态</button>
            </td>
        </tr>`;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.addEventListener('change', (e) => {
            const checked = e.target.checked;
            document.querySelectorAll('.row-checkbox').forEach(cb => {
                cb.checked = checked;
                const id = parseInt(cb.value);
                checked ? selectedIds.add(id) : selectedIds.delete(id);
            });
        });
    }
    document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const id = parseInt(e.target.value);
            e.target.checked ? selectedIds.add(id) : selectedIds.delete(id);
        });
    });
    updateStats();
}

function updateStats() {
    document.getElementById('totalCount').innerText = obstacles.length;
    document.getElementById('pendingCount').innerText = obstacles.filter(o => o.status === '未处理').length;
    document.getElementById('processingCount').innerText = obstacles.filter(o => o.status === '处理中').length;
    document.getElementById('resolvedCount').innerText = obstacles.filter(o => o.status === '已完成').length;
}

// ========== 图表渲染 ==========
function renderCharts() {
    const typeCounts = {};
    obstacles.forEach(o => { typeCounts[o.type] = (typeCounts[o.type] || 0) + 1; });
    const typeChart = echarts.init(document.getElementById('typeChart'));
    typeChart.setOption({ title: { text: '障碍物类型分布' }, tooltip: {}, series: [{ type: 'pie', data: Object.entries(typeCounts).map(([n,v]) => ({ name: n, value: v })) }] });
    const days = [], counts = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(5,10);
        days.push(dateStr);
        counts.push(obstacles.filter(o => o.report_time === d.toISOString().slice(0,10)).length);
    }
    const trendChart = echarts.init(document.getElementById('trendChartAdmin'));
    trendChart.setOption({ title: { text: '近一周上报趋势' }, xAxis: { type: 'category', data: days }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: counts }] });
}

// ========== 认领/完成 ==========
function openClaimModal(id) {
    document.getElementById('claimObstacleId').value = id;
    document.getElementById('claimActionSection').style.display = 'block';
    document.getElementById('resolveSection').style.display = 'none';
    document.getElementById('volunteerName').value = '';
    document.getElementById('claimModal').style.display = 'flex';
}
function openResolveModal(id) {
    const obs = obstacles.find(o => o.id === id);
    document.getElementById('claimObstacleId').value = id;
    document.getElementById('volunteerName').value = obs?.claimed_by || '';
    document.getElementById('claimActionSection').style.display = 'none';
    document.getElementById('resolveSection').style.display = 'block';
    document.getElementById('claimModal').style.display = 'flex';
}
async function confirmClaim() {
    const id = parseInt(document.getElementById('claimObstacleId').value);
    const name = document.getElementById('volunteerName').value.trim();
    if (!name) { showNiceAlert('请输入志愿者姓名', '⚠️'); return; }
    const obs = obstacles.find(o => o.id === id);
    if (obs) {
        obs.status = '处理中';
        obs.claimed_by = name;
        obs.claim_time = new Date().toISOString().slice(0,10);
        await updateObstacleOnServer(id, { status: '处理中', claimed_by: name, claim_time: obs.claim_time });
        renderTable(document.getElementById('searchInput').value, document.getElementById('statusFilter').value);
        renderCharts();
        document.getElementById('claimModal').style.display = 'none';
        if (notificationEnabled) new Notification(`障碍物 #${id} 已被 ${name} 认领`);
    }
}
async function confirmResolve() {
    const id = parseInt(document.getElementById('claimObstacleId').value);
    const obs = obstacles.find(o => o.id === id);
    const fileInput = document.getElementById('resolvedPhotoInput');
    const process = async (photoData) => {
        obs.status = '已完成';
        obs.resolved_photo = photoData || null;
        obs.resolved_time = new Date().toISOString().slice(0,10);
        await updateObstacleOnServer(id, { status: '已完成', resolved_photo: photoData || null, resolved_time: obs.resolved_time });
        renderTable(document.getElementById('searchInput').value, document.getElementById('statusFilter').value);
        renderCharts();
        document.getElementById('claimModal').style.display = 'none';
        if (notificationEnabled) new Notification(`障碍物 #${id} 已处理完成`);
    };
    if (fileInput.files.length > 0) {
        const reader = new FileReader();
        reader.onload = (e) => process(e.target.result);
        reader.readAsDataURL(fileInput.files[0]);
    } else { process(null); }
}
async function changeStatus(id, newStatus) {
    const obs = obstacles.find(o => o.id == id);
    if (!obs) return;
    if (newStatus === '已完成' && !obs.resolved_photo) {
        showConfirm('尚未上传处理后照片，确定标记为已完成吗？', async () => {
            obs.status = newStatus;
            try { await updateObstacleOnServer(id, { status: newStatus }); } catch (err) { showNiceAlert('状态更新失败，请刷新重试', '❌'); await loadObstaclesFromServer(); }
            renderTable(document.getElementById('searchInput').value, document.getElementById('statusFilter').value);
            renderCharts();
        });
        return;
    }
    obs.status = newStatus;
    try { await updateObstacleOnServer(id, { status: newStatus }); } catch (err) { showNiceAlert('状态更新失败，请刷新重试', '❌'); await loadObstaclesFromServer(); }
    renderTable(document.getElementById('searchInput').value, document.getElementById('statusFilter').value);
    renderCharts();
}

// ========== 批量操作 ==========
async function applyBatchAction() {
    const action = document.getElementById('batchAction').value;
    if (!action || selectedIds.size === 0) { showNiceAlert('请选择障碍物并选择操作', '⚠️'); return; }
    const newStatus = action === 'processing' ? '处理中' : '已完成';
    for (const id of Array.from(selectedIds)) {
        const obs = obstacles.find(o => o.id === id);
        if (obs) obs.status = newStatus;
        try { await updateObstacleOnServer(id, { status: newStatus }); } catch (err) { console.error(err); }
    }
    selectedIds.clear();
    renderTable(document.getElementById('searchInput').value, document.getElementById('statusFilter').value);
    renderCharts();
}
function showPhoto(src) { document.getElementById('modalPhoto').src = src; document.getElementById('photoModal').style.display = 'flex'; }
function requestNotification() {
    if (!('Notification' in window)) { showNiceAlert('浏览器不支持通知', '⚠️'); return; }
    Notification.requestPermission().then(perm => { if (perm === 'granted') { notificationEnabled = true; showNiceAlert('通知已开启，新上报将提醒您', '🔔'); } });
}
async function exportPDF() {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const statsEl = document.querySelector('.stats-cards');
    const chartsEl = document.querySelector('.charts-container');
    const heatEl = document.getElementById('heatmapContainer');
    const canvas1 = await html2canvas(statsEl);
    const canvas2 = await html2canvas(chartsEl);
    const canvas3 = await html2canvas(heatEl);
    pdf.setFontSize(16);
    pdf.text('无障碍出行社区周报', 10, 20);
    pdf.addImage(canvas1.toDataURL(), 'PNG', 10, 30, 190, 40);
    pdf.addImage(canvas2.toDataURL(), 'PNG', 10, 80, 190, 80);
    pdf.addPage();
    pdf.addImage(canvas3.toDataURL(), 'PNG', 10, 20, 190, 80);
    pdf.setFontSize(12);
    pdf.text(`总上报: ${obstacles.length}  待处理: ${obstacles.filter(o=>o.status==='未处理').length}  已完成: ${obstacles.filter(o=>o.status==='已完成').length}`, 10, 110);
    pdf.save(`无障碍周报_${new Date().toISOString().slice(0,10)}.pdf`);
}

// ========== Tab 切换（修复热力图） ==========
function initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            tabs.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tabId = btn.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
            const activeTab = document.getElementById(`${tabId}Tab`);
            if (activeTab) activeTab.classList.remove('hidden');
            if (tabId === 'poi') { loadPoiList(); loadFacilityStatus(); }
            else if (tabId === 'sos') loadSosRecords();
            else if (tabId === 'obstacles') {
                // 切换到障碍物 tab 时，重新初始化热力图（解决容器不可见问题）
                setTimeout(() => initHeatmap(), 100);
            }
        });
    });
}

// ========== SOS 记录 ==========
async function loadSosRecords() {
    try {
        const res = await fetch(`${API_BASE}/sos`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        renderSosTable(data);
    } catch (err) {
        console.error('加载 SOS 记录失败', err);
        showNiceAlert('加载 SOS 记录失败：请检查后端服务', '❌');
        showTableError('sosTableContainer', '无法加载 SOS 记录，请检查后端');
    }
}
function renderSosTable(records) {
    const container = document.getElementById('sosTableContainer');
    if (!container) return;
    if (!records || records.length === 0) {
        container.innerHTML = '<div style="padding:40px;text-align:center;color:#999;">暂无 SOS 求助记录</div>';
        return;
    }
    let html = `<table><thead><tr><th>ID</th><th>用户</th><th>位置</th><th>地址</th><th>留言</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>`;
    records.forEach(rec => {
        html += `<tr>
            <td>${rec.id}</td>
            <td>${rec.username || '匿名'}</td>
            <td>${rec.lat.toFixed(4)}, ${rec.lng.toFixed(4)}</td>
            <td>${rec.address ? (rec.address.length>20? rec.address.substr(0,20)+'…':rec.address) : '-'}</td>
            <td>${rec.message ? (rec.message.length>10? rec.message.substr(0,10)+'…':rec.message) : '-'}</td>
            <td><select class="sos-status" data-id="${rec.id}"><option value="待处理" ${rec.status==='待处理'?'selected':''}>待处理</option><option value="已处理" ${rec.status==='已处理'?'selected':''}>已处理</option></select></td>
            <td>${new Date(rec.created_at).toLocaleString()}</td>
            <td><button class="update-sos-status" data-id="${rec.id}">💾 更新</button> <button class="view-sos-detail" data-id="${rec.id}" data-address="${rec.address||''}" data-message="${rec.message||''}" data-username="${rec.username||'匿名'}" data-time="${rec.created_at}">🔍 详情</button></td>
        </tr>`;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
    document.querySelectorAll('.update-sos-status').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const select = document.querySelector(`.sos-status[data-id="${id}"]`);
            if (!select) return;
            const newStatus = select.value;
            try {
                const res = await fetch(`${API_BASE}/sos/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                    body: JSON.stringify({ status: newStatus })
                });
                if (res.ok) { showNiceAlert('状态更新成功', '✅'); loadSosRecords(); }
                else { const err = await res.json(); showNiceAlert('更新失败：'+err.error, '❌'); }
            } catch (err) { showNiceAlert('网络错误', '❌'); }
        });
    });
    document.querySelectorAll('.view-sos-detail').forEach(btn => {
        btn.addEventListener('click', () => {
            showNiceAlert(`用户：${btn.dataset.username}\n时间：${new Date(btn.dataset.time).toLocaleString()}\n地址：${btn.dataset.address||'无'}\n留言：${btn.dataset.message||'无'}`, '📋');
        });
    });
}

// ========== 页面初始化 ==========
window.onload = async () => {
    await loadObstaclesFromServer();
    // 仅在障碍物 tab 可见时初始化热力图
    const obstaclesTab = document.getElementById('obstaclesTab');
    if (obstaclesTab && !obstaclesTab.classList.contains('hidden')) {
        initHeatmap();
    }
    renderTable();
    renderCharts();
    initTabs();

    // 刷新按钮
    document.getElementById('refreshBtn')?.addEventListener('click', async () => {
        await loadObstaclesFromServer();
        renderTable(document.getElementById('searchInput').value, document.getElementById('statusFilter').value);
        renderCharts();
    });
    document.getElementById('refreshPoiBtn')?.addEventListener('click', async () => {
        await loadPoiList();
        await loadFacilityStatus();
        renderPoiTable();
    });
    document.getElementById('refreshSosBtn')?.addEventListener('click', loadSosRecords);

    // 搜索与筛选
    document.getElementById('searchInput')?.addEventListener('input', (e) => renderTable(e.target.value, document.getElementById('statusFilter').value));
    document.getElementById('statusFilter')?.addEventListener('change', (e) => renderTable(document.getElementById('searchInput').value, e.target.value));
    document.getElementById('applyBatchBtn')?.addEventListener('click', applyBatchAction);
    document.getElementById('exportReportBtn')?.addEventListener('click', exportPDF);
    document.getElementById('requestNotifyBtn')?.addEventListener('click', requestNotification);
    document.getElementById('logoutBtn')?.addEventListener('click', logout);

    // 模态框关闭
    document.getElementById('closePhotoModal')?.addEventListener('click', () => document.getElementById('photoModal').style.display = 'none');
    document.getElementById('closeClaimModal')?.addEventListener('click', () => document.getElementById('claimModal').style.display = 'none');
    document.getElementById('confirmClaimBtn')?.addEventListener('click', confirmClaim);
    document.getElementById('confirmResolveBtn')?.addEventListener('click', confirmResolve);
    document.getElementById('resolvedPhotoInput')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => { document.getElementById('resolvedPreview').src = ev.target.result; document.getElementById('resolvedPreview').style.display = 'block'; };
            reader.readAsDataURL(file);
        }
    });
    document.getElementById('closeFacilityModal')?.addEventListener('click', () => document.getElementById('facilityEditModal').style.display = 'none');
    document.getElementById('cancelFacilityBtn')?.addEventListener('click', () => document.getElementById('facilityEditModal').style.display = 'none');
    document.getElementById('saveFacilityBtn')?.addEventListener('click', async () => {
        const poiName = document.getElementById('editPoiName').value;
        const updates = {
            elevator: document.getElementById('editElevator').value,
            ramp: document.getElementById('editRamp').value,
            tactilePaving: document.getElementById('editTactilePaving').value,
            stairs: document.getElementById('editStairs').value
        };
        await updatePoiFacility(poiName, updates);
        document.getElementById('facilityEditModal').style.display = 'none';
    });
    document.getElementById('addPoiBtn')?.addEventListener('click', showAddPoiModal);
    document.getElementById('closeAddPoiModal')?.addEventListener('click', () => document.getElementById('addPoiModal').style.display = 'none');
    document.getElementById('cancelAddPoiBtn')?.addEventListener('click', () => document.getElementById('addPoiModal').style.display = 'none');
    document.getElementById('addPoiForm')?.addEventListener('submit', (e) => { e.preventDefault(); submitAddPoi(); });
    // 评分滑块显示
    document.getElementById('poiScore')?.addEventListener('input', (e) => { document.getElementById('scoreValue').innerText = e.target.value; });

    document.getElementById('addAdminBtn')?.addEventListener('click', () => document.getElementById('addAdminModal').style.display = 'flex');
    document.getElementById('closeAddAdminModal')?.addEventListener('click', () => document.getElementById('addAdminModal').style.display = 'none');
    document.getElementById('cancelAddAdminBtn')?.addEventListener('click', () => document.getElementById('addAdminModal').style.display = 'none');
    document.getElementById('addAdminForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('newAdminUsername').value.trim();
        const password = document.getElementById('newAdminPassword').value;
        const nickname = document.getElementById('newAdminNickname').value.trim();
        try {
            const res = await fetch(`${API_BASE}/auth/admin/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ username, password, nickname })
            });
            const data = await res.json();
            if (res.ok) {
                showNiceAlert(`管理员 ${username} 注册成功！`, '✅');
                document.getElementById('addAdminModal').style.display = 'none';
                document.getElementById('addAdminForm').reset();
            } else {
                showNiceAlert('注册失败：' + (data.error || '未知错误'), '❌');
            }
        } catch (err) { showNiceAlert('网络错误，请稍后重试', '❌'); }
    });

    window.onclick = (e) => { if (e.target.classList.contains('modal')) e.target.style.display = 'none'; };
    window.openClaimModal = openClaimModal;
    window.openResolveModal = openResolveModal;
    window.changeStatus = changeStatus;
    window.showPhoto = showPhoto;
    window.openFacilityEditModal = openFacilityEditModal;
    window.deletePoi = deletePoi;

    setInterval(async () => { await loadObstaclesFromServer(); }, 30000);
};