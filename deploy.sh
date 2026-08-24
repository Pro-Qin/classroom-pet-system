#!/usr/bin/env bash
# ============================================================
# 校园宠物乐园 · 官方一键部署脚本（Linux / macOS）
# 用法：chmod +x deploy.sh && ./deploy.sh
# ============================================================
set -e
cd "$(dirname "$0")"

echo "[1/4] 安装依赖..."
npm install --no-audit --no-fund

echo "[2/4] 构建前端 + 后端..."
npm run build

echo "[3/4] 启动服务器..."
echo "启动成功后请访问 http://localhost:3000"
npm start
