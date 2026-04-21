const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件（顺序重要）
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 引入路由
const obstaclesRouter = require('./routes/obstacles');
const poiRouter = require('./routes/poi');
const uploadRouter = require('./routes/upload');
const { router: authRouter } = require('./routes/auth');
const sosRouter = require('./routes/sos');   // 确保路径正确
const roadsRouter = require('./routes/roads');

// API 路由注册（必须在 404 之前）
app.use('/api/auth', authRouter);
app.use('/api/obstacles', obstaclesRouter);
app.use('/api/poi', poiRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/sos', sosRouter); 
app.use('/api/roads', roadsRouter);

// 根路径重定向
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