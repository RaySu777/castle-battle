#!/bin/bash
# 城堡大战 - 一键启动本地服务器

cd "$(dirname "$0")"

PORT=8765
GAME_URL="http://localhost:${PORT}"

# 检查端口是否已被占用
if lsof -iTCP:"${PORT}" -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "⚠️  端口 ${PORT} 已被占用，尝试使用 ${PORT} 上的现有服务..."
  open "${GAME_URL}"
  echo "✅ 已在浏览器中打开游戏：${GAME_URL}"
  echo "按 Enter 退出..."
  read -r
  exit 0
fi

echo "🏰 城堡大战 - 正在启动服务器..."
echo "📡 地址：${GAME_URL}"
echo "⏹  按 Ctrl+C 可停止服务器"
echo ""

# 延迟打开浏览器，等服务就绪
(sleep 1 && open "${GAME_URL}") &

python3 -m http.server "${PORT}"
