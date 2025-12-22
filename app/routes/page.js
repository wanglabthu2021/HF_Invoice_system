module.exports = (app) => {
  app.get("/", (req, res) => {
    res.render("invoices");
  });

  app.get("/success", (req, res) => {
    res.render("success");
  });
};
