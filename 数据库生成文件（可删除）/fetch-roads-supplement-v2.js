// fetch-roads-supplement-v2.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// ========== 配置 ==========
const AMAP_KEY = '2c5385f0963e09c03c60546742d12f0c';
const DB_PATH = path.join(__dirname, 'routes', 'data.db');
const MAX_DISTANCE_M = 500;   // 只对500米内的点对请求路线

// ========== 完整采样点（原有 + 你最新提供的19个新点） ==========
const samplePoints = [
    // ---- 原有重要 POI ----
    { name: "西门", lng: 112.516666, lat: 26.875201 },
    { name: "南门入口", lng: 112.516666, lat: 26.875201 },
    { name: "南门出口", lng: 112.516243, lat: 26.875181 },
    { name: "东门", lng: 112.520827, lat: 26.882019 },
    { name: "第一教学楼", lng: 112.516955, lat: 26.877074 },
    { name: "第二教学楼", lng: 112.516877, lat: 26.877396 },
    { name: "雨母楼", lng: 112.516328, lat: 26.878689 },
    { name: "逸夫楼", lng: 112.515641, lat: 26.878029 },
    { name: "计算机学院", lng: 112.513861, lat: 26.881274 },
    { name: "电气学院", lng: 112.512515, lat: 26.881330 },
    { name: "机械学院", lng: 112.513663, lat: 26.881677 },
    { name: "崇业楼", lng: 112.513264, lat: 26.881653 },
    { name: "崇义楼", lng: 112.518698, lat: 26.880837 },
    { name: "崇德楼", lng: 112.518524, lat: 26.881571 },
    { name: "崇礼楼", lng: 112.517422, lat: 26.881107 },
    { name: "慎行楼", lng: 112.516343, lat: 26.877091 },
    { name: "语言文学院", lng: 112.517655, lat: 26.881597 },
    { name: "松霖建筑与设计艺术学院", lng: 112.517594, lat: 26.880721 },
    { name: "图书馆", lng: 112.515740, lat: 26.879809 },
    { name: "校史馆", lng: 112.517478, lat: 26.878213 },
    { name: "三省园食堂", lng: 112.512818, lat: 26.882371 },
    { name: "笃行园食堂", lng: 112.519076, lat: 26.881296 },
    { name: "三省园一栋", lng: 112.513187, lat: 26.882568 },
    { name: "三省园二栋", lng: 112.513925, lat: 26.882930 },
    { name: "三省园三栋", lng: 112.514628, lat: 26.883058 },
    { name: "三省园四栋", lng: 112.515132, lat: 26.883172 },
    { name: "三省园五栋", lng: 112.511751, lat: 26.882111 },
    { name: "三省园六栋", lng: 112.515627, lat: 26.883917 },
    { name: "三省园七栋", lng: 112.512903, lat: 26.882863 },
    { name: "笃行园一栋", lng: 112.518683, lat: 26.882347 },
    { name: "笃行园二栋", lng: 112.519101, lat: 26.882430 },
    { name: "笃行园三栋", lng: 112.518680, lat: 26.882985 },
    { name: "笃行园四栋", lng: 112.519117, lat: 26.882985 },
    { name: "笃行园五栋", lng: 112.517266, lat: 26.884343 },
    { name: "尚学园一栋", lng: 112.518364, lat: 26.878264 },
    { name: "尚学园二栋", lng: 112.518595, lat: 26.878089 },
    { name: "尚学园三栋", lng: 112.518099, lat: 26.878054 },
    { name: "尚学园四栋", lng: 112.518102, lat: 26.877642 },
    { name: "尚学园五栋", lng: 112.517493, lat: 26.877966 },
    { name: "田径场", lng: 112.519811, lat: 26.883302 },
    { name: "篮球场", lng: 112.519805, lat: 26.881493 },
    { name: "网球场", lng: 112.517144, lat: 26.876643 },
    { name: "羽毛球场", lng: 112.512480, lat: 26.882396 },
    { name: "乒乓球场", lng: 112.517700, lat: 26.884409 },
    { name: "松霖活动中心", lng: 112.515107, lat: 26.881122 },
    { name: "医务室", lng: 112.514696, lat: 26.881059 },
    { name: "库底咖啡", lng: 112.512655, lat: 26.882566 },
    { name: "蜜雪冰城", lng: 112.512824, lat: 26.882453 },
    { name: "瑞幸咖啡", lng: 112.517207, lat: 26.878938 },

    // ---- 最新提供的19个关键补充点 ----
    { name: "三省2-3交界", lng: 112.514345, lat: 26.882788 },
    { name: "菜鸟附近", lng: 112.515006, lat: 26.882821 },
    { name: "三省四附近", lng: 112.516291, lat: 26.883046 },
    { name: "笃行附近1", lng: 112.517672, lat: 26.883246 },
    { name: "笃行五附近", lng: 112.517473, lat: 26.883769 },
    { name: "笃行五", lng: 112.517379, lat: 26.884296 },
    { name: "笃行入口", lng: 112.518894, lat: 26.883369 },
    { name: "笃行附近2", lng: 112.519214, lat: 26.883749 },
    { name: "笃行入口南", lng: 112.518888, lat: 26.882073 },
    { name: "笃行食堂附近", lng: 112.519981, lat: 26.880976 },
    { name: "校史馆交叉口", lng: 112.517245, lat: 26.878116 },
    { name: "交叉路口", lng: 112.515617, lat: 26.877386 },
    { name: "瑞幸交叉口", lng: 112.517538, lat: 26.87921 },
    { name: "尚学园1", lng: 112.51874, lat: 26.87824 },
    { name: "知行楼", lng: 112.517156, lat: 26.87766 },
    { name: "网球场附近", lng: 112.517467, lat: 26.876582 },
    { name: "南门附近", lng: 112.516501, lat: 26.875243 },
    { name: "交叉路口南", lng: 112.517217, lat: 26.875918 },
];

