// fix-roads.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'routes', 'data.db');
const db = new sqlite3.Database(DB_PATH);

const TOLERANCE = 0.0001; // 约10米

console.log('🔧 开始修复路网连通性...\n');

db.all(`SELECT id, start_lat, start_lng, end_lat, end_lng FROM road_segments`, (err, rows) => {
    if (err) {
        console.error('读取路段失败:', err);
        db.close();
        return;
    }

    console.log(`读取到 ${rows.length} 条路段`);

    const points = [];

    const addPoint = (lat, lng, id, type) => {
        let found = null;
        for (let g of points) {
            const dist = Math.hypot(g.avgLat - lat, g.avgLng - lng);
            if (dist < TOLERANCE) {
                found = g;
                break;
            }
        }
        if (found) {
            found.lats.push(lat);
            found.lngs.push(lng);
            found.ids.push({ id, type });
            found.avgLat = found.lats.reduce((a, b) => a + b, 0) / found.lats.length;
            found.avgLng = found.lngs.reduce((a, b) => a + b, 0) / found.lngs.length;
        } else {
            points.push({
                lats: [lat],
                lngs: [lng],
                ids: [{ id, type }],
                avgLat: lat,
                avgLng: lng
            });
        }
    };

    rows.forEach(row => {
        addPoint(row.start_lat, row.start_lng, row.id, 'start');
        addPoint(row.end_lat, row.end_lng, row.id, 'end');
    });

    console.log(`聚合后共 ${points.length} 个独立节点`);

    const stmt = db.prepare(`
        UPDATE road_segments
        SET start_lat = CASE WHEN id = ? AND ? = 'start' THEN ? ELSE start_lat END,
            start_lng = CASE WHEN id = ? AND ? = 'start' THEN ? ELSE start_lng END,
            end_lat   = CASE WHEN id = ? AND ? = 'end'   THEN ? ELSE end_lat END,
            end_lng   = CASE WHEN id = ? AND ? = 'end'   THEN ? ELSE end_lng END
        WHERE id = ?
    `);

    let updated = 0;
    points.forEach(g => {
        if (g.ids.length <= 1) return;
        const avgLat = g.avgLat;
        const avgLng = g.avgLng;
        g.ids.forEach(item => {
            stmt.run(item.id, item.type, avgLat, item.id, item.type, avgLng,
                     item.id, item.type, avgLat, item.id, item.type, avgLng, item.id);
            updated++;
        });
    });

    stmt.finalize(() => {
        console.log(`✅ 更新了 ${updated} 个端点坐标`);
        console.log('🎉 修复完成！刷新页面重新测试轮椅优先模式。');
        db.close();
    });
});