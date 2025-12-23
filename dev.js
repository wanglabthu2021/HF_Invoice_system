// dev.js
require('dotenv').config();
const app = require('./app/server');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`本地开发服务器已启动: http://localhost:${PORT}`);
});
