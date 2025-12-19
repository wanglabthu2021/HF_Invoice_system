const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const { put } = require('@vercel/blob');

// Vercel Blob配置
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

const app = express();
const PORT = process.env.PORT || 3000;

// 设置静态文件目录
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

// 设置EJS为模板引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

// Vercel Serverless环境不支持持久化存储
// 本地开发时使用文件系统，生产环境需要配置云存储
const isProduction = process.env.NODE_ENV === 'production';

// 确保数据目录存在（仅本地开发）
let dataDir, uploadsDir, invoiceDataPath, excelFilePath;
if (!isProduction) {
    dataDir = path.join(__dirname, 'data');
    uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
    }
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir);
    }
    
    // 发票数据文件路径
    invoiceDataPath = path.join(dataDir, 'invoices.json');
    excelFilePath = path.join(dataDir, 'invoices_summary.xlsx');
} else {
    console.log('⚠️  警告：当前运行在生产环境（Vercel）');
    console.log('⚠️  Serverless环境不支持持久化存储');
    console.log('⚠️  建议配置云存储服务（如Firebase、AWS S3等）');
}

// 初始化发票数据
let invoices = [];
if (!isProduction && fs.existsSync(invoiceDataPath)) {
    try {
        const data = fs.readFileSync(invoiceDataPath, 'utf8');
        invoices = JSON.parse(data);
    } catch (error) {
        console.error('读取发票数据失败:', error);
        invoices = [];
    }
}

// Multer配置 - 使用内存存储（用于Vercel Blob上传）
const storage = multer.memoryStorage();

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter: function (req, file, cb) {
        // 只允许图片文件
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('只允许上传图片文件'));
        }
    }
});

// 路由配置
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 提交发票数据
app.post('/submit-invoice', upload.single('invoiceImage'), async (req, res) => {
    try {
        const { invoiceNumber, invoiceDate, amount, currency, seller, buyer, invoiceType, description, notes } = req.body;
        const file = req.file;
        let imagePath = '';
        let folderPath = '';
        
        // 处理文件上传
        if (file) {
            if (isProduction) {
                // 在生产环境下，上传到Vercel Blob
                if (!BLOB_READ_WRITE_TOKEN) {
                    return res.status(500).render('error', {
                        message: '配置错误',
                        error: 'BLOB_READ_WRITE_TOKEN 环境变量未配置'
                    });
                }
                
                const blobPath = `invoices/${invoiceNumber}/${Date.now()}-${path.basename(file.originalname)}`;
                
                try {
                    // 上传文件到Vercel Blob
                    const blobResult = await put(blobPath, file.buffer, {
                        token: BLOB_READ_WRITE_TOKEN,
                        contentType: file.mimetype
                    });
                    
                    imagePath = blobResult.url;
                    folderPath = `invoices/${invoiceNumber}`;
                } catch (blobError) {
                    console.error('Vercel Blob上传失败:', blobError);
                    return res.status(500).render('error', {
                        message: '文件上传失败',
                        error: '无法将文件上传到云存储服务'
                    });
                }
            } else {
                // 在本地开发环境下，使用本地文件系统
                const folderPathLocal = path.join(uploadsDir, invoiceNumber);
                
                // 创建文件夹如果不存在
                if (!fs.existsSync(folderPathLocal)) {
                    fs.mkdirSync(folderPathLocal, { recursive: true });
                }
                
                const filename = `invoice${path.extname(file.originalname)}`;
                const localFilePath = path.join(folderPathLocal, filename);
                
                // 保存文件到本地
                fs.writeFileSync(localFilePath, file.buffer);
                
                imagePath = localFilePath;
                folderPath = folderPathLocal;
            }
        }
        
        // 创建发票记录
        const invoice = {
            id: Date.now().toString(),
            invoiceNumber: invoiceNumber,
            invoiceDate: invoiceDate,
            amount: parseFloat(amount),
            currency: currency || 'CNY',
            seller: seller || '',
            buyer: buyer || '',
            invoiceType: invoiceType || '增值税普通发票',
            description: description || '',
            notes: notes || '',
            imagePath: imagePath,
            folderPath: folderPath,
            uploadDate: new Date().toISOString(),
            status: '已提交'
        };
        
        // 添加到发票列表
        invoices.push(invoice);
        
        // 保存数据到JSON文件（仅本地开发）
        if (!isProduction) {
            fs.writeFileSync(invoiceDataPath, JSON.stringify(invoices, null, 2), 'utf8');
            
            // 更新Excel表格（仅本地开发）
            updateExcelSheet(invoices);
        }
        
        // 返回成功页面
        res.render('success', {
            invoice: invoice,
            message: '发票信息提交成功！'
        });
        
    } catch (error) {
        console.error('处理发票提交失败:', error);
        res.status(500).render('error', {
            message: '提交失败，请重试',
            error: error.message
        });
    }
});

