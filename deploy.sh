#!/usr/bin/env bash
# ============================================
# Love and Peace 一键部署脚本（在云服务器上运行）
# 用法：cd /opt/love-and-peace && bash deploy.sh
# ============================================
set -e  # 任何一步失败立即停止，避免半成品上线

APP_DIR=/opt/love-and-peace
PM2_NAME=love-and-peace

cd "$APP_DIR"

echo "==> 1/5 同步最新代码（以仓库为准，丢弃部署机上的临时改动）"
git fetch origin
git reset --hard origin/main
# 注：reset --hard 只影响 git 跟踪的文件，.env / server/data 数据库不受影响

echo "==> 2/5 安装前端依赖"
cd "$APP_DIR/client"
npm install --no-audit --no-fund

echo "==> 3/5 构建前端"
npm run build

echo "==> 4/5 安装后端依赖"
cd "$APP_DIR/server"
npm install --no-audit --no-fund

echo "==> 5/5 重启后端"
pm2 restart "$PM2_NAME"

echo ""
echo "✔ 部署完成 $(date '+%F %T')"
