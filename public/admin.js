const API_BASE = 'http://localhost:3000/api';

// ========== 全局变量 ==========
let obstacles = [];
let poiList = [];
let facilityStatus = {};
let heatmapLayer = null;
let heatmapMap = null;
let selectedIds = new Set();
let notificationEnabled = false;

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
    // 显示管理员名称
    document.getElementById('adminNameDisplay').innerText = `👤 ${user.username}`;
    return true;
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}

// ========== 初始化检查 ==========
if (!checkAdminAuth()) {
    throw new Error('未授权访问');
}

// ========== 障碍物数据操作 ==========
async function loadObstaclesFromServer() {
    try {
        const res = await fetch(`${API_BASE}/obstacles`, {
            headers: getAuthHeaders()
        });
        const data = await res.json();
        obstacles = data;
        renderTable(document.getElementById('searchInput').value, document.getElementById('statusFilter').value);
        renderCharts();
        updateHeatmapLayer();
        updateStats();
    } catch (err) {
        console.error('加载障碍物失败:', err);
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
        console.error('更新障碍物失败:', err);
    }
}

// ========== POI 数据操作 ==========
async function loadPoiList() {
    try {
        const res = await fetch(`${API_BASE}/poi`);
        const data = await res.json();
        poiList = data;
        renderPoiTable();
    } catch (err) {
        console.error('加载 POI 失败', err);
    }
}

async function loadFacilityStatus() {
    try {
        const res = await fetch(`${API_BASE}/poi/facility-status`);
        const data = await res.json();
        facilityStatus = data;
    } catch (err) {
        console.error('加载设施状态失败', err);
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
            alert('更新成功');
            await loadFacilityStatus();
            renderPoiTable();
        } else {
            const err = await res.json();
            alert('更新失败：' + err.error);
        }
    } catch (err) {
        alert('网络错误');
    }
}