// 更新Excel表格
function updateExcelSheet(invoices) {
    try {
        // 检查生产环境
        if (isProduction) {
            console.log('⚠️  警告：生产环境不支持Excel文件生成');
            console.log('⚠️  建议配置云存储服务或使用API生成Excel');
            return;
        }
        
        // 准备Excel数据
        const excelData = invoices.map(invoice => ({
            '发票号': invoice.invoiceNumber,
            '发票日期': invoice.invoiceDate,
            '金额': invoice.amount,
            '币种': invoice.currency,
            '销售方': invoice.seller,
            '购买方': invoice.buyer,
            '发票类型': invoice.invoiceType,
            '描述': invoice.description,
            '备注': invoice.notes,
            '上传日期': new Date(invoice.uploadDate).toLocaleString(),
            '状态': invoice.status,
            '图片路径': invoice.imagePath
        }));
        
        // 创建工作簿和工作表
        const ws = xlsx.utils.json_to_sheet(excelData);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, '发票汇总');
        
        // 保存Excel文件
        xlsx.writeFile(wb, excelFilePath);
        console.log('Excel表格更新成功:', excelFilePath);
        
    } catch (error) {
        console.error('更新Excel表格失败:', error);
    }
}

// 获取发票列表（用于管理员查看）
app.get('/admin/invoices', (req, res) => {
    try {
        // 在生产环境下，发票数据会在服务器重启后丢失
        if (isProduction && invoices.length === 0) {
            return res.render('invoices', {
                invoices: [],
                totalInvoices: 0,
                totalAmount: 0,
                warning: '注意：Vercel Serverless环境不支持持久化存储，数据会在服务器重启后丢失'
            });
        }
        
        res.render('invoices', {
            invoices: invoices,
            totalInvoices: invoices.length,
            totalAmount: invoices.reduce((sum, inv) => sum + inv.amount, 0),
            warning: isProduction ? '注意：Vercel Serverless环境不支持持久化存储，数据会在服务器重启后丢失' : ''
        });
    } catch (error) {
        console.error('获取发票列表失败:', error);
        res.status(500).send('服务器错误');
    }
});

// 获取发票详情
app.get('/admin/invoices/:id', (req, res) => {
    try {
        const id = req.params.id;
        const invoice = invoices.find(inv => inv.id === id);
        
        if (!invoice) {
            return res.status(404).send('发票不存在');
        }
        
        res.render('invoice-detail', {
            invoice: invoice,
            warning: isProduction ? '注意：Vercel Serverless环境不支持持久化存储，数据会在服务器重启后丢失' : ''
        });
    } catch (error) {
        console.error('获取发票详情失败:', error);
        res.status(500).send('服务器错误');
    }
});

// 创建views目录和模板文件
const viewsDir = path.join(__dirname, 'src/views');
if (!fs.existsSync(viewsDir)) {
    fs.mkdirSync(viewsDir, { recursive: true });
}

// 创建基本的HTML模板文件
const createTemplateFiles = () => {
    // success.ejs模板
    const successTemplate = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>提交成功</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            text-align: center;
            background-color: #f0f0f0;
        }
        .success-container {
            background-color: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-top: 50px;
        }
        .success-icon {
            font-size: 50px;
            color: #4CAF50;
            margin-bottom: 20px;
        }
        .btn {
            background-color: #4CAF50;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            text-decoration: none;
            display: inline-block;
            margin-top: 20px;
        }
        .btn:hover {
            background-color: #45a049;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #f2f2f2;
        }
    </style>
