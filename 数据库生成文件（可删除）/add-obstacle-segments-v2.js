// add-obstacle-segments-v2.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'routes', 'data.db');
const db = new sqlite3.Database(DB_PATH);

// 障碍路段定义：[起点经度, 起点纬度, 终点经度, 终点纬度, 类型, 轮椅通行性, 备注]
const obstacleSegments = [
    // 你可以自由增删下面的条目，按同样格式书写
    [112.515735, 26.879810, 112.515745, 26.879820, '台阶', '否', '图书馆正门台阶'],
    [112.515743, 26.879818, 112.515755, 26.879828, '台阶', '否', '图书馆正门台阶'],

    // 如果你需要重新添加第一教学楼的台阶，取消下面的注释
    // [112.516955, 26.877074, 112.516965, 26.877080, '台阶', '否', '第一教学楼台阶'],
    // [112.516963, 26.877078, 112.516972, 26.877085, '台阶', '否', '第一教学楼台阶'],

    [112.516330, 26.878690, 112.516340, 26.878700, '台阶', '否', '雨母楼楼梯'],
    [112.516338, 26.878698, 112.516345, 26.878705, '台阶', '否', '雨母楼楼梯'],

    [112.519076, 26.881296, 112.519085, 26.881304, '坡道', '是', '笃行园食堂坡道'],
    [112.512818, 26.882371, 112.512830, 26.882380, '坡道', '是', '三省园食堂坡道'],

    [112.518740, 26.878240, 112.518750, 26.878250, '台阶', '否', '尚学园台阶'],
    [112.518698, 26.880837, 112.518708, 26.880845, '台阶', '否', '崇义楼台阶'],
    [112.517467, 26.876582, 112.517480, 26.876590, '坡道', '是', '网球场旁坡道'],
    [112.517379, 26.884296, 112.517390, 26.884305, '台阶', '否', '笃行五栋台阶'],
    [112.517478, 26.878213, 112.517488, 26.878223, '台阶', '否', '校史馆台阶'],
    [112.517156, 26.877660, 112.517165, 26.877668, '台阶', '否', '知行楼台阶'],
];

// 匹配已有路段的容差（约15米）
const MATCH_TOLERANCE = 0.00015;
// 删除重叠可通行路段的容差（极窄，5米内）
const CLEAN_TOLERANCE = 0.00005;

// 检查相似路段是否存在，返回匹配到的 id 或 null
function findExistingSegment(startLng, startLat, endLng, endLat) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT id FROM road_segments
            WHERE (
                (ABS(start_lng - ?) < ? AND ABS(start_lat - ?) < ? AND
                 ABS(end_lng   - ?) < ? AND ABS(end_lat   - ?) < ?)
                OR
                (ABS(start_lng - ?) < ? AND ABS(start_lat - ?) < ? AND
                 ABS(end_lng   - ?) < ? AND ABS(end_lat   - ?) < ?)
            )
            LIMIT 1
        `;
        db.get(sql, [
            startLng, MATCH_TOLERANCE, startLat, MATCH_TOLERANCE,
            endLng,   MATCH_TOLERANCE, endLat,   MATCH_TOLERANCE,
            endLng,   MATCH_TOLERANCE, endLat,   MATCH_TOLERANCE,
            startLng, MATCH_TOLERANCE, startLat, MATCH_TOLERANCE
        ], (err, row) => {
            if (err) return reject(err);
            resolve(row ? row.id : null);
        });
    });
}

// 删除与坐标点紧邻的可通行路段
function cleanNearbyGreen(lat, lng) {
    db.run(`
        DELETE FROM road_segments
        WHERE segment_type = '道路' AND wheelchair_passable = '是'
        AND (
            (ABS(start_lat - ?) < ? AND ABS(start_lng - ?) < ?)
            OR
            (ABS(end_lat   - ?) < ? AND ABS(end_lng   - ?) < ?)
        )
    `, [lat, CLEAN_TOLERANCE, lng, CLEAN_TOLERANCE,
        lat, CLEAN_TOLERANCE, lng, CLEAN_TOLERANCE],
    function(err) {
        if (err) console.error(`  清理绿色路段时出错: ${err.message}`);
        else if (this.changes > 0) console.log(`    🧹 清理了 ${this.changes} 条重叠的绿色路段`);
    });
}

async function main() {
    console.log('🚧 开始添加障碍路段（增强版，自动清理重叠）...\n');

    const updateStmt = db.prepare(`
        UPDATE road_segments
        SET segment_type = ?,
            wheelchair_passable = ?,
            notes = ?
        WHERE id = ?
    `);

    const insertStmt = db.prepare(`
        INSERT INTO road_segments (start_lng, start_lat, end_lng, end_lat, segment_type, wheelchair_passable, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let inserted = 0, updated = 0;

    for (const seg of obstacleSegments) {
        const [slng, slat, elng, elat, type, passable, note] = seg;
        const existId = await findExistingSegment(slng, slat, elng, elat);

        if (existId) {
            updateStmt.run(type, passable, note, existId, (err) => {
                if (err) console.error(`更新失败: ${err.message}`);
                else {
                    updated++;
                    console.log(`  更新路段 ${existId} 为 ${type}`);
                }
            });
        } else {
            insertStmt.run(slng, slat, elng, elat, type, passable, note, (err) => {
                if (err) console.error(`插入失败: ${err.message}`);
                else {
                    inserted++;
                    console.log(`  新增 ${type}: ${note}`);
                }
            });
        }

        // 清理障碍点附近（起点和终点）的绿色可通行路段
        cleanNearbyGreen(slat, slng);
        cleanNearbyGreen(elat, elng);
    }

    // 等待异步操作完成
    await new Promise(resolve => setTimeout(resolve, 1500));

    updateStmt.finalize();
    insertStmt.finalize();

    console.log(`\n✅ 完成：新增 ${inserted} 条障碍路段，更新 ${updated} 条已有路段。`);
    db.close();
}

main().catch(console.error);