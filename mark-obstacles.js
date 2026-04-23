// mark-obstacles.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'routes', 'data.db');
const db = new sqlite3.Database(DB_PATH);

// ========== 预设的障碍物坐标范围（南华大学雨母校区） ==========
// 每个条目包含：范围中心坐标(lat,lng)、半径(度，约0.0003≈30米)、要更新的类型和轮椅通行性
const obstacleZones = [
    {
        name: '图书馆正门台阶',
        lat: 26.879809, lng: 112.515740,
        radius: 0.0003,
        segment_type: '台阶',
        wheelchair_passable: '否'
    },
    {
        name: '第一教学楼正门台阶',
        lat: 26.877074, lng: 112.516955,
        radius: 0.0003,
        segment_type: '台阶',
        wheelchair_passable: '否'
    },
    {
        name: '雨母楼北侧楼梯',
        lat: 26.878689, lng: 112.516328,
        radius: 0.0003,
        segment_type: '台阶',
        wheelchair_passable: '否'
    },
    {
        name: '三省园食堂南侧坡道',
        lat: 26.882371, lng: 112.512818,
        radius: 0.0003,
        segment_type: '坡道',
        wheelchair_passable: '是'
    },
    {
        name: '笃行园食堂入口坡道',
        lat: 26.881296, lng: 112.519076,
        radius: 0.0003,
        segment_type: '坡道',
        wheelchair_passable: '是'
    },
    // 可以根据实际需要继续添加，例如：
    // { name: '田径场西侧台阶', lat: 26.883302, lng: 112.519811, radius: 0.0003, segment_type: '台阶', wheelchair_passable: '否' },
];

// ========== 执行批量更新 ==========
console.log('🚧 开始根据预设区域标注障碍路段...\n');

let totalUpdated = 0;

db.serialize(() => {
    obstacleZones.forEach(zone => {
        const sql = `
            UPDATE road_segments
            SET segment_type = ?,
                wheelchair_passable = ?
            WHERE (
                (ABS(start_lat - ?) < ? AND ABS(start_lng - ?) < ?)
                OR
                (ABS(end_lat - ?) < ? AND ABS(end_lng - ?) < ?)
            )
        `;
        
        db.run(sql, [
            zone.segment_type,
            zone.wheelchair_passable,
            zone.lat, zone.radius, zone.lng, zone.radius,
            zone.lat, zone.radius, zone.lng, zone.radius
        ], function(err) {
            if (err) {
                console.error(`❌ 更新 "${zone.name}" 失败:`, err.message);
            } else {
                console.log(`✅ "${zone.name}": 更新了 ${this.changes} 条路段`);
                totalUpdated += this.changes;
            }
        });
    });

    // 最后统计一下各类路段数量
    db.all(`
        SELECT segment_type, wheelchair_passable, COUNT(*) as count
        FROM road_segments
        GROUP BY segment_type, wheelchair_passable
        ORDER BY count DESC
    `, (err, rows) => {
        if (err) {
            console.error('统计失败:', err);
        } else {
            console.log('\n📊 更新后路段统计：');
            rows.forEach(row => {
                console.log(`   ${row.segment_type} (${row.wheelchair_passable}): ${row.count} 条`);
            });
        }
        console.log(`\n🎉 全部完成！共更新 ${totalUpdated} 条路段。`);
        db.close();
    });
});