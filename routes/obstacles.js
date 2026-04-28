const express = require('express');
const router = express.Router();
const db = require('../database');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// ========== 辅助函数：从请求中获取用户信息 ==========
function getUserFromRequest(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    
    const token = authHeader.split(' ')[1];
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (e) {
        return null;
    }
}

// ========== 中间件：验证用户是否登录 ==========
function authenticate(req, res, next) {
    const user = getUserFromRequest(req);
    if (!user) {
        return res.status(401).json({ error: '请先登录' });
    }
    req.user = user;
    next();
}

// ========== 中间件：验证管理员权限 ==========
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: '需要管理员权限' });
    }
    next();
}

// 获取所有障碍物（管理员看到全部，普通用户看到自己的）
router.get('/', (req, res) => {
    const user = getUserFromRequest(req);
    
    let sql = 'SELECT * FROM obstacles ORDER BY id DESC';
    let params = [];
    
    // 如果用户存在且不是管理员，只查询自己的障碍物
    if (user && user.role !== 'admin') {
        sql = 'SELECT * FROM obstacles WHERE user_id = ? ORDER BY id DESC';
        params = [user.id];
    }
    // 管理员或未登录用户看到全部
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// 添加上报（需要认证）
router.post('/', authenticate, (req, res) => {
    const { lat, lng, type, description, photo, report_time, road_segment_id } = req.body;
    if (!lat || !lng || !type) {
        return res.status(400).json({ error: '缺少必要字段（lat, lng, type）' });
    }
    
    const id = Date.now();
    const reportTime = report_time || new Date().toISOString().slice(0, 10);
    
    const sql = `INSERT INTO obstacles (id, user_id, lat, lng, type, description, status, report_time, photo, road_segment_id) 
                 VALUES (?, ?, ?, ?, ?, ?, '未处理', ?, ?, ?)`;
    
    db.run(sql, [
        id,
        req.user.id,
        lat,
        lng,
        type,
        description || '',
        reportTime,
        photo || null,
        road_segment_id || null
    ], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ 
            id, 
            success: true,
            obstacle: {
                id,
                user_id: req.user.id,
                lat,
                lng,
                type,
                description: description || '',
                status: '未处理',
                report_time: reportTime,
                photo: photo || null,
                road_segment_id: road_segment_id || null
            }
        });
    });
});

// 更新障碍物（状态、认领、完成等）- 管理员可以更新所有，普通用户只能更新自己的
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const user = getUserFromRequest(req);
    
    if (!user) {
        return res.status(401).json({ error: '请先登录' });
    }
    
    // 先检查障碍物是否存在以及权限
    db.get('SELECT user_id FROM obstacles WHERE id = ?', [id], (err, obstacle) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!obstacle) {
            return res.status(404).json({ error: '障碍物不存在' });
        }
        
        // 如果不是管理员且不是自己的障碍物，拒绝更新
        if (user.role !== 'admin' && obstacle.user_id !== user.id) {
            return res.status(403).json({ error: '无权修改他人的障碍物' });
        }
        
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
        
        db.run(sql, values, function(err2) {
            if (err2) {
                res.status(500).json({ error: err2.message });
                return;
            }
            res.json({ success: true, changes: this.changes });
        });
    });
});

// 关联路段更新（需要管理员权限）
router.put('/:id/link-road', (req, res) => {
    const user = getUserFromRequest(req);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: '需要管理员权限' });
    }
    
    const obstacleId = req.params.id;
    const { passable } = req.body;

    console.log('收到请求:', { obstacleId, passable, body: req.body });

    db.get('SELECT lat, lng, type, road_segment_id FROM obstacles WHERE id = ?', [obstacleId], (err, obs) => {
        if (err || !obs) return res.status(404).json({ error: '障碍物不存在' });

        let newWheelchairStatus;
        let actionMessage;

        if (passable === true) {
            newWheelchairStatus = 'yes';
            actionMessage = '可通行';
        } else if (passable === false) {
            newWheelchairStatus = 'no';
            actionMessage = '不可通行';
        } else {
            newWheelchairStatus = 'no';
            actionMessage = '不可通行';
        }

        if (obs.road_segment_id) {
            db.run('UPDATE obstacles SET status = "已关联路段" WHERE id = ?', [obstacleId], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                db.run('UPDATE road_segments SET wheelchair_passable = ? WHERE id = ?', 
                    [newWheelchairStatus, obs.road_segment_id], (err2) => {
                        if (err2) return res.status(500).json({ error: err2.message });
                        res.json({
                            success: true,
                            road_segment_id: obs.road_segment_id,
                            message: `已将该路段标记为${actionMessage}`
                        });
                    });
            });
            return;
        }

        db.all('SELECT * FROM road_segments', (err, segments) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!segments.length) return res.status(400).json({ error: '无可用路段数据' });

            let minDist = Infinity, nearestSeg = null;
            segments.forEach(seg => {
                const dist = Math.hypot(obs.lat - seg.start_lat, obs.lng - seg.start_lng);
                if (dist < minDist) { minDist = dist; nearestSeg = seg; }
            });

            if (!nearestSeg) return res.status(400).json({ error: '未找到合适路段' });

            db.run('UPDATE obstacles SET road_segment_id = ?, status = "已关联路段" WHERE id = ?',
                [nearestSeg.id, obstacleId], (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });

                    db.run('UPDATE road_segments SET wheelchair_passable = ? WHERE id = ?',
                        [newWheelchairStatus, nearestSeg.id], (err3) => {
                            if (err3) return res.status(500).json({ error: err3.message });
                            res.json({
                                success: true,
                                road_segment_id: nearestSeg.id,
                                message: `已将该路段标记为${actionMessage}`
                            });
                        });
                });
        });
    });
});

// 删除障碍物（管理员权限）
router.delete('/:id', (req, res) => {
    const user = getUserFromRequest(req);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: '需要管理员权限' });
    }
    
    const { id } = req.params;
    
    db.run('DELETE FROM obstacles WHERE id = ?', [id], function(err) {
        if (err) {
            console.error('删除障碍物失败:', err);
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: '障碍物不存在' });
        }
        res.json({ success: true, message: '障碍物已删除' });
    });
});

module.exports = router;