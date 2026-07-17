# 城堡大战

一款浏览器端的城堡攻防策略小游戏。派出战士、弓箭手、骑士、投石车、法师等兵种，第40关解锁圣骑士与速度投石机，摧毁敌方城堡！

## 在线游玩

部署完成后，游戏地址为：

`https://<你的用户名>.github.io/castle-battle/`

## 本地运行

```bash
# 方式一：直接打开 index.html

# 方式二：启动本地服务器
./start.sh
# 浏览器访问 http://localhost:8080
```

## 部署到 GitHub Pages

1. 在 GitHub 创建新仓库（例如 `castle-battle`）
2. 推送代码：

```bash
git remote add origin https://github.com/<你的用户名>/castle-battle.git
git push -u origin main
```

3. 打开仓库 **Settings → Pages**
4. **Build and deployment** 中 Source 选 **Deploy from a branch**
5. Branch 选 **main**，文件夹选 **/ (root)**，保存
6. 约 1–2 分钟后访问：`https://<你的用户名>.github.io/castle-battle/`

## 项目结构

```
├── index.html          # 游戏入口
├── css/style.css       # 样式
├── js/
│   ├── game.js         # 游戏逻辑
│   └── levels.js       # 关卡数据
└── generate_levels.py  # 关卡生成脚本
```
