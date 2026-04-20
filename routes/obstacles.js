const express = require('express');
const router = express.Router();
const db = require('../database');

// 获取所有障碍物
router.get('/', (req, res) => {
    db.all('SELECT * FROM obstacles ORDER BY id DESC', (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        // 确保 photo 字段为字符串（SQLite 存储为 TEXT）
        res.json(rows);
    });
});

// 添加上报
router.post('/', (req, res) => {
    const { lat, lng, type, description, photo, report_time } = req.body;
    if (!lat || !lng || !type) {
        return res.status(400).json({ error: '缺少必要字段' });
    }
    const id = Date.now(); // 使用时间戳作为 ID
    const sql = `INSERT INTO obstacles (id, lat, lng, type, description, status, report_time, photo) 
                 VALUES (?, ?, ?, ?, ?, '未处理', ?, ?)`;
    db.run(sql, [id, lat, lng, type, description || '', report_time || new Date().toISOString().slice(0,10), photo || null], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ id, success: true });
    });
});

// 更新障碍物（状态、认领、完成等）
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    // 构建动态更新语句
    const fields = [];
    const values = [];
    Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined) {
            fields.push(`${key} = ?`);
            values.push(updates[key]);
        }
    });
    if (fields.length === 0) {
        return res.status(400).json({ error: '没有要更新的字段' });
    }
    values.push(id);
    const sql = `UPDATE obstacles SET ${fields.join(', ')} WHERE id = ?`;
    db.run(sql, values, function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true, changes: this.changes });
    });
});

module.exports = router;