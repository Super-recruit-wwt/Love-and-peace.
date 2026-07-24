// Love and Peace — PM2 生产环境配置
// 用法：pm2 start ecosystem.config.js

module.exports = {
  apps: [{
    name: 'love-and-peace',
    script: 'server/src/index.js',
    cwd: '/opt/love-and-peace',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    max_memory_restart: '500M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/var/log/love-and-peace/err.log',
    out_file: '/var/log/love-and-peace/out.log',
  }],
};
