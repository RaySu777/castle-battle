#!/bin/bash
# 部署城堡大战到 GitHub Pages
set -e

REPO_NAME="${1:-castle-battle}"
GITHUB_USER="${2:-}"

cd "$(dirname "$0")"

if [ -z "$GITHUB_USER" ]; then
  echo "用法: ./deploy.sh [仓库名] [GitHub用户名]"
  echo "示例: ./deploy.sh castle-battle your-username"
  echo ""
  echo "或手动执行："
  echo "  1. 在 https://github.com/new 创建仓库 $REPO_NAME"
  echo "  2. git remote add origin https://github.com/<用户名>/$REPO_NAME.git"
  echo "  3. git push -u origin main"
  echo "  4. 仓库 Settings → Pages → Source 选 GitHub Actions"
  exit 1
fi

REMOTE="https://github.com/${GITHUB_USER}/${REPO_NAME}.git"

if ! git remote get-url origin &>/dev/null; then
  git remote add origin "$REMOTE"
else
  git remote set-url origin "$REMOTE"
fi

git push -u origin main

echo ""
echo "推送完成！"
echo "请在 GitHub 仓库 Settings → Pages 中将 Source 设为 GitHub Actions"
echo "部署完成后访问: https://${GITHUB_USER}.github.io/${REPO_NAME}/"
