// add-obstacle-zones.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'routes', 'data.db');
const db = new sqlite3.Database(DB_PATH);

// 障碍区域 —— 已根据你点击的坐标填入
const zones = [
    { lat: 26.877458, lng: 112.516367, radius: 0.0002, name: '台阶1' },
    { lat: 26.876952, lng: 112.517005, radius: 0.0002, name: '台阶2' },
    { lat: 26.881101, lng: 112.516522, radius: 0.0002, name: '台阶3' },
];

function applyZone(zone) {
    const { lat, lng, radius, name } = zone;
    console.log(`⚙️  处理: ${name}`);

    // 1. 将该区域内的所有普通可通行路段改为“台阶-否”
    db.run(`
        UPDATE road_segments
        SET segment_type = '台阶',
            wheelchair_passable = '否'
        WHERE segment_type = '道路' AND wheelchair_passable = '是'
        AND (
            (ABS(start_lat - ?) < ? AND ABS(start_lng - ?) < ?)
            OR
            (ABS(end_lat   - ?) < ? AND ABS(end_lng   - ?) < ?)
        )
    `, [lat, radius, lng, radius, lat, radius, lng, radius], function(err) {
        if (err) console.error(`  更新失败: ${err.message}`);
        else console.log(`  已转换 ${this.changes} 条绿色路段为台阶`);
    });

    // 2. 插入一条较长的障碍线段，使红色更明显（起终点在区域边缘）
    const slat = lat + radius * 0.5;
    const slng = lng + radius * 0.5;
    const elat = lat - radius * 0.5;
    const elng = lng - radius * 0.5;
    db.run(`
        INSERT INTO road_segments (start_lng, start_lat, end_lng, end_lat, segment_type, wheelchair_passable, notes)
        VALUES (?, ?, ?, ?, '台阶', '否', ?)
    `, [slng, slat, elng, elat, name], (err) => {
        if (err) console.error(`  插入红色线段失败: ${err.message}`);
        else console.log(`  已插入一条红色障碍线段`);
    });
}

function main() {
    console.log('🚧 开始扩大障碍区域...\n');
    zones.forEach(zone => applyZone(zone));
    setTimeout(() => {
        console.log('\n✅ 完成！重启后端查看效果。');
        db.close();
    }, 1500);
}

main().catch(console.error);