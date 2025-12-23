// app/routes/upload.js
const express = require('express');
const multer = require('multer');
const { put } = require('@vercel/blob');

const router = express.Router();

// 使用内存存储
const storage = multer.memoryStorage();
const upload = multer({ storage });

const BLOB_TOKEN = process.env.BLOB_ACCESS_TOKEN;

// 支持多文件上传，字段名可以是 file，前端每个文件单独上传也可用同一个接口
router.post('/', upload.array('file'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '未上传文件' });
    }
    if (!BLOB_TOKEN) {
      return res.status(500).json({ error: 'BLOB_ACCESS_TOKEN 未配置' });
    }

    const uploadedFiles = [];

    for (const file of req.files) {
      const blobPath = `invoices/${Date.now()}-${file.originalname}`;
      const result = await put(blobPath, file.buffer, {
        token: BLOB_TOKEN,
        contentType: file.mimetype,
        access: 'public',
      });
      uploadedFiles.push({ filename: file.originalname, url: result.url });
    }

    // 支持单文件上传的响应格式，保持向后兼容
    if (uploadedFiles.length === 1) {
      res.json({ url: uploadedFiles[0].url });
    } else {
      res.json({ files: uploadedFiles });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '上传失败' });
  }
});

module.exports = router;
