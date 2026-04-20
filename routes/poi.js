const express = require('express');
const router = express.Router();
const db = require('../database');

// 获取所有 POI
router.get('/', (req, res) => {
    db.all('SELECT * FROM poi', (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        // 转换布尔字段
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

// 获取设施状态（按 POI 名称）
router.get('/facility-status', (req, res) => {
    db.all('SELECT poi_name, elevator, ramp, tactilePaving, stairs FROM facility_status', (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        const statusMap = {};
        rows.forEach(row => {
            statusMap[row.poi_name] = {
                elevator: row.elevator,
                ramp: row.ramp,
                tactilePaving: row.tactilePaving,
                stairs: row.stairs
            };
        });
        res.json(statusMap);
    });
});

module.exports = router;