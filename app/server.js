// app/server.js
const express = require("express");
const path = require("path");

const app = express();

app.set("views", path.join(process.cwd(), "src/views"));
app.set("view engine", "ejs");

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

// 页面路由
require("./routes/page")(app);

// API 路由（Serverless）
app.use("/api/upload", require("./routes/upload"));
app.use("/api/invoice", require("./routes/invoice"));

module.exports = app;
