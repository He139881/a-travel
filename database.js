const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // 障碍物表（已有，不变）
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

    // POI 表（已有，不变）
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

    // 设施状态表（已有，不变）
    db.run(`CREATE TABLE IF NOT EXISTS facility_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        poi_name TEXT UNIQUE NOT NULL,
        elevator TEXT,
        ramp TEXT,
        tactilePaving TEXT,
        stairs TEXT
    )`);

    // ========== 新增表 ==========
    // 普通用户表
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        nickname TEXT,
        avatar TEXT,
        phone TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 管理员表（独立存储，不与普通用户混用）
    db.run(`CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 可选：创建默认管理员账号（密码需加密，这里用明文示例，实际应 bcrypt）
    const bcrypt = require('bcryptjs');
    const defaultAdmin = 'admin';
    const defaultPassword = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO admins (username, password) VALUES (?, ?)`, 
        [defaultAdmin, defaultPassword]);
});

module.exports = db;