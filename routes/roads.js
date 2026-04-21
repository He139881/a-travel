const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 使用相对路径（现在路径没有中文了）
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

module.exports = router;