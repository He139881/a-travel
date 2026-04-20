const API_BASE = 'http://localhost:3000/api';
// 全局变量
let heatmapLayer = null;
let heatmapMap = null;
let selectedIds = new Set(); // 批量选择



async function loadObstaclesFromServer() {
    const res = await fetch(`${API_BASE}/obstacles`);
    const data = await res.json();
    obstacles = data;
    renderTable(document.getElementById('searchInput').value, document.getElementById('statusFilter').value);
    renderCharts();
}

async function updateObstacleOnServer(id, updates) {
    await fetch(`${API_BASE}/obstacles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    });
}

// 初始化热力图
function initHeatmap() {
    const container = document.getElementById('heatmapContainer');
    if (!container) return;
    heatmapMap = L.map('heatmapContainer').setView([31.2304, 121.4737], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(heatmapMap);
    updateHeatmapLayer();
}

function updateHeatmapLayer() {
    if (!heatmapMap) return;
    if (heatmapLayer) heatmapMap.removeLayer(heatmapLayer);
    const points = obstacles.map(obs => [obs.lat, obs.lng, 1.0]); // 权重可基于状态或时间，暂用1
    heatmapLayer = L.heatLayer(points, { radius: 25, blur: 15, maxZoom: 17 }).addTo(heatmapMap);
}

// 渲染表格（增加复选框、认领按钮、完成上传）
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
            <td>${obs.claimedBy || '—'}</td>
            <td>${obs.reportTime}</td>
            <td>
                ${obs.photo ? `<img src="${obs.photo}" class="photo-thumb" onclick="showPhoto('${obs.photo}')">` : '无'}
                ${obs.resolvedPhoto ? `<img src="${obs.resolvedPhoto}" class="photo-thumb" onclick="showPhoto('${obs.resolvedPhoto}')" title="处理后">` : ''}
            </td>
            <td>
                ${obs.status === '未处理' ? `<button onclick="openClaimModal(${obs.id})">🤝 认领</button>` : ''}
                ${obs.status === '处理中' && obs.claimedBy ? `<button onclick="openResolveModal(${obs.id})">✅ 上传完成</button>` : ''}
                <button onclick="changeStatus(${obs.id}, '${obs.status === '未处理' ? '处理中' : (obs.status === '处理中' ? '已完成' : '未处理')}')">✏️ 状态</button>
            </td>
        </tr>`;
    });
    html += '</table>';
    container.innerHTML = html;

    // 绑定全选
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
    updateHeatmapLayer();
}

// 更新统计卡片
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

// 图表渲染（保持原有）
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
        const dateStr = d.toISOString().slice(5,10);
        days.push(dateStr);
        counts.push(obstacles.filter(o => o.reportTime === d.toISOString().slice(0,10)).length);
    }
    const trendChart = echarts.init(document.getElementById('trendChartAdmin'));
    trendChart.setOption({
        title: { text: '近一周上报趋势' },
        xAxis: { type: 'category', data: days },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: counts }]
    });
}

// 打开认领模态框
function openClaimModal(id) {
    document.getElementById('claimObstacleId').value = id;
    document.getElementById('claimActionSection').style.display = 'block';
    document.getElementById('resolveSection').style.display = 'none';
    document.getElementById('volunteerName').value = '';
    document.getElementById('claimModal').style.display = 'flex';
}

// 打开完成上传模态框
function openResolveModal(id) {
    const obs = obstacles.find(o => o.id === id);
    document.getElementById('claimObstacleId').value = id;
    document.getElementById('volunteerName').value = obs.claimedBy || '';
    document.getElementById('claimActionSection').style.display = 'none';
    document.getElementById('resolveSection').style.display = 'block';
    document.getElementById('claimModal').style.display = 'flex';
}

// 确认认领
async function confirmClaim() {
    const id = parseInt(document.getElementById('claimObstacleId').value);
    const name = document.getElementById('volunteerName').value.trim();
    if (!name) { alert('请输入志愿者姓名'); return; }
    const obs = obstacles.find(o => o.id === id);
    if (obs) {
        obs.status = '处理中';
        obs.claimedBy = name;
        obs.claimTime = new Date().toISOString().slice(0,10);
        await updateObstacleOnServer(id, {
            status: '处理中',
            claimed_by: name,
            claim_time: obs.claimTime
        });
        renderTable(document.getElementById('searchInput').value, document.getElementById('statusFilter').value);
        renderCharts();
        document.getElementById('claimModal').style.display = 'none';
        if (notificationEnabled) {
            new Notification(`障碍物 #${id} 已被 ${name} 认领`);
        }
    }
}

