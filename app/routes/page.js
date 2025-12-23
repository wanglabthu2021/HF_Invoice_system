const supabase = require('../lib/supabase');

module.exports = (app) => {
  app.get("/", async (req, res) => {
    try {
      const { data: invoices, error } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('获取发票数据失败:', error);
        return res.render("invoices", {
          invoices: [],
          totalInvoices: 0,
          totalAmount: 0
        });
      }

      const totalInvoices = invoices.length;
      const totalAmount = invoices.reduce((sum, invoice) => {
        return sum + (invoice.amount || 0);
      }, 0);

      // 在渲染模板时可以直接访问新的字段
      res.render("invoices", {
        invoices,
        totalInvoices,
        totalAmount
      });
    } catch (err) {
      console.error('服务器错误:', err);
      res.render("invoices", {
        invoices: [],
        totalInvoices: 0,
        totalAmount: 0
      });
    }
  });

  app.get("/success", (req, res) => {
    res.render("success");
  });
};
