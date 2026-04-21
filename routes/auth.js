const express = require('express');
const router = express.Router();
const db = require('../database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// 用户注册
router.post('/register', async (req, res) => {
    const { username, password, nickname, phone } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码必填' });
    }
    try {
        const hashed = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (username, password, nickname, phone) VALUES (?, ?, ?, ?)`,
            [username, hashed, nickname || '', phone || ''],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(400).json({ error: '用户名已存在' });
                    }
                    return res.status(500).json({ error: err.message });
                }
                res.json({ id: this.lastID, message: '注册成功' });
            });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 用户登录
router.post('/login', (req, res) => {
    const { username, password, isAdmin } = req.body;
    const table = isAdmin ? 'admins' : 'users';
    
    db.get(`SELECT * FROM ${table} WHERE username = ?`, [username], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: '用户名或密码错误' });
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: '用户名或密码错误' });
        
        const token = jwt.sign(
            { id: user.id, username: user.username, role: isAdmin ? 'admin' : 'user' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.json({ token, user: { id: user.id, username: user.username, role: isAdmin ? 'admin' : 'user' } });
    });
});

// 验证中间件
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: '未提供令牌' });
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: '令牌无效' });
    }
};

// 管理员权限中间件
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: '需要管理员权限' });
    }
    next();
};

module.exports = { router, authenticate, requireAdmin };

// ========== 用户个人信息管理（需认证） ==========

// 获取当前用户信息
router.get('/me', authenticate, (req, res) => {
    const userId = req.user.id;
    db.get(`SELECT id, username, nickname, phone, avatar, created_at FROM users WHERE id = ?`, [userId], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: '用户不存在' });
        res.json(user);
    });
});

// 更新用户信息（昵称、手机号）
router.put('/me', authenticate, (req, res) => {
    const userId = req.user.id;
    const { nickname, phone } = req.body;
    db.run(`UPDATE users SET nickname = COALESCE(?, nickname), phone = COALESCE(?, phone) WHERE id = ?`,
        [nickname, phone, userId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
});

// 修改密码
router.put('/me/password', authenticate, async (req, res) => {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: '旧密码和新密码不能为空' });
    }
    db.get(`SELECT password FROM users WHERE id = ?`, [userId], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: '用户不存在' });
        const valid = await bcrypt.compare(oldPassword, user.password);
        if (!valid) return res.status(401).json({ error: '旧密码错误' });
        const hashed = await bcrypt.hash(newPassword, 10);
        db.run(`UPDATE users SET password = ? WHERE id = ?`, [hashed, userId], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ success: true });
        });
    });
});

// 获取当前用户上报的障碍物记录
router.get('/me/obstacles', authenticate, (req, res) => {
    // obstacles 表中没有 user_id 字段，需要添加。如果没有，则无法区分用户。
    // 简便方案：从 token 中获取 username，但 obstacles 表没有 username 字段。
    // 需要先修改 obstacles 表，增加 user_id 字段。
    // 这里给出修改表的代码和查询。
    // 如果你已添加 user_id 字段，请用下面的查询。
    db.all(`SELECT * FROM obstacles WHERE user_id = ? ORDER BY report_time DESC`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 获取当前用户的 SOS 求助记录
router.get('/me/sos-records', authenticate, (req, res) => {
    db.all(`SELECT * FROM sos_records WHERE user_id = ? ORDER BY created_at DESC`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
