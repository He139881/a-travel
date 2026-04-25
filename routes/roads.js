const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { authenticate } = require('./auth');  // 添加认证中间件

const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

console.log('roads.js 数据库路径:', dbPath);

router.get('/', (req, res) => {
    console.log('收到 /api/roads 请求');
    db.all('SELECT * FROM road_segments', (err, rows) => {
        if (err) {
            console.error('查询错误:', err);
            res.json([]);
            return;
        }
        console.log('返回数据条数:', rows.length);
        res.json(rows);
    });
});

// 更新路段的轮椅通行状态（添加认证）
router.put('/:id/status', authenticate, (req, res) => {
    const { id } = req.params;
    const { wheelchair_passable } = req.body;
    
    if (!wheelchair_passable || (wheelchair_passable !== 'yes' && wheelchair_passable !== 'no')) {
        return res.status(400).json({ error: 'wheelchair_passable 必须是 yes 或 no' });
    }
    
    const sql = 'UPDATE road_segments SET wheelchair_passable = ? WHERE id = ?';
    db.run(sql, [wheelchair_passable, id], function(err) {
        if (err) {
            console.error('更新路段状态失败:', err);
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: '路段不存在' });
        }
        res.json({ 
            message: wheelchair_passable === 'no' ? '路段已标记为不可通行' : '路段已标记为可通行',
            id: id,
            wheelchair_passable: wheelchair_passable
        });
    });
});

module.exports = router;