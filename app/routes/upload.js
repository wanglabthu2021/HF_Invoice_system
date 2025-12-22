// app/routes/upload.js
const express = require('express');
const multer = require('multer');
const { put } = require('@vercel/blob');

const router = express.Router();

// 使用内存存储
const storage = multer.memoryStorage();
const upload = multer({ storage });

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

router.post('/', upload.single('invoiceImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未上传图片' });
    }
    if (!BLOB_TOKEN) {
      return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN 未配置' });
    }

    const blobPath = `invoices/${Date.now()}-${req.file.originalname}`;
    const result = await put(blobPath, req.file.buffer, {
      token: BLOB_TOKEN,
      contentType: req.file.mimetype
    });

    res.json({ imageUrl: result.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '上传失败' });
  }
});

module.exports = router;
