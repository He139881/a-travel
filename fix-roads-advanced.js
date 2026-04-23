const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const graphlib = require('graphlib');

const DB_PATH = path.join(__dirname, 'routes', 'data.db');
const db = new sqlite3.Database(DB_PATH);

// 合并端点容差（米）
const SNAP_TOLERANCE = 0.00015; // 约15米

console.log('🔧 高级路网连通性修复...\n');

db.all(`SELECT * FROM road_segments`, async (err, rows) => {
    if (err) throw err;
    
    // 构建图
    const g = new graphlib.Graph({ directed: false });
    rows.forEach(seg => {
        const k1 = `${seg.start_lat.toFixed(6)},${seg.start_lng.toFixed(6)}`;
        const k2 = `${seg.end_lat.toFixed(6)},${seg.end_lng.toFixed(6)}`;
        if (!g.hasNode(k1)) g.setNode(k1, { lat: seg.start_lat, lng: seg.start_lng });
        if (!g.hasNode(k2)) g.setNode(k2, { lat: seg.end_lat, lng: seg.end_lng });
        g.setEdge(k1, k2);
    });

    // 找出所有连通分量
    const components = [];
    const visited = new Set();
    g.nodes().forEach(node => {
        if (visited.has(node)) return;
        const comp = new Set();
        const queue = [node];
        while (queue.length) {
            const n = queue.shift();
            if (comp.has(n)) continue;
            comp.add(n);
            visited.add(n);
            (g.outEdges(n) || []).forEach(e => queue.push(e.w));
            (g.inEdges(n) || []).forEach(e => queue.push(e.v));
        }
        components.push(comp);
    });

    console.log(`发现 ${components.length} 个连通分量`);
    if (components.length <= 1) {
        console.log('✅ 路网已完全连通！');
        db.close();
        return;
    }

    // 找出最大的连通分量（主路网）
    components.sort((a, b) => b.size - a.size);
    const mainComp = components[0];
    console.log(`主路网包含 ${mainComp.size} 个节点`);

    // 为每个孤立分量寻找最近的节点并添加桥接边
    const stmt = db.prepare(`INSERT INTO road_segments (start_lng, start_lat, end_lng, end_lat, segment_type, wheelchair_passable) VALUES (?, ?, ?, ?, '道路', '是')`);
    let added = 0;

    for (let i = 1; i < components.length; i++) {
        const comp = components[i];
        let minDist = Infinity;
        let bestPair = null;

        // 寻找该分量到主路网的最近点对
        for (let nodeA of comp) {
            const coordA = g.node(nodeA);
            for (let nodeB of mainComp) {
                const coordB = g.node(nodeB);
                const dist = Math.hypot(coordA.lat - coordB.lat, coordA.lng - coordB.lng);
                if (dist < minDist) {
                    minDist = dist;
                    bestPair = { nodeA, nodeB, coordA, coordB };
                }
            }
        }

        if (bestPair && minDist < 0.002) { // 只连接距离小于200米的
            stmt.run(
                bestPair.coordA.lng, bestPair.coordA.lat,
                bestPair.coordB.lng, bestPair.coordB.lat
            );
            added++;
            console.log(`添加桥接: (${bestPair.coordA.lat.toFixed(6)},${bestPair.coordA.lng.toFixed(6)}) ↔ (${bestPair.coordB.lat.toFixed(6)},${bestPair.coordB.lng.toFixed(6)}) 距离 ${(minDist*111000).toFixed(0)}米`);
        }
    }

    stmt.finalize(() => {
        console.log(`\n✅ 已添加 ${added} 条桥接边`);
        console.log('🎉 修复完成！刷新页面测试轮椅优先模式。');
        db.close();
    });
});