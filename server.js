const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // 支持 base64 图片
app.use(express.static(path.join(__dirname, 'public')));

// 路由
const obstaclesRouter = require('./routes/obstacles');
const poiRouter = require('./routes/poi');
const uploadRouter = require('./routes/upload');

app.use('/api/obstacles', obstaclesRouter);
app.use('/api/poi', poiRouter);
app.use('/api/upload', uploadRouter);

// 所有其他请求返回 index.html（支持 SPA）
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});