// ========== 工具函数 ==========
const EARTH_RADIUS = 6371000;
function calcDistance(lat1, lng1, lat2, lng2) {
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 去重：聚合过近的点（保留第一个）
function deduplicatePoints(points, tolerance = 0.0001) {
    const result = [];
    const used = new Set();
    for (let i = 0; i < points.length; i++) {
        if (used.has(i)) continue;
        result.push(points[i]);
        for (let j = i + 1; j < points.length; j++) {
            if (used.has(j)) continue;
            const d = calcDistance(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
            if (d < 10) { // 10米内视为同一点
                used.add(j);
            }
        }
    }
    return result;
}

// 生成距离符合条件的点对
function generateFilteredPairs(points, maxDistM) {
    const pairs = [];
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const d = calcDistance(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
            if (d <= maxDistM) {
                pairs.push({ start: points[i], end: points[j], distance: d });
            }
        }
    }
    return pairs;
}

// ========== API 与数据库操作 ==========
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
        return null;
    } catch (err) {
        console.error(`  ❌ 请求失败: ${start.name} -> ${end.name}`, err.message);
        return null;
    }
}

function checkSegmentExists(db, startLng, startLat, endLng, endLat, tolerance = 0.00015) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT COUNT(*) AS cnt FROM road_segments
            WHERE (
                (ABS(start_lng - ?) < ? AND ABS(start_lat - ?) < ? AND
                 ABS(end_lng - ?) < ? AND ABS(end_lat - ?) < ?)
                OR
                (ABS(start_lng - ?) < ? AND ABS(start_lat - ?) < ? AND
                 ABS(end_lng - ?) < ? AND ABS(end_lat - ?) < ?)
            )
        `;
        db.get(sql, [
            startLng, tolerance, startLat, tolerance,
            endLng, tolerance, endLat, tolerance,
            endLng, tolerance, endLat, tolerance,
            startLng, tolerance, startLat, tolerance
        ], (err, row) => {
            if (err) reject(err);
            else resolve(row.cnt > 0);
        });
    });
}

async function insertSegmentsFromRoute(db, route) {
    let insertCount = 0;
    const stmt = db.prepare(`
        INSERT INTO road_segments (start_lng, start_lat, end_lng, end_lat, segment_type, wheelchair_passable, notes)
        VALUES (?, ?, ?, ?, '道路', '是', '')
    `);

    for (const step of route.steps) {
        const polyline = step.polyline;
        if (!polyline) continue;
        const points = polyline.split(';').map(p => {
            const [lng, lat] = p.split(',').map(Number);
            return { lng, lat };
        });
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i+1];
            const exists = await checkSegmentExists(db, p1.lng, p1.lat, p2.lng, p2.lat);
            if (!exists) {
                stmt.run(p1.lng, p1.lat, p2.lng, p2.lat);
                insertCount++;
            }
        }
    }
    return insertCount;
}

// ========== 主流程 ==========
async function main() {
    console.log('🚀 校园路网智能补充 (距离限制 < 500m)\n');

    // 去重
    const deduped = deduplicatePoints(samplePoints);
    console.log(`📌 采样点去重后: ${deduped.length} 个 (原始 ${samplePoints.length} 个)`);

    const pairs = generateFilteredPairs(deduped, MAX_DISTANCE_M);
    console.log(`🔗 生成 ${pairs.length} 对近距离点对 (≤${MAX_DISTANCE_M}m)\n`);

    const db = new sqlite3.Database(DB_PATH);
    const beforeCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) AS cnt FROM road_segments', (err, row) => {
            if (err) reject(err);
            else resolve(row.cnt);
        });
    });
    console.log(`🗄️ 数据库现有路段: ${beforeCount} 条\n`);

    let totalInserted = 0, successPairs = 0;
    for (let i = 0; i < pairs.length; i++) {
        const { start, end, distance } = pairs[i];
        process.stdout.write(`[${i+1}/${pairs.length}] ${start.name} → ${end.name} (${Math.round(distance)}m) ... `);

        const route = await fetchWalkingRoute(start, end);
        if (route) {
            const added = await insertSegmentsFromRoute(db, route);
            if (added > 0) {
                totalInserted += added;
                console.log(`✅ +${added}段`);
            } else {
                console.log(`⏭️ 已存在`);
            }
            successPairs++;
        } else {
            console.log(`⛔ 无路线`);
        }
        await new Promise(resolve => setTimeout(resolve, 150)); // 限速
    }

    const afterCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) AS cnt FROM road_segments', (err, row) => {
            if (err) reject(err);
            else resolve(row.cnt);
        });
    });

    console.log(`\n🎉 完成！`);
    console.log(`   成功请求: ${successPairs}/${pairs.length}`);
    console.log(`   新增路段: ${totalInserted} 条`);
    console.log(`   数据库总路段: ${afterCount} 条`);
    db.close();
}

main().catch(console.error);