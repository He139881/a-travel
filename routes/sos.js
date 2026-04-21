const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('./auth'); // 可选验证

// 提交 SOS 求助记录
router.post('/', async (req, res) => {
    const { lat, lng, address, message } = req.body;
    if (!lat || !lng) {
        return res.status(400).json({ error: '缺少位置信息' });
    }
    // 尝试从 token 获取用户信息（可选）
    let userId = null;
    let username = null;
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
            userId = decoded.id;
            username = decoded.username;
        } catch (e) {}
    }
    const sql = `INSERT INTO sos_records (user_id, username, lat, lng, address, message) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(sql, [userId, username, lat, lng, address || '', message || ''], function(err) {
        if (err) {
            console.error('插入 SOS 记录失败:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID, success: true });
    });
});

// 管理员获取所有 SOS 记录
router.get('/', authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: '需要管理员权限' });
    }
    db.all('SELECT * FROM sos_records ORDER BY created_at DESC', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 更新 SOS 记录状态（管理员）
router.put('/:id', authenticate, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
    const { status } = req.body;
    db.run('UPDATE sos_records SET status = ? WHERE id = ?', [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

module.exports = router;