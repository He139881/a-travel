```markdown
# 无障碍出行-USC

为南华大学雨母校区打造的智慧无障碍导航系统，支持轮椅无障碍路径规划、障碍物上报与协同处理、SOS紧急求助、语音交互、POI设施查询等功能。

## 技术栈

- 前端：HTML5/CSS3/原生 JavaScript + Leaflet + ECharts + Web Speech API
- 后端：Node.js + Express
- 数据库：SQLite3
- 认证：JWT + bcryptjs

## 在线访问

**https://usc-access.top**

> 手机端建议使用 Chrome 或 Edge 浏览器以获得最佳语音识别体验

---

## 安装与使用

### 环境要求

- Node.js ≥ 14.0
- 现代PC端浏览器（Chrome/Edge/Firefox/Safari），需支持 Web Speech API（语音识别）和 Geolocation（地理定位）

### 开发者安装步骤

1. **解压项目包**，进入项目根目录

2. **安装后端依赖**
   ```bash
   npm install
   ```

3. **初始化数据库**
   ```bash
   node database.js
   ```
   > 该命令会自动创建所有数据表，并生成默认管理员账号

4. **启动后端服务**
   ```bash
   node server.js
   ```
   > 服务默认运行在 http://localhost:3000

5. **启动前端**
   - 方式一（推荐）：将前端文件放入 `public` 目录，由 Express 统一托管，直接访问 http://localhost:3000
   - 方式二：使用 Live Server 等静态服务器工具打开 `index.html`

   > ⚠️ 注意：直接双击 `index.html` 使用 `file://` 协议可能导致跨域请求被浏览器阻止，建议使用上述两种方式。

### 用户使用步骤

直接访问 https://usc-access.top 即可使用，无需安装。

### 默认管理员账号

| 用户名 | 密码 |
|--------|------|
| admin  | admin123 |

> 普通用户请通过登录页的“立即注册”功能自行注册。

---

## 典型使用流程

### 普通用户

1. 访问首页，允许位置权限
2. 输入起点与终点，勾选“无障碍优先”模式
3. 点击“规划”按钮，跟随语音导航
4. 也可点击地图上的路段上报障碍物，或进入“互助广场”领取任务

### 管理员

1. 访问 `login.html`
2. 使用管理员账号登录
3. 自动跳转至管理后台 `admin.html`
4. 可管理障碍物、POI设施、SOS求助记录

### 语音操作

点击地图上的“🎤 语音”按钮，说出以下指令：

- “导航到图书馆” — 自动规划路线
- “找电梯” — 查询电梯设施正常的地点
- “找坡道” — 查询坡道设施正常的地点
- “救命” — 触发 SOS 求助
- “起点设为南门入口” — 语音设置起点

### 上报障碍物

1. 点击地图上的某条路段
2. 在弹出的上报表单中选择障碍类型、填写描述
3. 拍照上传（可选）
4. 提交，管理员审核后可关联路段并更新通行状态

---

## 部署架构图

本项目采用 B/S 三层架构：

### 1. 客户端层（浏览器）
- 包含用户端、管理后台、互助广场等页面
- 通过 Leaflet 实现地图展示，Web Speech API 实现语音交互
- 通过 HTTP 请求与后端 API 通信

### 2. 服务层（Node.js + Express）
- Express 提供 Web 服务
- 路由模块划分：认证（auth）、障碍物（obstacles）、POI（poi）、SOS（sos）、路网（roads）、文件上传（upload）
- 集成 CORS、JWT 认证、body-parser 等中间件

### 3. 数据层（SQLite）
- 使用单文件 `data.db` 存储所有数据
- 包含 users、admins、obstacles、poi、facility_status、road_segments、sos_records 等表
- 无需安装独立数据库服务，部署成本低

---

## 目录结构

```
├── public/               # 前端静态文件
│   ├── index.html        # 用户端首页
│   ├── admin.html        # 管理后台
│   ├── login.html        # 登录页
│   ├── user.html         # 个人中心
│   ├── community.html    # 互助广场
│   ├── style.css         # 全局样式
│   ├── app.js            # 用户端脚本
│   └── admin.js          # 管理端脚本
├── routes/               # 后端路由模块
│   ├── auth.js           # 用户认证
│   ├── obstacles.js      # 障碍物管理
│   ├── poi.js            # POI管理
│   ├── sos.js            # SOS求助
│   ├── roads.js          # 路网管理
│   ├── upload.js         # 文件上传
│   └── data.db           # SQLite数据库
├── server.js             # 后端入口
├── database.js           # 数据库初始化脚本
└── package.json          # 项目依赖
```

---

## 常见问题

### 1. 语音识别不工作？
- 请确保使用 Chrome 或 Edge 浏览器
- 检查是否在 HTTPS 环境下访问（本地 localhost 也可用）
- 确认已授予麦克风权限

### 2. 无法定位？
- 检查浏览器是否授予位置权限
- 定位失败时会自动使用默认校园中心坐标

### 3. 无障碍路线规划失败？
- 系统会自动降级到高德步行路线，并给出提示
- 可尝试取消勾选“无障碍优先”模式

### 4. 数据库初始化失败？
- 确保已安装 Node.js 和 npm
- 检查项目目录是否有写入权限

---

## 开源协议

本作品为 2026 年中国大学生计算机设计大赛参赛作品。
