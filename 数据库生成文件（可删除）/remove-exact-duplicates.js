const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DB_PATH = path.join(__dirname, 'routes', 'data.db');
const db = new sqlite3.Database(DB_PATH);

// 删除 (start,end) 和 (end,start) 完全相同的重复路段，保留 id 最小的那条
const sql = `
DELETE FROM road_segments
WHERE id NOT IN (
    SELECT MIN(id) FROM road_segments
    GROUP BY
        CASE WHEN start_lat < end_lat OR (start_lat = end_lat AND start_lng <= end_lng)
             THEN start_lat || ',' || start_lng || '|' || end_lat || ',' || end_lng
             ELSE end_lat || ',' || end_lng || '|' || start_lat || ',' || start_lng
        END
);
`;
db.run(sql, function(err) {
    if (err) console.error('去重失败:', err);
    else console.log(`✅ 删除了 ${this.changes} 条完全重复的路段`);
    db.close();
});