async function deletePoi(id) {
    if (!confirm('确定删除该 POI？')) return;
    try {
        const res = await fetch(`${API_BASE}/poi/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (res.ok) {
            alert('删除成功');
            loadPoiList();
        } else {
            alert('删除失败');
        }
    } catch (err) {
        alert('网络错误');
    }
}

async function addPoi() {
    const name = prompt('POI 名称');
    if (!name) return;
    const lat = parseFloat(prompt('纬度'));
    const lng = parseFloat(prompt('经度'));
    if (isNaN(lat) || isNaN(lng)) { alert('坐标无效'); return; }
    const type = prompt('类型（教学楼/食堂/宿舍等）', '其他');
    const score = parseFloat(prompt('评分(0-5)', '3.0'));

    try {
        const res = await fetch(`${API_BASE}/poi`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ name, lat, lng, type, score })
        });
        if (res.ok) {
            alert('添加成功');
            loadPoiList();
        } else {
            alert('添加失败');
        }
    } catch (err) {
        alert('网络错误');
    }
}

function renderPoiTable() {
    const container = document.getElementById('poiTableContainer');
    let html = '<table><tr><th>ID</th><th>名称</th><th>类型</th><th>评分</th><th>电梯</th><th>坡道</th><th>盲道</th><th>台阶</th><th>操作</th></tr>';
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

// 打开设施状态编辑模态框
function openFacilityEditModal(poiName) {
    const status = facilityStatus[poiName] || { elevator: '无', ramp: '无', tactilePaving: '无', stairs: '无台阶' };
    document.getElementById('editPoiName').value = poiName;
    document.getElementById('editElevator').value = status.elevator;
    document.getElementById('editRamp').value = status.ramp;
    document.getElementById('editTactilePaving').value = status.tactilePaving;
    document.getElementById('editStairs').value = status.stairs;
    document.getElementById('facilityEditModal').style.display = 'flex';
}

// ========== 热力图 ==========
function initHeatmap() {
    const container = document.getElementById('heatmapContainer');
    if (!container) return;
    heatmapMap = L.map('heatmapContainer').setView([26.879, 112.516], 15);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(heatmapMap);
    updateHeatmapLayer();
}

function updateHeatmapLayer() {
    if (!heatmapMap) return;
    if (heatmapLayer) heatmapMap.removeLayer(heatmapLayer);
    const points = obstacles.map(obs => [obs.lat, obs.lng, 1.0]);
    heatmapLayer = L.heatLayer(points, { radius: 25, blur: 15, maxZoom: 17 }).addTo(heatmapMap);
}

// ========== 障碍物表格渲染 ==========
function renderTable(filterText = '', statusFilter = 'all') {
    const container = document.getElementById('obstacleTable');
    let filtered = obstacles.filter(obs => {
        const matchText = !filterText || obs.type.includes(filterText) || (obs.description && obs.description.includes(filterText));
        const matchStatus = statusFilter === 'all' || obs.status === statusFilter;
        return matchText && matchStatus;
    });

    let html = '<table><tr><th><input type="checkbox" id="selectAll"></th><th>ID</th><th>位置</th><th>类型</th><th>描述</th><th>状态</th><th>志愿者</th><th>上报时间</th><th>照片</th><th>操作</th></tr>';
    filtered.forEach(obs => {
        const checked = selectedIds.has(obs.id) ? 'checked' : '';
        html += `<tr>
            <td><input type="checkbox" class="row-checkbox" value="${obs.id}" ${checked}></td>
            <td>${obs.id}</td>
            <td>${obs.lat.toFixed(4)}, ${obs.lng.toFixed(4)}</td>
            <td>${obs.type}</td>
            <td>${obs.description || '-'}</td>
            <td><span class="status-badge status-${obs.status}">${obs.status}</span></td>
            <td>${obs.claimed_by || '—'}</td>
            <td>${obs.report_time || ''}</td>
            <td>
                ${obs.photo ? `<img src="${obs.photo}" class="photo-thumb" onclick="showPhoto('${obs.photo}')">` : '无'}
                ${obs.resolved_photo ? `<img src="${obs.resolved_photo}" class="photo-thumb" onclick="showPhoto('${obs.resolved_photo}')" title="处理后">` : ''}
            </td>
            <td>
                ${obs.status === '未处理' ? `<button onclick="openClaimModal(${obs.id})">🤝 认领</button>` : ''}
                ${obs.status === '处理中' && obs.claimed_by ? `<button onclick="openResolveModal(${obs.id})">✅ 上传完成</button>` : ''}
                <button onclick="changeStatus(${obs.id}, '${obs.status === '未处理' ? '处理中' : (obs.status === '处理中' ? '已完成' : '未处理')}')">✏️ 状态</button>
            </td>
        </tr>`;
    });
    html += '</table>';
    container.innerHTML = html;

    document.getElementById('selectAll')?.addEventListener('change', (e) => {
        const checked = e.target.checked;
        document.querySelectorAll('.row-checkbox').forEach(cb => {
            cb.checked = checked;
            const id = parseInt(cb.value);
            checked ? selectedIds.add(id) : selectedIds.delete(id);
        });
    });

    document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const id = parseInt(e.target.value);
            e.target.checked ? selectedIds.add(id) : selectedIds.delete(id);
        });
    });

    updateStats();
}

function updateStats() {
    const total = obstacles.length;
    const pending = obstacles.filter(o => o.status === '未处理').length;
    const processing = obstacles.filter(o => o.status === '处理中').length;
    const resolved = obstacles.filter(o => o.status === '已完成').length;
    document.getElementById('totalCount').innerText = total;
    document.getElementById('pendingCount').innerText = pending;
    document.getElementById('processingCount').innerText = processing;
    document.getElementById('resolvedCount').innerText = resolved;
}

// ========== 图表渲染 ==========
function renderCharts() {
    const typeCounts = {};
    obstacles.forEach(o => { typeCounts[o.type] = (typeCounts[o.type] || 0) + 1; });
    const typeChart = echarts.init(document.getElementById('typeChart'));
    typeChart.setOption({
        title: { text: '障碍物类型分布' },
        tooltip: {},
        series: [{
            type: 'pie',
            data: Object.entries(typeCounts).map(([name, value]) => ({ name, value }))
        }]
    });

    const days = [];
    const counts = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(5, 10);
        days.push(dateStr);
        counts.push(obstacles.filter(o => o.report_time === d.toISOString().slice(0, 10)).length);
    }
    const trendChart = echarts.init(document.getElementById('trendChartAdmin'));
    trendChart.setOption({
        title: { text: '近一周上报趋势' },
        xAxis: { type: 'category', data: days },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: counts }]
    });
}

// ========== 认领/完成模态框 ==========
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
    document.getElementById('volunteerName').value = obs.claimed_by || '';
    document.getElementById('claimActionSection').style.display = 'none';
    document.getElementById('resolveSection').style.display = 'block';
    document.getElementById('claimModal').style.display = 'flex';
}

async function confirmClaim() {
    const id = parseInt(document.getElementById('claimObstacleId').value);
    const name = document.getElementById('volunteerName').value.trim();
    if (!name) { alert('请输入志愿者姓名'); return; }
    const obs = obstacles.find(o => o.id === id);
    if (obs) {
        obs.status = '处理中';
        obs.claimed_by = name;
        obs.claim_time = new Date().toISOString().slice(0, 10);
        await updateObstacleOnServer(id, {
            status: '处理中',
            claimed_by: name,
            claim_time: obs.claim_time
        });
        renderTable(document.getElementById('searchInput').value, document.getElementById('statusFilter').value);
        renderCharts();
        document.getElementById('claimModal').style.display = 'none';
        if (notificationEnabled) {
            new Notification(`障碍物 #${id} 已被 ${name} 认领`);
        }
    }
}