// 确认完成（上传处理后照片）
async function confirmResolve() {
    const id = parseInt(document.getElementById('claimObstacleId').value);
    const obs = obstacles.find(o => o.id === id);
    const fileInput = document.getElementById('resolvedPhotoInput');
    
    const process = async (photoData) => {
        obs.status = '已完成';
        obs.resolvedPhoto = photoData || null;
        obs.resolvedTime = new Date().toISOString().slice(0,10);
        await updateObstacleOnServer(id, {
            status: '已完成',
            resolved_photo: photoData || null,
            resolved_time: obs.resolvedTime
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

// 单条状态变更（兼容旧接口）
// 单条状态变更（调用后端 API）
async function changeStatus(id, newStatus) {
    const obs = obstacles.find(o => o.id == id);
    if (obs) {
        if (newStatus === '已完成' && !obs.resolvedPhoto) {
            if (!confirm('尚未上传处理后照片，确定标记为已完成吗？')) return;
        }
        // 先更新本地数组（乐观更新）
        obs.status = newStatus;
        
        // 调用后端 API 更新
        try {
            const res = await fetch(`${API_BASE}/obstacles/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            if (!res.ok) {
                alert('状态更新失败，请刷新重试');
                // 回滚本地状态（可选）
                await loadObstaclesFromServer();
            }
        } catch (err) {
            console.error('更新状态出错:', err);
            alert('网络错误，状态未同步');
        }
        
        // 刷新表格和图表
        renderTable(document.getElementById('searchInput').value, document.getElementById('statusFilter').value);
        renderCharts();
    }
}

// 批量应用操作
// 批量应用操作（调用后端 API）
async function applyBatchAction() {
    const action = document.getElementById('batchAction').value;
    if (!action || selectedIds.size === 0) {
        alert('请选择障碍物并选择操作');
        return;
    }
    const newStatus = action === 'processing' ? '处理中' : '已完成';
    
    // 批量更新本地数组
    const idsToUpdate = Array.from(selectedIds);
    idsToUpdate.forEach(id => {
        const obs = obstacles.find(o => o.id === id);
        if (obs) obs.status = newStatus;
    });
    
    // 并发调用 API 更新每一条（可优化为单次批量请求，但为简单起见用循环）
    let successCount = 0;
    for (const id of idsToUpdate) {
        try {
            const res = await fetch(`${API_BASE}/obstacles/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) successCount++;
        } catch (err) {
            console.error(`更新障碍物 ${id} 失败`, err);
        }
    }
    
    if (successCount < idsToUpdate.length) {
        alert(`批量更新完成：${successCount}/${idsToUpdate.length} 条成功，请刷新检查。`);
        // 重新从服务器加载以确保数据一致
        await loadObstaclesFromServer();
    }
    
    selectedIds.clear();
    renderTable(document.getElementById('searchInput').value, document.getElementById('statusFilter').value);
    renderCharts();
}

// 显示照片
function showPhoto(src) {
    document.getElementById('modalPhoto').src = src;
    document.getElementById('photoModal').style.display = 'flex';
}

// 请求通知权限
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

// 监听新上报（模拟，实际在用户端上报时会调用。这里在admin加载时检查localStorage变化？简单起见，在admin轮询？不用，可在用户端上报时通过storage事件）
// 但跨页面通讯可用storage事件
window.addEventListener('storage', (e) => {
    if (e.key === 'obstacles') {
        loadObstacles();
        renderTable(document.getElementById('searchInput').value, document.getElementById('statusFilter').value);
        renderCharts();
        if (notificationEnabled) {
            new Notification('有新的障碍物上报，请及时查看');
        }
    }
});

// PDF导出（截图方式）
async function exportPDF() {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    // 截图统计卡片区域
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
    
    // 添加表格摘要
    pdf.setFontSize(12);
    pdf.text(`总上报: ${obstacles.length}  待处理: ${obstacles.filter(o=>o.status==='未处理').length}  已完成: ${obstacles.filter(o=>o.status==='已完成').length}`, 10, 110);
    
    pdf.save(`无障碍周报_${new Date().toISOString().slice(0,10)}.pdf`);
}

// 页面初始化
window.onload = async () => {
    // 1. 从服务器加载障碍物数据
    await loadObstaclesFromServer();

    // 2. 初始化地图（如果 admin.html 中包含地图，注意 initMap 是定义在 app.js 中的，需要确保 admin.html 也引入了 app.js 或单独定义）
    // 由于 admin.js 可能没有 initMap，如果 admin 页面没有主地图，可忽略此行。
    if (typeof initMap === 'function') {
        initMap();
        // 等待地图完全初始化后添加 POI 和障碍物标记
        setTimeout(() => {
            if (typeof addPoiMarkers === 'function') addPoiMarkers();
            if (typeof updateObstacleMarkers === 'function') updateObstacleMarkers();
            if (typeof renderFacilityPanel === 'function') renderFacilityPanel();
        }, 100);
    }

    // 3. 初始化热力图（需要 obstacles 数据）
    initHeatmap();

    // 4. 渲染表格和图表
    renderTable();
    renderCharts();

    // 5. 绑定 UI 事件
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

    document.getElementById('closePhotoModal').addEventListener('click', () => {
        document.getElementById('photoModal').style.display = 'none';
    });

    document.getElementById('closeClaimModal').addEventListener('click', () => {
        document.getElementById('claimModal').style.display = 'none';
    });

    // 认领模态框内的按钮
    document.getElementById('confirmClaimBtn').addEventListener('click', confirmClaim);
    document.getElementById('confirmResolveBtn').addEventListener('click', confirmResolve);

    // 处理完成照片预览
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

    // 点击模态框背景关闭
    window.onclick = (e) => {
        if (e.target.classList.contains('modal')) e.target.style.display = 'none';
    };

    // 暴露全局函数供 HTML 调用（确保这些函数已在全局）
    window.openClaimModal = openClaimModal;
    window.openResolveModal = openResolveModal;
    window.changeStatus = changeStatus;
    window.showPhoto = showPhoto;

    // 6. 启动定时轮询，每隔 10 秒从服务器拉取最新障碍物数据
    setInterval(async () => {
        await loadObstaclesFromServer();
    }, 10000);
};