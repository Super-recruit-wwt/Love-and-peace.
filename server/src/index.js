require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { db, init: initDb } = require('./db');
const { errorHandler } = require('./middleware/errorHandler');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Initialize database
initDb();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ==================== Route Registration ====================
require('./routes/auth').register(app);
require('./routes/characters').register(app);
require('./routes/chat').register(app);
require('./routes/user').register(app);
require('./routes/voices').register(app);
require('./routes/xianxia').register(app);

// ==================== Error Handling ====================
app.use(errorHandler);

// ==================== Serve static files in production ====================
const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');

if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// ==================== Graceful Shutdown ====================
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

function shutdown(signal) {
  console.log(`收到 ${signal}，正在关闭服务...`);
  server.close(() => {
    db.close();
    console.log('服务已停止');
    process.exit(0);
  });
  // 10s 后强制退出
  setTimeout(() => {
    console.error('强制退出（超时）');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
