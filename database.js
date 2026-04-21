const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 使用相对路径：database.js 在根目录，data.db 在 routes 文件夹
const dbPath = path.join(__dirname, 'routes', 'data.db');
console.log('数据库路径:', dbPath);
const db = new sqlite3.Database(dbPath);

db.serialize(() => {

    // SOS 求助记录表
    db.run(`CREATE TABLE IF NOT EXISTS sos_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    address TEXT,
    message TEXT,
    status TEXT DEFAULT '待处理',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

    // 障碍物表
    db.run(`CREATE TABLE IF NOT EXISTS obstacles (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
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

    // 管理员表
    db.run(`CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 道路属性表
    db.run(`CREATE TABLE IF NOT EXISTS road_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        start_lng REAL NOT NULL,
        start_lat REAL NOT NULL,
        end_lng REAL NOT NULL,
        end_lat REAL NOT NULL,
        segment_type TEXT,
        wheelchair_passable TEXT,
        notes TEXT
    )`);

    // 创建默认管理员账号
    const bcrypt = require('bcryptjs');
    const defaultAdmin = 'admin';
    const defaultPassword = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO admins (username, password) VALUES (?, ?)`,
        [defaultAdmin, defaultPassword]);
});

module.exports = db;