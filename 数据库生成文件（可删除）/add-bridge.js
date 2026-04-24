// add-bridge.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'routes', 'data.db');
const db = new sqlite3.Database(dbPath);

// 根据BFS探索的边界，添加一条从西门区域到图书馆区域的连接路段
// 选取BFS最远节点 (26.879609,112.515397) 到图书馆节点 (26.879588,112.515720)
const bridgeSegments = [
    // 直连关键断裂点
    [112.515397, 26.879609, 112.515720, 26.879588, '道路', '是', '手动添加连接'],
    // 再加一条从西门主路到图书馆附近的连接，增强鲁棒性
    [112.516672, 26.875197, 112.515720, 26.879588, '道路', '是', '主干道直连']
];

console.log('🌉 开始添加连接路段...');

const stmt = db.prepare(`
    INSERT INTO road_segments 
    (start_lng, start_lat, end_lng, end_lat, segment_type, wheelchair_passable, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
`);

bridgeSegments.forEach(seg => {
    stmt.run(seg, (err) => {
        if (err) {
            console.error('插入失败:', err.message);
        } else {
            console.log(`✅ 已添加: (${seg[0]},${seg[1]}) -> (${seg[2]},${seg[3]})`);
        }
    });
});

stmt.finalize(() => {
    db.close();
    console.log('🎉 连接路段添加完成！刷新页面后重新测试轮椅优先。');
});