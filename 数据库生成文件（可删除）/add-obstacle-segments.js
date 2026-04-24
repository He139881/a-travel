// add-obstacle-segments.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'routes', 'data.db');
const db = new sqlite3.Database(DB_PATH);

// 障碍路段定义：[起点经度, 起点纬度, 终点经度, 终点纬度, 类型, 轮椅通行性, 备注]
const obstacleSegments = [
    // 图书馆正门前的台阶
    [112.515735, 26.879810, 112.515745, 26.879820, '台阶', '否', '图书馆正门台阶'],
    [112.515743, 26.879818, 112.515755, 26.879828, '台阶', '否', '图书馆正门台阶'],

    // 第一教学楼正门台阶
    [112.516955, 26.877074, 112.516965, 26.877080, '台阶', '否', '第一教学楼台阶'],
    [112.516963, 26.877078, 112.516972, 26.877085, '台阶', '否', '第一教学楼台阶'],

    // 雨母楼北侧楼梯
    [112.516330, 26.878690, 112.516340, 26.878700, '台阶', '否', '雨母楼楼梯'],
    [112.516338, 26.878698, 112.516345, 26.878705, '台阶', '否', '雨母楼楼梯'],

    // 笃行园食堂入口坡道
    [112.519076, 26.881296, 112.519085, 26.881304, '坡道', '是', '笃行园食堂坡道'],

    // 三省园食堂南侧坡道
    [112.512818, 26.882371, 112.512830, 26.882380, '坡道', '是', '三省园食堂坡道'],

    // 尚学园1-2栋间台阶
    [112.518740, 26.878240, 112.518750, 26.878250, '台阶', '否', '尚学园台阶'],

    // 崇义楼附近台阶
    [112.518698, 26.880837, 112.518708, 26.880845, '台阶', '否', '崇义楼台阶'],

    // 网球场旁坡道
    [112.517467, 26.876582, 112.517480, 26.876590, '坡道', '是', '网球场旁坡道'],

    // 笃行五栋附近台阶
    [112.517379, 26.884296, 112.517390, 26.884305, '台阶', '否', '笃行五栋台阶'],

    // 校史馆入口台阶
    [112.517478, 26.878213, 112.517488, 26.878223, '台阶', '否', '校史馆台阶'],

    // 知行楼门前台阶
    [112.517156, 26.877660, 112.517165, 26.877668, '台阶', '否', '知行楼台阶'],
];

// 容差（约15米），用于判断路段是否已存在
const TOLERANCE = 0.00015;

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
            startLng, TOLERANCE, startLat, TOLERANCE,
            endLng,   TOLERANCE, endLat,   TOLERANCE,
            endLng,   TOLERANCE, endLat,   TOLERANCE,
            startLng, TOLERANCE, startLat, TOLERANCE
        ], (err, row) => {
            if (err) return reject(err);
            resolve(row ? row.id : null);
        });
    });
}

async function main() {
    console.log('🚧 开始添加障碍路段...\n');

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
            // 已有路段，更新为障碍属性
            updateStmt.run(type, passable, note, existId, (err) => {
                if (err) console.error(`更新失败: ${err.message}`);
                else updated++;
            });
        } else {
            // 新路段，直接插入
            insertStmt.run(slng, slat, elng, elat, type, passable, note, (err) => {
                if (err) console.error(`插入失败: ${err.message}`);
                else inserted++;
            });
        }
    }

    // 等待所有异步操作完成
    await new Promise(resolve => setTimeout(resolve, 1000));

    updateStmt.finalize();
    insertStmt.finalize();

    console.log(`✅ 完成：新增 ${inserted} 条障碍路段，更新 ${updated} 条已有路段。`);
    db.close();
}

main().catch(console.error);