async function confirmResolve() {
    const id = parseInt(document.getElementById('claimObstacleId').value);
    const obs = obstacles.find(o => o.id === id);
    const fileInput = document.getElementById('resolvedPhotoInput');

    const process = async (photoData) => {
        obs.status = '已完成';
        obs.resolved_photo = photoData || null;
        obs.resolved_time = new Date().toISOString().slice(0, 10);
        await updateObstacleOnServer(id, {
            status: '已完成',
            resolved_photo: photoData || null,
            resolved_time: obs.resolved_time
        });
        renderTable(document.getElementById('searchInput').value, document.getElementById('statusFilter').value);
        renderCharts();
        document.getElementById('claimModal').style.display = 'none';
        if (notificationEnabled) {
            new Notification(`障碍物 #${id} 已处理完成`);
        }
    };

    if (fileInput.files.length > 0) {
        const reader = new FileReader();
        reader.onload = (e) => process(e.target.result);
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        process(null);
    }
}

async function changeStatus(id, newStatus) {
    const obs = obstacles.find(o => o.id == id);
    if (obs) {
        if (newStatus === '已完成' && !obs.resolved_photo) {
            if (!confirm('尚未上传处理后照片，确定标记为已完成吗？')) return;
        }
        obs.status = newStatus;
        try {
            await updateObstacleOnServer(id, { status: newStatus });
        } catch (err) {
            alert('状态更新失败，请刷新重试');
            await loadObstaclesFromServer();
        }
        renderTable(document.getElementById('searchInput').value, document.getElementById('statusFilter').value);
        renderCharts();
    }
}

// ========== 批量操作 ==========
async function applyBatchAction() {
    const action = document.getElementById('batchAction').value;
    if (!action || selectedIds.size === 0) {
        alert('请选择障碍物并选择操作');
        return;
    }
    const newStatus = action === 'processing' ? '处理中' : '已完成';
    const idsToUpdate = Array.from(selectedIds);

    for (const id of idsToUpdate) {
        const obs = obstacles.find(o => o.id === id);
        if (obs) obs.status = newStatus;
        try {
            await updateObstacleOnServer(id, { status: newStatus });
        } catch (err) {
            console.error(`更新障碍物 ${id} 失败`, err);
        }
    }
    selectedIds.clear();
    renderTable(document.getElementById('searchInput').value, document.getElementById('statusFilter').value);
    renderCharts();
}

// ========== 照片查看 ==========
function showPhoto(src) {
    document.getElementById('modalPhoto').src = src;
    document.getElementById('photoModal').style.display = 'flex';
}

// ========== 通知权限 ==========
function requestNotification() {
    if (!('Notification' in window)) {
        alert('浏览器不支持通知');
        return;
    }
    Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
            notificationEnabled = true;
            alert('通知已开启，新上报将提醒您');
        }
    });
}

