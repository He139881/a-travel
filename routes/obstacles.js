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
const { authenticate, requireAdmin } = require('./auth'); // 顶部引入

// 添加上报（支持从路段直接上报）
router.post('/', authenticate, (req, res) => {
    const { lat, lng, type, description, photo, report_time, road_segment_id } = req.body;
    if (!lat || !lng || !type) {
        return res.status(400).json({ error: '缺少必要字段（lat, lng, type）' });
    }
    const id = Date.now();
    const sql = `INSERT INTO obstacles (id, user_id, lat, lng, type, description, status, report_time, photo, road_segment_id) 
                 VALUES (?, ?, ?, ?, ?, ?, '未处理', ?, ?, ?)`;
    db.run(sql, [
        id,
        req.user.id,
        lat,
        lng,
        type,
        description || '',
        report_time || new Date().toISOString().slice(0, 10),
        photo || null,
        road_segment_id || null   // 关键修改：允许直接传入路段ID
    ], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
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

router.put('/:id/link-road', authenticate, requireAdmin, (req, res) => {
    const obstacleId = req.params.id;

    db.get('SELECT lat, lng, type, road_segment_id FROM obstacles WHERE id = ?', [obstacleId], (err, obs) => {
        if (err || !obs) return res.status(404).json({ error: '障碍物不存在' });

        // ===== 如果用户上报时已经指定了路段ID，直接标记该路段 =====
        if (obs.road_segment_id) {
            db.run('UPDATE obstacles SET status = "已关联路段" WHERE id = ?', [obstacleId], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                db.run('UPDATE road_segments SET wheelchair_passable = ? WHERE id = ?', ['否', obs.road_segment_id], (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({
                        success: true,
                        road_segment_id: obs.road_segment_id,
                        message: '已将该路段标记为不可通行'
                    });
                });
            });
            return;
        }
    // 2. 计算最近路段（简单欧氏距离，可优化为实际投影距离）
    db.all('SELECT * FROM road_segments', (err, segments) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!segments.length) return res.status(400).json({ error: '无可用路段数据' });
        
        let minDist = Infinity, nearestSeg = null;
        segments.forEach(seg => {
            // 计算到线段中点的距离（简化为起点距离，实际应计算点到线段最短距离）
            const dist = Math.hypot(obs.lat - seg.start_lat, obs.lng - seg.start_lng); // 可改进
            if (dist < minDist) { minDist = dist; nearestSeg = seg; }
        });
        
        if (!nearestSeg) return res.status(400).json({ error: '未找到合适路段' });
        
        // 3. 更新障碍物关联
        db.run('UPDATE obstacles SET road_segment_id = ?, status = "已关联路段" WHERE id = ?', 
            [nearestSeg.id, obstacleId], (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                
                // 4. 将对应路段标记为不可通行（可根据障碍类型进一步细分）
                const newWheelchair = '否';
                db.run('UPDATE road_segments SET wheelchair_passable = ? WHERE id = ?',
                    [newWheelchair, nearestSeg.id], (err3) => {
                        if (err3) return res.status(500).json({ error: err3.message });
                        res.json({ 
                            success: true, 
                            road_segment_id: nearestSeg.id,
                            message: '已将该路段标记为不可通行' 
                        });
                    });
            });
    });
  });
});

module.exports = router;