// fill-gaps.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const AMAP_KEY = '2c5385f0963e09c03c60546742d12f0c';
const DB_PATH = path.join(__dirname, 'routes', 'data.db');

// 去重后的9对坐标（已排除一个无效重复对）
const gapPairs = [
  { start: { name: "点A", lng: 112.512276, lat: 26.881908 }, end: { name: "点B", lng: 112.5119,   lat: 26.881623 } },
  { start: { name: "点C", lng: 112.511864, lat: 26.881108 }, end: { name: "点D", lng: 112.512126, lat: 26.880736 } },
  { start: { name: "点E", lng: 112.514263, lat: 26.883024 }, end: { name: "点F", lng: 112.51434,  lat: 26.882774 } },
  { start: { name: "点G", lng: 112.516232, lat: 26.88283 },  end: { name: "点H", lng: 112.516298, lat: 26.8831   } },
  { start: { name: "点I", lng: 112.518708, lat: 26.883833 }, end: { name: "点J", lng: 112.518869, lat: 26.883658 } },
  { start: { name: "点K", lng: 112.517866, lat: 26.88211 },  end: { name: "点L", lng: 112.518566, lat: 26.882047 } },
  { start: { name: "点M", lng: 112.517483, lat: 26.880631 }, end: { name: "点N", lng: 112.518206, lat: 26.881026 } },
  { start: { name: "点O", lng: 112.518129, lat: 26.881514 }, end: { name: "点P", lng: 112.518528, lat: 26.881344 } },
  { start: { name: "点Q", lng: 112.517296, lat: 26.878266 }, end: { name: "点R", lng: 112.517253, lat: 26.878106 } }
];

// 调用高德步行 API
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

// 检查路段是否已存在（双向容差检查）
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

async function main() {
    console.log('🧩 开始补充缺口路段...\n');
    const db = new sqlite3.Database(DB_PATH);
    let totalInserted = 0;

    for (let i = 0; i < gapPairs.length; i++) {
        const { start, end } = gapPairs[i];
        process.stdout.write(`[${i+1}/${gapPairs.length}] ${start.name} → ${end.name} ... `);
        const route = await fetchWalkingRoute(start, end);
        if (route) {
            const added = await insertSegmentsFromRoute(db, route);
            if (added > 0) {
                totalInserted += added;
                console.log(`✅ 新增 ${added} 段`);
            } else {
                console.log(`⏭️ 已存在，跳过`);
            }
        } else {
            console.log(`⛔ 无路线`);
        }
        // 限速
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`\n🎉 完成！共新增 ${totalInserted} 条路段`);
    db.close();
}

main().catch(console.error);