// ========== PDF导出 ==========
async function exportPDF() {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');

    const statsEl = document.querySelector('.stats-cards');
    const chartsEl = document.querySelector('.charts-container');
    const heatEl = document.getElementById('heatmapContainer');

    const canvas1 = await html2canvas(statsEl);
    const canvas2 = await html2canvas(chartsEl);
    const canvas3 = await html2canvas(heatEl);

    const img1 = canvas1.toDataURL('image/png');
    const img2 = canvas2.toDataURL('image/png');
    const img3 = canvas3.toDataURL('image/png');

    pdf.setFontSize(16);
    pdf.text('无障碍出行社区周报', 10, 20);
    pdf.addImage(img1, 'PNG', 10, 30, 190, 40);
    pdf.addImage(img2, 'PNG', 10, 80, 190, 80);
    pdf.addPage();
    pdf.addImage(img3, 'PNG', 10, 20, 190, 80);

    pdf.setFontSize(12);
    pdf.text(`总上报: ${obstacles.length}  待处理: ${obstacles.filter(o => o.status === '未处理').length}  已完成: ${obstacles.filter(o => o.status === '已完成').length}`, 10, 110);

    pdf.save(`无障碍周报_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ========== Tab 切换 ==========
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            document.getElementById('obstaclesTab').classList.toggle('hidden', tab !== 'obstacles');
            document.getElementById('poiTab').classList.toggle('hidden', tab !== 'poi');
            document.getElementById('sosTab').classList.toggle('hidden', tab !== 'sos');

            if (tab === 'poi') {
                loadPoiList();
                loadFacilityStatus();
            } else if (tab === 'sos') {
                loadSosRecords();
            }
        });
    });
}

// ========== SOS 记录加载 ==========
async function loadSosRecords() {
    try {
        const res = await fetch(`${API_BASE}/sos`, {
            headers: getAuthHeaders()
        });
        const data = await res.json();
        renderSosTable(data);
    } catch (err) {
        console.error('加载 SOS 记录失败', err);
    }
}

function renderSosTable(records) {
    const container = document.getElementById('sosTableContainer');
    if (!records || records.length === 0) {
        container.innerHTML = '<div style="padding:20px;text-align:center;">暂无 SOS 求助记录</div>';
        return;
    }

    let html = `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>用户</th>
                    <th>位置</th>
                    <th>地址</th>
                    <th>留言</th>
                    <th>状态</th>
                    <th>时间</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
    `;

    records.forEach(rec => {
        const shortAddress = rec.address ? (rec.address.length > 15 ? rec.address.substr(0, 15) + '…' : rec.address) : '-';
        const shortMessage = rec.message ? (rec.message.length > 10 ? rec.message.substr(0, 10) + '…' : rec.message) : '-';
        html += `<tr>
            <td>${rec.id}</td>
            <td>${rec.username || '匿名'}</td>
            <td>${rec.lat.toFixed(4)}, ${rec.lng.toFixed(4)}</td>
            <td title="${rec.address || ''}">${shortAddress}</td>
            <td title="${rec.message || ''}">${shortMessage}</td>
            <td>
                <select class="sos-status" data-id="${rec.id}">
                    <option value="待处理" ${rec.status === '待处理' ? 'selected' : ''}>待处理</option>
                    <option value="已处理" ${rec.status === '已处理' ? 'selected' : ''}>已处理</option>
                </select>
            </td>
            <td>${new Date(rec.created_at).toLocaleString()}</td>
            <td>
                <button class="update-sos-status" data-id="${rec.id}" style="margin-right:5px;">💾 更新</button>
                <button class="view-sos-detail" data-id="${rec.id}" data-address="${rec.address || ''}" data-message="${rec.message || ''}" data-username="${rec.username || '匿名'}" data-time="${rec.created_at}">🔍 详情</button>
            </td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    document.querySelectorAll('.update-sos-status').forEach(btn => {
        btn.addEventListener('click', async (e) => {
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
                if (res.ok) {
                    alert('状态更新成功');
                    loadSosRecords();
                } else {
                    const err = await res.json();
                    alert('更新失败：' + (err.error || '未知错误'));
                }
            } catch (err) {
                alert('网络错误，请稍后重试');
            }
        });
    });

    document.querySelectorAll('.view-sos-detail').forEach(btn => {
        btn.addEventListener('click', () => {
            const username = btn.dataset.username;
            const time = new Date(btn.dataset.time).toLocaleString();
            const address = btn.dataset.address || '无';
            const message = btn.dataset.message || '无';
            alert(`用户：${username}\n时间：${time}\n地址：${address}\n留言：${message}`);
        });
    });
}

