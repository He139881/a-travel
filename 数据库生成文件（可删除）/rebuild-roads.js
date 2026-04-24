// rebuild-roads.js
// 1. 清空 road_segments
// 2. 从 poi 表读取所有 POI 坐标，两两之间请求高德步行路线，拆分为路段写入
// 3. 插入已知的障碍路段（台阶、陡坡等）

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const AMAP_KEY = '2c5385f0963e09c03c60546742d12f0c';  // 你已有的高德 Key
const DB_PATH = path.join(__dirname, 'routes', 'data.db');

const db = new sqlite3.Database(DB_PATH);

// ========== 已知的红色障碍路段（手动采集或从原有 import-roads.js 中保留） ==========
const obstacleSegments = [
    // 格式：[start_lng, start_lat, end_lng, end_lat, segment_type, wheelchair_passable, notes]
    // 以下数据来自你项目中原有的 import-roads.js / mark-obstacles.js，代表真实的台阶、陡坡等不可通行路段
    [112.513533, 26.882874, 112.513558, 26.883090, '台阶', '否', ''],
    [112.517769, 26.884546, 112.517683, 26.884457, '台阶', '否', ''],
    [112.513520, 26.881358, 112.513539, 26.881313, '台阶', '否', ''],
    [112.513539, 26.881313, 112.513632, 26.881216, '台阶', '否', ''],
    [112.515475, 26.880770, 112.515463, 26.880542, '台阶', '否', ''],
    [112.514968, 26.880679, 112.514957, 26.880510, '台阶', '否', ''],
    [112.515266, 26.879498, 112.515066, 26.879341, '台阶', '否', ''],
    [112.516494, 26.879160, 112.516440, 26.878943, '台阶', '否', ''],
    [112.518744, 26.878249, 112.519235, 26.878367, '台阶', '否', ''],
    [112.518603, 26.879112, 112.518709, 26.879153, '台阶', '否', ''],
    [112.516890, 26.876983, 112.516888, 26.876633, '台阶', '否', ''],
    [112.516468, 26.875204, 112.516509, 26.875239, '坡道台阶混合', '否', ''],
    [112.516509, 26.875239, 112.516831, 26.875324, '坡道台阶混合', '否', ''],
    [112.516831, 26.875324, 112.516829, 26.875460, '坡道台阶混合', '否', ''],
    [112.516829, 26.875460, 112.516777, 26.875619, '坡道台阶混合', '否', ''],
    [112.516777, 26.875619, 112.516803, 26.875637, '坡道台阶混合', '否', ''],
    [112.516803, 26.875637, 112.517164, 26.875754, '坡道台阶混合', '否', ''],
    [112.517164, 26.875754, 112.517195, 26.875918, '坡道台阶混合', '否', ''],
    [112.517229, 26.875207, 112.517296, 26.875239, '坡道台阶混合', '否', ''],
    [112.517296, 26.875239, 112.517339, 26.875494, '坡道台阶混合', '否', ''],
    [112.517339, 26.875494, 112.517327, 26.875632, '坡道台阶混合', '否', ''],
    [112.517327, 26.875632, 112.517198, 26.875915, '坡道台阶混合', '否', ''],
    [112.516605, 26.876970, 112.516472, 26.877764, '坡道', '坡道陡，仅电动轮椅可通行', ''],
    [112.514977, 26.877808, 112.514977, 26.877808, '坡道', '坡道陡，难通行', ''],
];

// ========== 工具函数：调用高德步行路径 ==========
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

// 将路线拆分为路段并插入数据库
function insertSegmentsFromRoute(db, route, startName, endName) {
    const stmt = db.prepare(`
        INSERT INTO road_segments 
        (start_lng, start_lat, end_lng, end_lat, segment_type, wheelchair_passable, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let count = 0;
    route.steps.forEach(step => {
        const polyline = step.polyline;
        if (!polyline) return;

        const points = polyline.split(';').map(p => {
            const [lng, lat] = p.split(',').map(Number);
            return { lng, lat };
        });

        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            // 默认标记为可通行道路
            stmt.run(p1.lng, p1.lat, p2.lng, p2.lat, '道路', '是', `自动生成:${startName}→${endName}`);
            count++;
        }
    });

    stmt.finalize();
    return count;
}

// ========== 主流程 ==========
async function main() {
    console.log('🚀 开始重建完整路网...\n');

    // 1. 清空旧路段
    await new Promise((resolve, reject) => {
        db.run('DELETE FROM road_segments', (err) => {
            if (err) reject(err);
            else {
                console.log('✅ 已清空旧道路数据');
                resolve();
            }
        });
    });

    // 2. 从 poi 表读取所有坐标
    const rows = await new Promise((resolve, reject) => {
        db.all('SELECT id, name, lat, lng FROM poi', (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    const points = rows.map(r => ({
        name: r.name,
        lat: r.lat,
        lng: r.lng
    }));
    console.log(`📍 读取到 ${points.length} 个 POI 节点`);

    // 3. 生成所有不重复点对
    const pairs = [];
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            pairs.push({ start: points[i], end: points[j] });
        }
    }
    console.log(`🔗 共生成 ${pairs.length} 对起终点，开始请求高德API...\n`);

    let totalSegments = 0;
    let successCount = 0;

    for (let i = 0; i < pairs.length; i++) {
        const { start, end } = pairs[i];
        process.stdout.write(`[${i + 1}/${pairs.length}] ${start.name} → ${end.name} ... `);

        const route = await fetchWalkingRoute(start, end);
        if (route) {
            const segCount = insertSegmentsFromRoute(db, route, start.name, end.name);
            totalSegments += segCount;
            successCount++;
            console.log(`✅ 采集 ${segCount} 段`);
        } else {
            console.log(`⏭️ 跳过`);
        }

        // 控制请求频率（高德QPS限制）
        await new Promise(resolve => setTimeout(resolve, 150));
    }

    console.log(`\n📊 自动采集完成：成功 ${successCount}/${pairs.length} 对，共添加 ${totalSegments} 条路段`);

    // 4. 插入红色障碍路段
    console.log('\n🛑 开始插入已知障碍路段...');
    const stmt = db.prepare(`
        INSERT INTO road_segments 
        (start_lng, start_lat, end_lng, end_lat, segment_type, wheelchair_passable, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let obstacleCount = 0;
    for (const seg of obstacleSegments) {
        stmt.run(seg, (err) => {
            if (err) {
                console.error('插入障碍路段失败:', err.message);
            } else {
                obstacleCount++;
            }
        });
    }

    stmt.finalize(() => {
        console.log(`✅ 已添加 ${obstacleCount} 条红色障碍路段（台阶、陡坡等）`);
        db.close();
        console.log('\n🎉 路网重建完成！刷新前端即可看到最新道路。');
    });
}

main().catch(console.error);