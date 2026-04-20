const express = require('express');
const multer = require('multer');
const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ 
    storage, 
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

router.post('/', upload.single('photo'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '未上传文件' });
    }
    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;
    const dataUrl = `data:${mimeType};base64,${base64}`;
    res.json({ url: dataUrl });
});

module.exports = router;