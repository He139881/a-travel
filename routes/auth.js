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