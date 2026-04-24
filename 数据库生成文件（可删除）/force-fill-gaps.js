// force-fill-gaps.js - 强制补充路段（忽略去重）
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const AMAP_KEY = '2c5385f0963e09c03c60546742d12f0c';
const DB_PATH = path.join(__dirname, 'routes', 'data.db');

// 9对有效坐标（已排除重复坐标对）
const gapPairs = [
  [112.512276, 26.881908, 112.5119,   26.881623],
  [112.511864, 26.881108, 112.512126, 26.880736],
  [112.514263, 26.883024, 112.51434,  26.882774],
  [112.516232, 26.88283,  112.516298, 26.8831  ],
  [112.518708, 26.883833, 112.518869, 26.883658],
  [112.517866, 26.88211,  112.518566, 26.882047],
  [112.517483, 26.880631, 112.518206, 26.881026],
  [112.518129, 26.881514, 112.518528, 26.881344],
  [112.517296, 26.878266, 112.517253, 26.878106]
];

async function fetchWalkingRoute(originLng, originLat, destLng, destLat) {
    const url = `https://restapi.amap.com/v3/direction/walking?origin=${originLng},${originLat}&destination=${destLng},${destLat}&key=${AMAP_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === '1' && data.route.paths && data.route.paths.length > 0) {
        return data.route.paths[0];
    }
    return null;
}

async function main() {
    const db = new sqlite3.Database(DB_PATH);
    console.log('force-fill-gaps: 强制添加缺失路段...\n');
    let totalAdded = 0;

    const stmt = db.prepare(`INSERT INTO road_segments (start_lng, start_lat, end_lng, end_lat, segment_type, wheelchair_passable, notes) VALUES (?, ?, ?, ?, '道路', '是', '强制补充')`);

    for (let i = 0; i < gapPairs.length; i++) {
        const [slng, slat, elng, elat] = gapPairs[i];
        process.stdout.write(`[${i+1}/${gapPairs.length}] (${slat.toFixed(4)},${slng.toFixed(4)}) → (${elat.toFixed(4)},${elng.toFixed(4)}) ... `);

        const route = await fetchWalkingRoute(slng, slat, elng, elat);
        if (!route) {
            console.log('⛔ 高德无路线');
            continue;
        }

        let added = 0;
        for (const step of route.steps) {
            const polyline = step.polyline;
            if (!polyline) continue;
            const points = polyline.split(';').map(p => {
                const [lng, lat] = p.split(',').map(Number);
                return { lng, lat };
            });
            for (let j = 0; j < points.length - 1; j++) {
                const p1 = points[j];
                const p2 = points[j+1];
                // 不去重，直接插入
                stmt.run(p1.lng, p1.lat, p2.lng, p2.lat);
                added++;
            }
        }
        totalAdded += added;
        console.log(`✅ 新增 ${added} 小段`);
        await new Promise(r => setTimeout(r, 200)); // 限速
    }

    stmt.finalize(() => {
        console.log(`\n🎉 强制补充完成，共插入 ${totalAdded} 条小段。`);
        db.close();
    });
}

main().catch(console.error);