// app/routes/invoice.js
const express = require('express');
const supabase = require('../lib/supabase');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const {
      invoiceNumber,
      invoiceDate,
      amount,
      currency,
      seller,
      buyer,
      invoiceType,
      description,
      notes,
      imageUrl
    } = req.body;

    const { data, error } = await supabase
      .from('invoices')
      .insert([{
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        amount,
        currency,
        seller,
        buyer,
        invoice_type: invoiceType,
        description,
        notes,
        image_url: imageUrl
      }])
      .select();

    if (error) {
      console.error(error);
      return res.status(500).json({ error: '保存发票失败' });
    }

    res.json({ success: true, invoice: data[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