</head>
<body>
    <div class="success-container">
        <div class="success-icon">✓</div>
        <h1>发票信息提交成功！</h1>
        <p><%= message %></p>
        
        <h3>您的发票信息：</h3>
        <table>
            <tr>
                <th>发票号</th>
                <td><%= invoice.invoiceNumber %></td>
            </tr>
            <tr>
                <th>发票日期</th>
                <td><%= invoice.invoiceDate %></td>
            </tr>
            <tr>
                <th>金额</th>
                <td><%= invoice.amount %> <%= invoice.currency %></td>
            </tr>
            <tr>
                <th>销售方</th>
                <td><%= invoice.seller %></td>
            </tr>
            <tr>
                <th>购买方</th>
                <td><%= invoice.buyer %></td>
            </tr>
            <tr>
                <th>发票类型</th>
                <td><%= invoice.invoiceType %></td>
            </tr>
        </table>
        
        <a href="/" class="btn">提交新发票</a>
    </div>
</body>
</html>
    `;
    
    // error.ejs模板
    const errorTemplate = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>提交失败</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            text-align: center;
            background-color: #f0f0f0;
        }
        .error-container {
            background-color: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-top: 50px;
        }
        .error-icon {
            font-size: 50px;
            color: #f44336;
            margin-bottom: 20px;
        }
        .btn {
            background-color: #4CAF50;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            text-decoration: none;
            display: inline-block;
            margin-top: 20px;
        }
        .btn:hover {
            background-color: #45a049;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-icon">✗</div>
        <h1>提交失败</h1>
        <p><%= message %></p>
        <% if (error) { %>
            <p style="color: red;"><%= error %></p>
        <% } %>
        <a href="/" class="btn">返回重试</a>
    </div>
</body>
</html>
    `;
    
    // invoices.ejs模板（管理员查看）
    const invoicesTemplate = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>发票管理</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f0f0f0;
        }
        .container {
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 20px;
        }
        .summary {
            background-color: #f9f9f9;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
            text-align: center;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #4CAF50;
            color: white;
        }
        tr:hover {
            background-color: #f5f5f5;
        }
        .btn {
            background-color: #008CBA;
            color: white;
            padding: 8px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            text-decoration: none;
            display: inline-block;
        }
        .btn:hover {
            background-color: #007B9A;
        }
        .btn-danger {
            background-color: #f44336;
        }
        .btn-danger:hover {
            background-color: #d32f2f;
        }
        .download-btn {
            background-color: #FFC107;
            color: black;
            margin-bottom: 20px;
        }
        .download-btn:hover {
            background-color: #FFB300;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>发票管理系统</h1>
        
        <div class="summary">
            <h3>统计信息</h3>
            <p>总发票数：<%= totalInvoices %> | 总金额：<%= totalAmount.toFixed(2) %> 元</p>
        </div>
        
        <a href="/data/invoices_summary.xlsx" class="btn download-btn">下载Excel汇总表</a>
        <a href="/" class="btn">返回提交页面</a>
        
        <table>
            <tr>
                <th>发票号</th>
                <th>发票日期</th>
                <th>金额</th>
                <th>销售方</th>
                <th>购买方</th>
                <th>发票类型</th>
                <th>上传日期</th>
                <th>状态</th>
                <th>操作</th>
            </tr>
            <% invoices.forEach(invoice => { %>
            <tr>
                <td><%= invoice.invoiceNumber %></td>
                <td><%= invoice.invoiceDate %></td>
                <td><%= invoice.amount %> <%= invoice.currency %></td>
                <td><%= invoice.seller %></td>
                <td><%= invoice.buyer %></td>
                <td><%= invoice.invoiceType %></td>
                <td><%= new Date(invoice.uploadDate).toLocaleString() %></td>
                <td><%= invoice.status %></td>
                <td>
                    <a href="/admin/invoices/<%= invoice.id %>" class="btn">详情</a>
                </td>
            </tr>
            <% }) %>
        </table>
        
        <% if (invoices.length === 0) { %>
        <p style="text-align: center; color: #999; margin-top: 20px;">暂无发票数据</p>
        <% } %>
    </div>
</body>
</html>
    `;
    
    // invoice-detail.ejs模板
    const invoiceDetailTemplate = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>发票详情</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f0f0f0;
        }
        .container {
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 20px;
        }
        .invoice-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 20px;
        }
        .info-item {
            padding: 10px;
            background-color: #f9f9f9;
            border-radius: 4px;
        }
        .info-label {
            font-weight: bold;
            color: #555;
        }
        .image-section {
            margin-top: 20px;
            text-align: center;
        }
        .invoice-image {
            max-width: 100%;
            max-height: 500px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        .btn {
            background-color: #4CAF50;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            text-decoration: none;
            display: inline-block;
            margin: 10px;
        }
        .btn:hover {
            background-color: #45a049;
        }
        .btn-secondary {
            background-color: #008CBA;
        }
        .btn-secondary:hover {
            background-color: #007B9A;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>发票详情</h1>
        
        <div class="invoice-info">
            <div class="info-item">
                <div class="info-label">发票号</div>
                <div><%= invoice.invoiceNumber %></div>
            </div>
            <div class="info-item">
                <div class="info-label">发票日期</div>
                <div><%= invoice.invoiceDate %></div>
            </div>
            <div class="info-item">
                <div class="info-label">金额</div>
                <div><%= invoice.amount %> <%= invoice.currency %></div>
            </div>
            <div class="info-item">
                <div class="info-label">销售方</div>
                <div><%= invoice.seller %></div>
            </div>
            <div class="info-item">
                <div class="info-label">购买方</div>
                <div><%= invoice.buyer %></div>
            </div>
            <div class="info-item">
                <div class="info-label">发票类型</div>
                <div><%= invoice.invoiceType %></div>
            </div>
            <div class="info-item">
                <div class="info-label">上传日期</div>
                <div><%= new Date(invoice.uploadDate).toLocaleString() %></div>
            </div>
            <div class="info-item">
                <div class="info-label">状态</div>
                <div><%= invoice.status %></div>
            </div>
        </div>
        
        <div class="info-item" style="grid-column: span 2;">
            <div class="info-label">商品/服务描述</div>
            <div><%= invoice.description || '无' %></div>
        </div>
        
        <div class="info-item" style="grid-column: span 2;">
            <div class="info-label">备注</div>
            <div><%= invoice.notes || '无' %></div>
        </div>
        
        <% if (invoice.imagePath) { %>
        <div class="image-section">
            <h3>发票图片</h3>
            <img src="<%= invoice.imagePath.replace('uploads', '/uploads') %>" alt="发票图片" class="invoice-image">
            <div style="margin-top: 10px; color: #666;">
                存储位置：<%= invoice.imagePath %>
            </div>
        </div>
        <% } %>
        
        <div style="text-align: center; margin-top: 20px;">
            <a href="/admin/invoices" class="btn btn-secondary">返回列表</a>
            <a href="/" class="btn">提交新发票</a>
        </div>
    </div>
</body>
</html>
    `;
    
    // 写入模板文件
    fs.writeFileSync(path.join(viewsDir, 'success.ejs'), successTemplate);
    fs.writeFileSync(path.join(viewsDir, 'error.ejs'), errorTemplate);
    fs.writeFileSync(path.join(viewsDir, 'invoices.ejs'), invoicesTemplate);
    fs.writeFileSync(path.join(viewsDir, 'invoice-detail.ejs'), invoiceDetailTemplate);
};

// 初始化模板文件
createTemplateFiles();

// 配置uploads目录的静态文件访问
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/data', express.static(path.join(__dirname, 'data')));

// 启动服务器
app.listen(PORT, () => {
    console.log(`
发票处理系统已启动！`);
    console.log(`访问地址：http://localhost:${PORT}`);
    console.log(`管理员页面：http://localhost:${PORT}/admin/invoices`);
    console.log(`Excel汇总表：http://localhost:${PORT}/data/invoices_summary.xlsx`);
    console.log(`
按 Ctrl+C 停止服务器
`);
});

// 处理未捕获的错误
process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', reason);
});
