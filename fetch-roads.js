// fetch-roads.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// ========== 配置区域 ==========
const AMAP_KEY = '2c5385f0963e09c03c60546742d12f0c';  // 你的高德 Key
const DB_PATH = path.join(__dirname, 'routes', 'data.db');

// 采样点列表（南华大学雨母校区主要地点）
// 这些点的作用是让高德规划它们之间的路线，从而采集到道路坐标
const samplePoints = [
    { name: '西门', lng: 112.516666, lat: 26.875201 },
    { name: '图书馆', lng: 112.515740, lat: 26.879809 },
    { name: '三省园食堂', lng: 112.512818, lat: 26.882371 },
    { name: '笃行园食堂', lng: 112.519076, lat: 26.881296 },
    { name: '第一教学楼', lng: 112.516955, lat: 26.877074 },
    { name: '雨母楼', lng: 112.516328, lat: 26.878689 },
    { name: '田径场', lng: 112.519811, lat: 26.883302 },
    { name: '东门', lng: 112.520827, lat: 26.882019 },
    { name: '南门', lng: 112.516666, lat: 26.875201 },   // 与西门坐标接近，可根据实际调整
    { name: '计算机学院', lng: 112.513861, lat: 26.881274 },
    { name: '机械学院', lng: 112.513663, lat: 26.881677 },
    { name: '崇业楼', lng: 112.513264, lat: 26.881653 },
];

// ========== 以下代码无需修改 ==========

// 生成所有不重复的点对
function generatePairs(points) {
    const pairs = [];
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            pairs.push({ start: points[i], end: points[j] });
        }
    }
    return pairs;
}

// 调用高德步行规划 API
async function fetchWalkingRoute(start, end) {
    const origin = `${start.lng},${start.lat}`;
    const destination = `${end.lng},${end.lat}`;
    const url = `https://restapi.amap.com/v3/direction/walking?origin=${origin}&destination=${destination}&key=${AMAP_KEY}`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.status === '1' && data.route.paths && data.route.paths.length > 0) {
            return data.route.paths[0];
        }
        console.log(`  ⚠️ 无路线: ${start.name} -> ${end.name}`);
        return null;
    } catch (err) {
        console.error(`  ❌ 请求失败: ${start.name} -> ${end.name}`, err.message);
        return null;
    }
}

// 将路线拆分为路段并插入数据库（自动去重，基于起点终点坐标）
function insertSegmentsFromRoute(db, route) {
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO road_segments 
        (start_lng, start_lat, end_lng, end_lat, segment_type, wheelchair_passable, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    let count = 0;
    
    route.steps.forEach(step => {
        const polyline = step.polyline;
        if (!polyline) return;
        
        // 高德返回的 polyline 格式：lng1,lat1;lng2,lat2;...
        const points = polyline.split(';').map(p => {
            const [lng, lat] = p.split(',').map(Number);
            return { lng, lat };
        });
        
        // 将每个步骤拆分为相邻点对，作为一条路段
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i+1];
            
            // 默认全部标记为“道路”且轮椅可通行，后续需要手动修正台阶、坡道
            stmt.run(p1.lng, p1.lat, p2.lng, p2.lat, '道路', '是', '');
            count++;
        }
    });
    
    stmt.finalize();
    return count;
}

// 主函数
async function main() {
    console.log('🚀 开始采集校园路网数据...\n');
    
    const db = new sqlite3.Database(DB_PATH);
    
    // 可选：清空旧道路数据（慎重，如果之前有手动录入的数据请先备份）
    db.run('DELETE FROM road_segments', (err) => {
        if (err) {
            console.error('❌ 清空旧数据失败:', err.message);
        } else {
            console.log('✅ 已清空旧道路数据');
        }
    });
    
    const pairs = generatePairs(samplePoints);
    console.log(`📌 共生成 ${pairs.length} 对起终点，开始请求高德API...\n`);
    
    let totalSegments = 0;
    let successCount = 0;
    
    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        const startName = pair.start.name;
        const endName = pair.end.name;
        
        process.stdout.write(`[${i+1}/${pairs.length}] ${startName} → ${endName} ... `);
        
        const route = await fetchWalkingRoute(pair.start, pair.end);
        if (route) {
            const segCount = insertSegmentsFromRoute(db, route);
            totalSegments += segCount;
            successCount++;
            console.log(`✅ 采集 ${segCount} 段`);
        } else {
            console.log(`⏭️ 跳过`);
        }
        
        // 避免请求过快，高德 API 有 QPS 限制
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    
    console.log(`\n🎉 采集完成！`);
    console.log(`   成功路线: ${successCount}/${pairs.length}`);
    console.log(`   共插入路段: ${totalSegments} 条`);
    
    // 统计一下当前数据库中的路段数量
    db.get('SELECT COUNT(*) AS count FROM road_segments', (err, row) => {
        if (!err) {
            console.log(`   数据库现有路段总数: ${row.count}`);
        }
        db.close();
        console.log('\n💡 提示：默认所有路段标记为“道路、轮椅可通行”，');
        console.log('   请根据实际情况手动修正台阶、坡道等特殊路段。');
    });
}

main().catch(console.error);