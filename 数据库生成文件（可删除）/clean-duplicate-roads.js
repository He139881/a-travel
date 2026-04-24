// clean-duplicate-roads.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'routes', 'data.db');
const db = new sqlite3.Database(DB_PATH);

const TOLERANCE = 0.0005; // 约15米，判断为同一路段

console.log('🧹 开始清理重叠路段...\n');

db.serialize(() => {
    // 找出所有有特殊属性的路段（台阶、坡道等）
    db.all(`SELECT id, start_lat, start_lng, end_lat, end_lng, segment_type FROM road_segments 
            WHERE segment_type != '道路' OR wheelchair_passable != '是'`, (err, specialSegs) => {
        if (err) {
            console.error('查询特殊路段失败:', err);
            db.close();
            return;
        }

        console.log(`📌 找到 ${specialSegs.length} 条特殊路段`);

        let deletedCount = 0;
        let processed = 0;

        specialSegs.forEach(seg => {
            // 查找与该特殊路段重叠的普通道路（类型为'道路'且轮椅可通行）
            const sql = `
                DELETE FROM road_segments
                WHERE segment_type = '道路' AND wheelchair_passable = '是'
                AND (
                    (ABS(start_lat - ?) < ? AND ABS(start_lng - ?) < ?
                     AND ABS(end_lat - ?) < ? AND ABS(end_lng - ?) < ?)
                    OR
                    (ABS(start_lat - ?) < ? AND ABS(start_lng - ?) < ?
                     AND ABS(end_lat - ?) < ? AND ABS(end_lng - ?) < ?)
                )
            `;
            db.run(sql, [
                seg.start_lat, TOLERANCE, seg.start_lng, TOLERANCE,
                seg.end_lat,   TOLERANCE, seg.end_lng,   TOLERANCE,
                seg.end_lat,   TOLERANCE, seg.end_lng,   TOLERANCE,
                seg.start_lat, TOLERANCE, seg.start_lng, TOLERANCE
            ], function() {
                if (this.changes > 0) {
                    deletedCount += this.changes;
                    console.log(`  清理了与“${seg.segment_type}”重叠的 ${this.changes} 条普通道路`);
                }
                processed++;
                if (processed === specialSegs.length) {
                    console.log(`\n✅ 清理完成，共删除 ${deletedCount} 条重叠的普通道路。`);
                    // 清理后统计各类型数量
                    db.all(`SELECT segment_type, wheelchair_passable, COUNT(*) as cnt FROM road_segments GROUP BY segment_type, wheelchair_passable`, (err, rows) => {
                        if (!err) {
                            console.log('\n📊 当前数据库路段统计：');
                            rows.forEach(r => console.log(`   ${r.segment_type} (通行:${r.wheelchair_passable}): ${r.cnt} 条`));
                        }
                        db.close();
                    });
                }
            });
        });
    });
});