// ========== 页面初始化 ==========
window.onload = async () => {
    // 加载数据
    await loadObstaclesFromServer();
    initHeatmap();
    renderTable();
    renderCharts();
    initTabs();

    // 绑定事件
    document.getElementById('refreshSosBtn').addEventListener('click', () => {
        loadSosRecords();
    });

    document.getElementById('refreshBtn').addEventListener('click', async () => {
        await loadObstaclesFromServer();
        renderTable(document.getElementById('searchInput').value, document.getElementById('statusFilter').value);
        renderCharts();
    });

    document.getElementById('searchInput').addEventListener('input', (e) => {
        renderTable(e.target.value, document.getElementById('statusFilter').value);
    });

    document.getElementById('statusFilter').addEventListener('change', (e) => {
        renderTable(document.getElementById('searchInput').value, e.target.value);
    });

    document.getElementById('applyBatchBtn').addEventListener('click', applyBatchAction);
    document.getElementById('exportReportBtn').addEventListener('click', exportPDF);
    document.getElementById('requestNotifyBtn').addEventListener('click', requestNotification);
    document.getElementById('logoutBtn').addEventListener('click', logout);

    document.getElementById('closePhotoModal').addEventListener('click', () => {
        document.getElementById('photoModal').style.display = 'none';
    });

    document.getElementById('closeClaimModal').addEventListener('click', () => {
        document.getElementById('claimModal').style.display = 'none';
    });

    document.getElementById('confirmClaimBtn').addEventListener('click', confirmClaim);
    document.getElementById('confirmResolveBtn').addEventListener('click', confirmResolve);

    document.getElementById('resolvedPhotoInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                document.getElementById('resolvedPreview').src = ev.target.result;
                document.getElementById('resolvedPreview').style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });

    // 设施状态编辑模态框
    document.getElementById('closeFacilityModal').addEventListener('click', () => {
        document.getElementById('facilityEditModal').style.display = 'none';
    });
    document.getElementById('saveFacilityBtn').addEventListener('click', async () => {
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

    // POI 管理按钮
    document.getElementById('addPoiBtn').addEventListener('click', addPoi);
    document.getElementById('refreshPoiBtn').addEventListener('click', async () => {
        await loadPoiList();
        await loadFacilityStatus();
        renderPoiTable();
    });

    // ========== 新增管理员功能 ==========
    document.getElementById('addAdminBtn').addEventListener('click', () => {
        document.getElementById('addAdminModal').style.display = 'flex';
    });

    document.getElementById('closeAddAdminModal').addEventListener('click', () => {
        document.getElementById('addAdminModal').style.display = 'none';
    });

    document.getElementById('addAdminForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('newAdminUsername').value.trim();
        const password = document.getElementById('newAdminPassword').value;
        const nickname = document.getElementById('newAdminNickname').value.trim();

        try {
            const res = await fetch(`${API_BASE}/auth/admin/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                },
                body: JSON.stringify({ username, password, nickname })
            });
            const data = await res.json();
            if (res.ok) {
                alert(`管理员 ${username} 注册成功！`);
                document.getElementById('addAdminModal').style.display = 'none';
                document.getElementById('addAdminForm').reset();
            } else {
                alert('注册失败：' + (data.error || '未知错误'));
            }
        } catch (err) {
            alert('网络错误，请稍后重试');
        }
    });

    // 点击模态框背景关闭
    window.onclick = (e) => {
        if (e.target.classList.contains('modal')) e.target.style.display = 'none';
    };

    // 暴露全局函数供 HTML 调用
    window.openClaimModal = openClaimModal;
    window.openResolveModal = openResolveModal;
    window.changeStatus = changeStatus;
    window.showPhoto = showPhoto;
    window.openFacilityEditModal = openFacilityEditModal;
    window.deletePoi = deletePoi;

    // 定时刷新障碍物数据
    setInterval(async () => {
        await loadObstaclesFromServer();
    }, 30000);
};