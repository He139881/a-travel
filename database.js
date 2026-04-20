const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

// 初始化表
db.serialize(() => {
    // 障碍物表
    db.run(`CREATE TABLE IF NOT EXISTS obstacles (
        id INTEGER PRIMARY KEY,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT '未处理',
        report_time TEXT,
        photo TEXT,
        claimed_by TEXT,
        claim_time TEXT,
        resolved_photo TEXT,
        resolved_time TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // POI 表
    db.run(`CREATE TABLE IF NOT EXISTS poi (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        score REAL,
        hasElevator INTEGER,
        hasRamp INTEGER,
        hasTactilePaving INTEGER,
        hasStairs INTEGER,
        type TEXT
    )`);

    // 设施状态表
    db.run(`CREATE TABLE IF NOT EXISTS facility_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        poi_name TEXT UNIQUE NOT NULL,
        elevator TEXT,
        ramp TEXT,
        tactilePaving TEXT,
        stairs TEXT
    )`);

    // 可选：插入初始数据（如果表为空）
    // 这里可以执行一次性的种子数据插入，但为简洁省略，建议单独写个 seed.js
});

module.exports = db;