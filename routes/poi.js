const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate, requireAdmin } = require('./auth');

// 获取所有 POI（公开）
router.get('/', (req, res) => {
    db.all('SELECT * FROM poi', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const pois = rows.map(row => ({
            ...row,
            hasElevator: !!row.hasElevator,
            hasRamp: !!row.hasRamp,
            hasTactilePaving: !!row.hasTactilePaving,
            hasStairs: !!row.hasStairs
        }));
        res.json(pois);
    });
});

// 获取设施状态（公开）
router.get('/facility-status', (req, res) => {
    db.all('SELECT poi_name, elevator, ramp, tactilePaving, stairs FROM facility_status', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const statusMap = {};
        rows.forEach(row => { statusMap[row.poi_name] = { ...row }; });
        res.json(statusMap);
    });
});

// ========== 管理员接口 ==========
// 更新单个设施状态
router.put('/facility-status/:poi_name', authenticate, requireAdmin, (req, res) => {
    const { poi_name } = req.params;
    const { elevator, ramp, tactilePaving, stairs } = req.body;
    
    db.run(`UPDATE facility_status SET 
        elevator = COALESCE(?, elevator),
        ramp = COALESCE(?, ramp),
        tactilePaving = COALESCE(?, tactilePaving),
        stairs = COALESCE(?, stairs)
        WHERE poi_name = ?`,
        [elevator, ramp, tactilePaving, stairs, poi_name],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) {
                // 不存在则插入
                db.run(`INSERT INTO facility_status (poi_name, elevator, ramp, tactilePaving, stairs) 
                    VALUES (?, ?, ?, ?, ?)`,
                    [poi_name, elevator, ramp, tactilePaving, stairs],
                    (err2) => {
                        if (err2) return res.status(500).json({ error: err2.message });
                        res.json({ success: true, message: '已新增状态' });
                    });
            } else {
                res.json({ success: true });
            }
        });
});

// 新增 POI（管理员）
router.post('/', authenticate, requireAdmin, (req, res) => {
    const { name, lat, lng, score, hasElevator, hasRamp, hasTactilePaving, hasStairs, type } = req.body;
    if (!name || !lat || !lng) {
        return res.status(400).json({ error: '缺少必要字段' });
    }
    db.run(`INSERT INTO poi (name, lat, lng, score, hasElevator, hasRamp, hasTactilePaving, hasStairs, type) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, lat, lng, score || 3.0, hasElevator ? 1 : 0, hasRamp ? 1 : 0, hasTactilePaving ? 1 : 0, hasStairs ? 1 : 0, type || '其他'],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, success: true });
        });
});

// 删除 POI（管理员）
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM poi WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

module.exports = router;