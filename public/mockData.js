// ==============================================
// 南华大学雨母校区 - 真实数据（来自高德地图坐标拾取）
// ==============================================

// POI数据（兴趣点）- 基于真实校园建筑坐标
const poiList = [
    // 校门
    { id: 1, name: "西门", lat: 26.875201, lng: 112.516666, score: 4.5, hasElevator: false, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "校门" },
    { id: 2, name: "东门", lat: 26.882019, lng: 112.520827, score: 4.5, hasElevator: false, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "校门" },
    { id: 3, name: "南门入口", lat: 26.875201, lng: 112.516666, score: 4.3, hasElevator: false, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "校门" },
    { id: 4, name: "南门出口", lat: 26.875181, lng: 112.516243, score: 4.3, hasElevator: false, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "校门" },
    
    // 教学楼
    { id: 5, name: "第一教学楼", lat: 26.877074, lng: 112.516955, score: 4.2, hasElevator: true, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "教学楼" },
    { id: 6, name: "第二教学楼", lat: 26.877396, lng: 112.516877, score: 4.0, hasElevator: true, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "教学楼" },
    { id: 7, name: "雨母楼", lat: 26.878689, lng: 112.516328, score: 4.1, hasElevator: true, hasRamp: true, hasTactilePaving: false, hasStairs: true, type: "教学楼" },
    { id: 8, name: "逸夫楼", lat: 26.878029, lng: 112.515641, score: 4.3, hasElevator: true, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "教学楼" },
    { id: 9, name: "计算机学院", lat: 26.881274, lng: 112.513861, score: 4.1, hasElevator: true, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "教学楼" },
    { id: 10, name: "电气学院", lat: 26.881330, lng: 112.512515, score: 4.0, hasElevator: true, hasRamp: true, hasTactilePaving: false, hasStairs: true, type: "教学楼" },
    { id: 11, name: "机械学院", lat: 26.881677, lng: 112.513663, score: 4.2, hasElevator: true, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "教学楼" },
    { id: 12, name: "崇业楼", lat: 26.881653, lng: 112.513264, score: 4.0, hasElevator: true, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "教学楼" },
    { id: 13, name: "崇义楼", lat: 26.880837, lng: 112.518698, score: 4.1, hasElevator: true, hasRamp: true, hasTactilePaving: false, hasStairs: true, type: "教学楼" },
    { id: 14, name: "崇德楼", lat: 26.881571, lng: 112.518524, score: 4.2, hasElevator: true, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "教学楼" },
    { id: 15, name: "崇礼楼", lat: 26.881107, lng: 112.517422, score: 4.0, hasElevator: true, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "教学楼" },
    { id: 16, name: "慎行楼", lat: 26.877091, lng: 112.516343, score: 4.1, hasElevator: true, hasRamp: true, hasTactilePaving: false, hasStairs: true, type: "教学楼" },
    
    // 学院楼
    { id: 17, name: "语言文学院", lat: 26.881597, lng: 112.517655, score: 4.2, hasElevator: true, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "学院楼" },
    { id: 18, name: "松霖建筑与设计艺术学院", lat: 26.880721, lng: 112.517594, score: 4.3, hasElevator: true, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "学院楼" },
    
    // 图书馆
    { id: 19, name: "图书馆", lat: 26.879809, lng: 112.515740, score: 4.8, hasElevator: true, hasRamp: true, hasTactilePaving: true, hasStairs: false, type: "图书馆" },
    
    // 校史馆
    { id: 20, name: "校史馆", lat: 26.878213, lng: 112.517478, score: 4.5, hasElevator: true, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "校史馆" },
    
    // 食堂
    { id: 21, name: "三省园食堂", lat: 26.882371, lng: 112.512818, score: 4.3, hasElevator: false, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "食堂" },
    { id: 22, name: "笃行园食堂", lat: 26.881296, lng: 112.519076, score: 4.2, hasElevator: false, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "食堂" },
    
    // 宿舍（三省园）
    { id: 23, name: "三省园一栋", lat: 26.882568, lng: 112.513187, score: 3.8, hasElevator: false, hasRamp: true, hasTactilePaving: false, hasStairs: true, type: "宿舍" },
    { id: 24, name: "三省园二栋", lat: 26.882930, lng: 112.513925, score: 3.7, hasElevator: false, hasRamp: true, hasTactilePaving: false, hasStairs: true, type: "宿舍" },
    { id: 25, name: "三省园三栋", lat: 26.883058, lng: 112.514628, score: 3.8, hasElevator: false, hasRamp: true, hasTactilePaving: false, hasStairs: true, type: "宿舍" },
    { id: 26, name: "三省园四栋", lat: 26.883172, lng: 112.515132, score: 3.9, hasElevator: false, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "宿舍" },
    { id: 27, name: "三省园五栋", lat: 26.882111, lng: 112.511751, score: 3.8, hasElevator: false, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "宿舍" },
    { id: 28, name: "三省园六栋", lat: 26.883917, lng: 112.515627, score: 3.9, hasElevator: false, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "宿舍" },
    { id: 29, name: "三省园七栋", lat: 26.882863, lng: 112.512903, score: 3.8, hasElevator: false, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "宿舍" },
    
    // 宿舍（笃行园）
    { id: 30, name: "笃行园一栋", lat: 26.882347, lng: 112.518683, score: 3.8, hasElevator: false, hasRamp: true, hasTactilePaving: false, hasStairs: true, type: "宿舍" },
    { id: 31, name: "笃行园二栋", lat: 26.882430, lng: 112.519101, score: 3.7, hasElevator: false, hasRamp: true, hasTactilePaving: false, hasStairs: true, type: "宿舍" },
    { id: 32, name: "笃行园三栋", lat: 26.882985, lng: 112.518680, score: 3.8, hasElevator: false, hasRamp: true, hasTactilePaving: false, hasStairs: true, type: "宿舍" },
    { id: 33, name: "笃行园四栋", lat: 26.882985, lng: 112.519117, score: 3.9, hasElevator: false, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "宿舍" },
    { id: 34, name: "笃行园五栋", lat: 26.884343, lng: 112.517266, score: 3.9, hasElevator: false, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "宿舍" },
    
    // 宿舍（尚学园）
    { id: 35, name: "尚学园一栋", lat: 26.878264, lng: 112.518364, score: 3.8, hasElevator: false, hasRamp: true, hasTactilePaving: false, hasStairs: true, type: "宿舍" },
    { id: 36, name: "尚学园二栋", lat: 26.878089, lng: 112.518595, score: 3.7, hasElevator: false, hasRamp: true, hasTactilePaving: false, hasStairs: true, type: "宿舍" },
    { id: 37, name: "尚学园三栋", lat: 26.878054, lng: 112.518099, score: 3.8, hasElevator: false, hasRamp: true, hasTactilePaving: false, hasStairs: true, type: "宿舍" },
    { id: 38, name: "尚学园四栋", lat: 26.877642, lng: 112.518102, score: 3.9, hasElevator: false, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "宿舍" },
    { id: 39, name: "尚学园五栋", lat: 26.877966, lng: 112.517493, score: 3.8, hasElevator: false, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "宿舍" },
    
    // 运动场馆
    { id: 40, name: "田径场", lat: 26.883302, lng: 112.519811, score: 4.0, hasElevator: false, hasRamp: true, hasTactilePaving: false, hasStairs: false, type: "运动场" },
    { id: 41, name: "篮球场", lat: 26.881493, lng: 112.519805, score: 4.1, hasElevator: false, hasRamp: true, hasTactilePaving: false, hasStairs: false, type: "运动场" },
    { id: 42, name: "网球场", lat: 26.876643, lng: 112.517144, score: 4.1, hasElevator: false, hasRamp: true, hasTactilePaving: false, hasStairs: false, type: "运动场" },
    { id: 43, name: "羽毛球场", lat: 26.882396, lng: 112.512480, score: 4.0, hasElevator: false, hasRamp: true, hasTactilePaving: false, hasStairs: false, type: "运动场" },
    { id: 44, name: "乒乓球场", lat: 26.884409, lng: 112.517700, score: 4.0, hasElevator: false, hasRamp: true, hasTactilePaving: false, hasStairs: false, type: "运动场" },
    
    // 服务设施
    { id: 45, name: "松霖活动中心", lat: 26.881122, lng: 112.515107, score: 4.3, hasElevator: true, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "活动中心" },
    { id: 46, name: "医务室", lat: 26.881059, lng: 112.514696, score: 4.2, hasElevator: true, hasRamp: true, hasTactilePaving: true, hasStairs: false, type: "医疗" },
    { id: 47, name: "三省园三栋菜鸟驿站", lat: 26.882949, lng: 112.514840, score: 4.0, hasElevator: false, hasRamp: true, hasTactilePaving: false, hasStairs: true, type: "服务" },
    { id: 48, name: "库底咖啡", lat: 26.882566, lng: 112.512655, score: 4.3, hasElevator: false, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "商业" },
    { id: 49, name: "蜜雪冰城", lat: 26.882453, lng: 112.512824, score: 4.2, hasElevator: false, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "商业" },
    { id: 50, name: "瑞幸咖啡", lat: 26.878938, lng: 112.517207, score: 4.3, hasElevator: false, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "商业" },
    { id: 51, name: "书吧图文", lat: 26.878954, lng: 112.516761, score: 4.0, hasElevator: false, hasRamp: true, hasTactilePaving: false, hasStairs: true, type: "服务" },
    { id: 52, name: "零食很忙", lat: 26.882223, lng: 112.512921, score: 4.1, hasElevator: false, hasRamp: true, hasTactilePaving: true, hasStairs: true, type: "商业" },
    { id: 53, name: "皇迪炸鸡腿", lat: 26.882522, lng: 112.512725, score: 4.0, hasElevator: false, hasRamp: true, hasTactilePaving: false, hasStairs: true, type: "商业" },
];

// 设施状态（基于真实POI名称）
let facilityStatus = {};

// 自动生成设施状态（默认所有POI设施正常）
poiList.forEach(poi => {
    facilityStatus[poi.name] = {
        elevator: poi.hasElevator ? "正常" : "无",
        ramp: poi.hasRamp ? "正常" : "无",
        tactilePaving: poi.hasTactilePaving ? "有" : "无",
        stairs: poi.hasStairs ? "有台阶" : "无台阶"
    };
});

// 障碍物数据（真实上报需要用户实际提交，这里保留为空数组，让用户上报）
let obstacles = [];

function loadObstacles() {
    // 从后端加载障碍物
}

// 存储高对比度偏好
function saveContrastPref(enabled) {
    localStorage.setItem('highContrast', enabled);
}

function loadContrastPref() {
    return localStorage.getItem('highContrast') === 'true';
}

// 通知权限状态
let notificationEnabled = false;