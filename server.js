const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 路由引入
const obstaclesRouter = require('./routes/obstacles');
const poiRouter = require('./routes/poi');
const uploadRouter = require('./routes/upload');
const { router: authRouter } = require('./routes/auth');

// API 路由注册
app.use('/api/auth', authRouter);
app.use('/api/obstacles', obstaclesRouter);
app.use('/api/poi', poiRouter);
app.use('/api/upload', uploadRouter);

// 根路径重定向到 index.html（可选）
app.get('/', (req, res) => {
    res.redirect('/index.html');
});

// 404 处理（必须放在所有 API 路由之后）
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});