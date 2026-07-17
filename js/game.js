(function () {
  'use strict';

  const SAVE_KEY = 'castle_battle_save';
  const PLAYER_GOLD_BASE = 20;
  const GOLD_BONUS_STEP = 5;
  const GOLD_BONUS_INTERVAL = 15;
  const PLAYER_GOLD_FLAT_UNTIL = 20;
  const SPEED_CATAPULT_UNLOCK = 30;
  const HOLY_KNIGHT_UNLOCK = 30;

  // 1-20关每秒20金币；20关之后每15关一档，每秒收入+5（21-35关25，36-50关30…）
  function getPlayerGoldRate(levelId) {
    if (levelId <= PLAYER_GOLD_FLAT_UNTIL) return PLAYER_GOLD_BASE;
    const tier = Math.floor((levelId - PLAYER_GOLD_FLAT_UNTIL - 1) / GOLD_BONUS_INTERVAL) + 1;
    return PLAYER_GOLD_BASE + tier * GOLD_BONUS_STEP;
  }

  function isUnitUnlocked(type, levelId) {
    if (type === 'speedCatapult') return levelId >= SPEED_CATAPULT_UNLOCK;
    if (type === 'holyKnight') return levelId >= HOLY_KNIGHT_UNLOCK;
    return true;
  }

  // --- 存档 ---
  function normalizeSave(raw) {
    const save = raw || {};
    save.cleared = Array.isArray(save.cleared) ? save.cleared : [];
    save.maxLevel = save.maxLevel || 1;
    save.records = save.records && typeof save.records === 'object' ? save.records : {};
    save.stats = save.stats || { totalWins: 0, totalAttempts: 0, totalLosses: 0, totalPlayTime: 0 };
    return save;
  }

  function loadSave() {
    try {
      return normalizeSave(JSON.parse(localStorage.getItem(SAVE_KEY)));
    } catch {
      return normalizeSave(null);
    }
  }

  function persistSave(save) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }

  function getLevelRecord(save, levelId) {
    const key = String(levelId);
    if (!save.records[key]) {
      save.records[key] = {
        attempts: 0,
        wins: 0,
        losses: 0,
        bestTime: null,
        bestStars: 0,
        bestCastleHpPct: 0,
        lastPlayed: null
      };
    }
    return save.records[key];
  }

  function calcStars(castleHp, maxHp) {
    const pct = maxHp > 0 ? castleHp / maxHp : 0;
    if (pct >= 0.8) return 3;
    if (pct >= 0.5) return 2;
    return 1;
  }

  function starsText(count) {
    if (!count) return '—';
    return '★'.repeat(count) + '☆'.repeat(3 - count);
  }

  function formatTime(seconds) {
    if (seconds == null || !Number.isFinite(seconds)) return '—';
    const total = Math.floor(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m > 0 ? `${m}分${String(s).padStart(2, '0')}秒` : `${s}秒`;
  }

  function recordLevelVisit(levelId) {
    const save = loadSave();
    const highest = Math.max(save.maxLevel, levelId);
    if (highest !== save.maxLevel) {
      save.maxLevel = highest;
      persistSave(save);
    }
  }

  function saveProgress(levelId) {
    const save = loadSave();
    if (!save.cleared.includes(levelId)) save.cleared.push(levelId);
    save.maxLevel = Math.max(save.maxLevel, Math.min(levelId + 1, LEVELS.length));
    persistSave(save);
  }

  function recordLevelAttempt(levelId) {
    const save = loadSave();
    const record = getLevelRecord(save, levelId);
    record.attempts += 1;
    record.lastPlayed = Date.now();
    save.stats.totalAttempts += 1;
    persistSave(save);
  }

  function recordLevelResult(levelId, won, gs) {
    const save = loadSave();
    const record = getLevelRecord(save, levelId);
    save.stats.totalPlayTime += gs.time;

    if (won) {
      record.wins += 1;
      save.stats.totalWins += 1;

      const castleHpPct = gs.playerCastleMaxHp > 0
        ? gs.playerCastleHp / gs.playerCastleMaxHp
        : 0;
      const stars = calcStars(gs.playerCastleHp, gs.playerCastleMaxHp);
      const prevBestTime = record.bestTime;
      const prevBestStars = record.bestStars;
      const isNewTime = prevBestTime == null || gs.time < prevBestTime;
      const isNewStars = stars > prevBestStars;

      if (isNewTime) record.bestTime = gs.time;
      if (isNewStars) record.bestStars = stars;
      if (castleHpPct > record.bestCastleHpPct) {
        record.bestCastleHpPct = castleHpPct;
      }

      if (!save.cleared.includes(levelId)) save.cleared.push(levelId);
      save.maxLevel = Math.max(save.maxLevel, Math.min(levelId + 1, LEVELS.length));
      persistSave(save);

      return {
        stars,
        castleHpPct,
        time: gs.time,
        isNewTime,
        isNewStars,
        isNewRecord: isNewTime || isNewStars
      };
    }

    record.losses += 1;
    save.stats.totalLosses += 1;
    persistSave(save);
    return null;
  }

  // --- DOM ---
  const screens = {
    menu: document.getElementById('menu-screen'),
    level: document.getElementById('level-screen'),
    records: document.getElementById('records-screen'),
    game: document.getElementById('game-screen')
  };
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  let currentLevel = 1;
  let gameState = null;
  let animId = null;
  let lastTime = 0;
  let paused = false;

  // --- 屏幕切换 ---
  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const hudH = document.querySelector('.hud').offsetHeight;
    const unitBarH = document.querySelector('.unit-bar').offsetHeight;
    const hpBarH = document.querySelector('.castle-hp-bar').offsetHeight;
    canvas.width = rect.width;
    canvas.height = rect.height - hudH - unitBarH - hpBarH;
    if (gameState) {
      gameState.groundY = canvas.height * 0.72;
      gameState.playerCastleX = 60;
      gameState.enemyCastleX = canvas.width - 60;
    }
  }

  // --- 关卡选择 UI ---
  function renderLevelGrid() {
    const grid = document.getElementById('level-grid');
    const save = loadSave();
    grid.innerHTML = '';
    LEVELS.forEach(lv => {
      const btn = document.createElement('button');
      btn.className = 'level-btn';
      const locked = lv.id > save.maxLevel;
      const cleared = save.cleared.includes(lv.id);
      const record = getLevelRecord(save, lv.id);
      if (locked) btn.classList.add('locked');
      if (cleared) btn.classList.add('cleared');
      const starDisplay = record.bestStars
        ? `<span class="stars">${starsText(record.bestStars)}</span>`
        : (cleared ? '<span class="stars">★</span>' : '');
      btn.innerHTML = `<span>${lv.id}</span>${starDisplay}`;
      if (!locked) {
        btn.addEventListener('click', () => {
          Sound.play('click');
          startLevel(lv.id);
        });
      }
      grid.appendChild(btn);
    });
  }

  function updateMenuStats() {
    const save = loadSave();
    document.getElementById('menu-cleared').textContent = `${save.cleared.length} / ${LEVELS.length}`;
    const attemptsEl = document.getElementById('menu-attempts');
    if (attemptsEl) attemptsEl.textContent = save.stats.totalAttempts;
    document.title = `城堡大战 - ${LEVELS.length}关挑战`;
    const subtitle = document.querySelector('.subtitle');
    if (subtitle) {
      subtitle.textContent = `征服 ${LEVELS.length} 座敌方城堡，执掌万界轮回！`;
    }
  }

  function renderRecordsScreen() {
    const save = loadSave();
    const summaryEl = document.getElementById('records-summary');
    const listEl = document.getElementById('records-list');
    const emptyEl = document.getElementById('records-empty');

    summaryEl.innerHTML = `
      <div class="summary-item"><span>已通关</span><strong>${save.cleared.length} / ${LEVELS.length}</strong></div>
      <div class="summary-item"><span>总挑战</span><strong>${save.stats.totalAttempts} 次</strong></div>
      <div class="summary-item"><span>胜利 / 失败</span><strong>${save.stats.totalWins} / ${save.stats.totalLosses}</strong></div>
      <div class="summary-item"><span>累计用时</span><strong>${formatTime(save.stats.totalPlayTime)}</strong></div>
    `;

    const played = LEVELS
      .map((lv) => ({ level: lv, record: getLevelRecord(save, lv.id) }))
      .filter(({ record }) => record.attempts > 0)
      .sort((a, b) => b.record.lastPlayed - a.record.lastPlayed);

    listEl.innerHTML = '';
    if (played.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    played.forEach(({ level, record }) => {
      const row = document.createElement('div');
      row.className = 'record-row';
      const cleared = save.cleared.includes(level.id);
      row.innerHTML = `
        <div class="record-main">
          <span class="record-level">第 ${level.id} 关</span>
          <span class="record-name">${level.name}</span>
        </div>
        <div class="record-meta">
          <span class="record-stars ${record.bestStars ? 'has-stars' : ''}">${starsText(record.bestStars)}</span>
          <span class="record-time">最佳 ${formatTime(record.bestTime)}</span>
          <span class="record-attempts">${record.attempts} 次 · ${cleared ? '已通关' : '未通关'}</span>
        </div>
      `;
      listEl.appendChild(row);
    });
  }

  // --- 游戏实体 ---
  function createUnit(type, side, x, y) {
    const def = UNIT_TYPES[type];
    return {
      type,
      side,
      x,
      y,
      hp: def.hp,
      maxHp: def.hp,
      attack: def.attack,
      speed: def.speed,
      range: def.range,
      attackSpeed: def.attackSpeed,
      color: def.color,
      size: def.size,
      icon: def.icon,
      projectile: def.projectile || false,
      siege: def.siege || false,
      aoe: def.aoe || false,
      attackCooldown: 0,
      alive: true,
      target: null
    };
  }

  function createProjectile(from, target, damage, aoe) {
    return {
      x: from.x,
      y: from.y - from.size,
      targetX: target.x,
      targetY: target.y - target.size,
      damage,
      speed: 6,
      side: from.side,
      aoe,
      alive: true,
      progress: 0
    };
  }

  // --- 初始化关卡 ---
  function initGame(levelId) {
    const level = LEVELS[levelId - 1];
    currentLevel = levelId;

    document.getElementById('current-level').textContent = levelId;
    document.getElementById('level-name').textContent = level.name;
    document.getElementById('gold').textContent = level.startGold;

    resizeCanvas();

    gameState = {
      level,
      gold: level.startGold,
      goldRate: getPlayerGoldRate(levelId),
      enemyGold: 0,
      playerCastleHp: level.playerCastleHp,
      playerCastleMaxHp: level.playerCastleHp,
      enemyCastleHp: level.enemyCastleHp,
      enemyCastleMaxHp: level.enemyCastleHp,
      units: [],
      projectiles: [],
      effects: [],
      groundY: canvas.height * 0.72,
      playerCastleX: 60,
      enemyCastleX: canvas.width - 60,
      enemySpawnTimer: 0,
      goldTimer: 0,
      enemyGoldTimer: 0,
      enemyUnitIndex: 0,
      gameOver: false,
      won: false,
      time: 0
    };

    updateHpBars();
    updateUnitButtons();
    paused = false;
  }

  function startLevel(levelId) {
    Sound.unlock();
    recordLevelVisit(levelId);
    recordLevelAttempt(levelId);
    showScreen('game');
    Sound.startBattleMusic();
    initGame(levelId);
    lastTime = performance.now();
    if (animId) cancelAnimationFrame(animId);
    gameLoop(performance.now());
  }

  // --- 游戏逻辑 ---
  function spawnUnit(type, side) {
    const def = UNIT_TYPES[type];
    const gs = gameState;
    if (side === 'player') {
      if (!isUnitUnlocked(type, currentLevel)) return false;
      if (gs.gold < def.cost) return false;
      gs.gold -= def.cost;
      const x = gs.playerCastleX + 50 + Math.random() * 30;
      gs.units.push(createUnit(type, 'player', x, gs.groundY));
      document.getElementById('gold').textContent = Math.floor(gs.gold);
      updateUnitButtons();
      Sound.playSpawn(type);
      return true;
    } else {
      const x = gs.enemyCastleX - 50 - Math.random() * 30;
      gs.units.push(createUnit(type, 'enemy', x, gs.groundY));
      Sound.playSpawn(type);
      return true;
    }
  }

  function findTarget(unit) {
    const gs = gameState;
    const enemies = gs.units.filter(u => u.alive && u.side !== unit.side);
    let closest = null;
    let closestDist = Infinity;

    for (const e of enemies) {
      const dist = Math.abs(e.x - unit.x);
      if (dist < closestDist) {
        closestDist = dist;
        closest = e;
      }
    }

    if (unit.siege && closestDist > unit.range) {
      return { x: unit.side === 'player' ? gs.enemyCastleX : gs.playerCastleX, y: gs.groundY, isCastle: true, size: 40 };
    }

    if (closest && closestDist <= unit.range) return closest;

    const castleX = unit.side === 'player' ? gs.enemyCastleX : gs.playerCastleX;
    const castleDist = Math.abs(castleX - unit.x);
    if (castleDist <= unit.range + 40) {
      return { x: castleX, y: gs.groundY, isCastle: true, size: 40 };
    }

    return closest;
  }

  function dealDamage(target, damage, attacker) {
    const gs = gameState;
    if (target.isCastle) {
      if (attacker.side === 'player') {
        gs.enemyCastleHp = Math.max(0, gs.enemyCastleHp - damage);
      } else {
        gs.playerCastleHp = Math.max(0, gs.playerCastleHp - damage);
      }
      addEffect(target.x, target.y - 30, 'hit');
      Sound.play('castle_hit');
      updateHpBars();
      checkGameOver();
      return;
    }

    target.hp -= damage;
    addEffect(target.x, target.y - target.size, 'hit');
    if (target.hp <= 0) {
      target.alive = false;
      addEffect(target.x, target.y - target.size, 'death');
      Sound.play('death');
    }
  }

  function addEffect(x, y, type) {
    gameState.effects.push({ x, y, type, life: 1.0 });
  }

  function updateUnits(dt) {
    const gs = gameState;
    for (const unit of gs.units) {
      if (!unit.alive) continue;

      unit.attackCooldown = Math.max(0, unit.attackCooldown - dt);

      const target = findTarget(unit);
      unit.target = target;

      if (!target) {
        const dir = unit.side === 'player' ? 1 : -1;
        unit.x += unit.speed * dir * dt * 60;
        continue;
      }

      const dist = Math.abs(target.x - unit.x);
      const inRange = dist <= unit.range + (target.size || 0);

      if (!inRange) {
        const dir = target.x > unit.x ? 1 : -1;
        unit.x += unit.speed * dir * dt * 60;
      } else if (unit.attackCooldown <= 0) {
        if (unit.projectile) {
          gs.projectiles.push(createProjectile(unit, target, unit.attack, unit.aoe));
          Sound.playAttack(unit);
        } else {
          dealDamage(target, unit.attack, unit);
          Sound.playAttack(unit);
        }
        unit.attackCooldown = 1 / unit.attackSpeed;
      }
    }

    gs.units = gs.units.filter(u => u.alive);
  }

  function updateProjectiles(dt) {
    const gs = gameState;
    for (const p of gs.projectiles) {
      if (!p.alive) continue;
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const totalDist = Math.sqrt(dx * dx + dy * dy);
      const moveDist = p.speed * dt * 60;

      if (totalDist <= moveDist || totalDist < 1) {
        p.alive = false;
        if (p.aoe) {
          const victims = gs.units.filter(u => u.alive && u.side !== p.side &&
            Math.abs(u.x - p.targetX) < 60);
          victims.forEach(v => dealDamage(v, p.damage, { side: p.side }));
        } else {
          const target = gs.units.find(u => u.alive && u.side !== p.side &&
            Math.abs(u.x - p.targetX) < 30);
          if (target) {
            dealDamage(target, p.damage, { side: p.side });
          } else {
            const castleX = p.side === 'player' ? gs.enemyCastleX : gs.playerCastleX;
            if (Math.abs(castleX - p.targetX) < 50) {
              dealDamage({ x: castleX, y: gs.groundY, isCastle: true }, p.damage, { side: p.side });
            }
          }
        }
        addEffect(p.targetX, p.targetY, 'explosion');
        Sound.play('explosion');
      } else {
        const ratio = moveDist / totalDist;
        p.x += dx * ratio;
        p.y += dy * ratio;
      }
    }
    gs.projectiles = gs.projectiles.filter(p => p.alive);
  }

  function updateEffects(dt) {
    for (const e of gameState.effects) {
      e.life -= dt * 2;
    }
    gameState.effects = gameState.effects.filter(e => e.life > 0);
  }

  function updateEnemyAI(dt) {
    const gs = gameState;
    gs.enemyGoldTimer += dt * 1000;
    if (gs.enemyGoldTimer >= 1000) {
      gs.enemyGoldTimer = 0;
      gs.enemyGold += gs.level.enemyGoldRate;
    }

    gs.enemySpawnTimer += dt * 1000;
    if (gs.enemySpawnTimer >= gs.level.enemySpawnInterval) {
      gs.enemySpawnTimer = 0;
      const unitTypes = gs.level.enemyUnits;
      const type = unitTypes[gs.enemyUnitIndex % unitTypes.length];
      const cost = UNIT_TYPES[type].cost;
      if (gs.enemyGold >= cost) {
        gs.enemyGold -= cost;
        spawnUnit(type, 'enemy');
      }
      gs.enemyUnitIndex++;
    }
  }

  function updateGold(dt) {
    const gs = gameState;
    gs.goldTimer += dt * 1000;
    if (gs.goldTimer >= 1000) {
      gs.goldTimer = 0;
      gs.gold += gs.goldRate;
      document.getElementById('gold').textContent = Math.floor(gs.gold);
      updateUnitButtons();
    }
  }

  function checkGameOver() {
    const gs = gameState;
    if (gs.gameOver) return;

    if (gs.enemyCastleHp <= 0) {
      gs.gameOver = true;
      gs.won = true;
      const result = recordLevelResult(currentLevel, true, gs);
      showResult(true, result);
    } else if (gs.playerCastleHp <= 0) {
      gs.gameOver = true;
      gs.won = false;
      recordLevelResult(currentLevel, false, gs);
      showResult(false);
    }
  }

  function updateHpBars() {
    const gs = gameState;
    const pPct = (gs.playerCastleHp / gs.playerCastleMaxHp) * 100;
    const ePct = (gs.enemyCastleHp / gs.enemyCastleMaxHp) * 100;
    document.getElementById('player-castle-hp').style.width = pPct + '%';
    document.getElementById('enemy-castle-hp').style.width = ePct + '%';
    document.getElementById('player-hp-text').textContent =
      `${Math.max(0, Math.floor(gs.playerCastleHp))}/${gs.playerCastleMaxHp}`;
    document.getElementById('enemy-hp-text').textContent =
      `${Math.max(0, Math.floor(gs.enemyCastleHp))}/${gs.enemyCastleMaxHp}`;
  }

  function updateUnitButtons() {
    const gs = gameState;
    document.querySelectorAll('.unit-btn').forEach(btn => {
      const type = btn.dataset.unit;
      const unlocked = isUnitUnlocked(type, currentLevel);
      btn.classList.toggle('hidden', !unlocked);
      if (!unlocked) return;
      const cost = UNIT_TYPES[type].cost;
      btn.disabled = gs.gold < cost;
    });
  }

  // --- 渲染 ---
  function drawCastle(x, y, side, hp, maxHp) {
    const w = 70;
    const h = 90;
    const hpRatio = hp / maxHp;

    ctx.save();
    if (side === 'enemy') {
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.translate(-x, -y);
    }

    // 城堡主体
    const baseColor = side === 'player' ? '#5b7fb5' : '#8b4557';
    const darkColor = side === 'player' ? '#3d5a80' : '#6b3040';

    ctx.fillStyle = darkColor;
    ctx.fillRect(x - w / 2, y - h, w, h);

    // 城垛
    const merlonW = 12;
    const merlonH = 15;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = baseColor;
      ctx.fillRect(x - w / 2 + i * (merlonW + 2), y - h - merlonH, merlonW, merlonH);
    }

    // 城门
    ctx.fillStyle = '#2c1810';
    ctx.beginPath();
    ctx.arc(x, y, 18, Math.PI, 0);
    ctx.fill();

    // 旗帜
    ctx.fillStyle = side === 'player' ? '#4caf50' : '#f44336';
    ctx.fillRect(x + 15, y - h - 30, 3, 35);
    ctx.beginPath();
    ctx.moveTo(x + 18, y - h - 30);
    ctx.lineTo(x + 38, y - h - 22);
    ctx.lineTo(x + 18, y - h - 14);
    ctx.fill();

    // 受损效果
    if (hpRatio < 0.5) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x - w / 2 + 10, y - h + 20, 15, 20);
      ctx.fillRect(x + 5, y - h + 40, 12, 15);
    }
    if (hpRatio < 0.25) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x - 10, y - h + 50, 20, 25);
    }

    ctx.restore();
  }

  function drawUnit(unit) {
    const def = UNIT_TYPES[unit.type];
    const hpRatio = unit.hp / unit.maxHp;

    ctx.save();

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(unit.x, unit.y + 2, unit.size, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 身体
    ctx.fillStyle = unit.side === 'player' ? unit.color : adjustColor(unit.color, -40);
    ctx.beginPath();
    ctx.arc(unit.x, unit.y - unit.size, unit.size, 0, Math.PI * 2);
    ctx.fill();

    // 边框
    ctx.strokeStyle = unit.side === 'player' ? '#fff' : '#ffaaaa';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 图标
    ctx.font = `${unit.size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(unit.icon, unit.x, unit.y - unit.size);

    // 血条
    const barW = unit.size * 2;
    const barH = 4;
    const barX = unit.x - barW / 2;
    const barY = unit.y - unit.size * 2 - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = hpRatio > 0.5 ? '#4caf50' : hpRatio > 0.25 ? '#ff9800' : '#f44336';
    ctx.fillRect(barX, barY, barW * hpRatio, barH);

    ctx.restore();
  }

  function drawProjectile(p) {
    ctx.save();
    ctx.fillStyle = p.aoe ? '#e74c3c' : '#f39c12';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.aoe ? 5 : 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEffect(e) {
    ctx.save();
    ctx.globalAlpha = e.life;
    if (e.type === 'hit') {
      ctx.fillStyle = '#fff';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💥', e.x, e.y - (1 - e.life) * 20);
    } else if (e.type === 'death') {
      ctx.fillStyle = '#aaa';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💀', e.x, e.y - (1 - e.life) * 15);
    } else if (e.type === 'explosion') {
      ctx.fillStyle = '#ff6600';
      ctx.beginPath();
      ctx.arc(e.x, e.y, (1 - e.life) * 15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBackground() {
    const gs = gameState;
    const w = canvas.width;
    const h = canvas.height;
    const groundY = gs.groundY;

    // 天空
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    skyGrad.addColorStop(0, '#6bb5e0');
    skyGrad.addColorStop(1, '#a8d8f0');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, groundY);

    // 云朵
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    drawCloud(100 + Math.sin(gs.time * 0.3) * 20, 50, 30);
    drawCloud(w * 0.5 + Math.sin(gs.time * 0.2) * 15, 35, 25);
    drawCloud(w * 0.75, 60, 28);

    // 远山
    ctx.fillStyle = '#7a9e6a';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    for (let x = 0; x <= w; x += 40) {
      ctx.lineTo(x, groundY - 30 - Math.sin(x * 0.01 + 1) * 20);
    }
    ctx.lineTo(w, groundY);
    ctx.fill();

    // 地面
    const groundGrad = ctx.createLinearGradient(0, groundY, 0, h);
    groundGrad.addColorStop(0, '#5a8f3c');
    groundGrad.addColorStop(1, '#3d6b28');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, groundY, w, h - groundY);

    // 草地细节
    ctx.strokeStyle = '#4a7a2e';
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 20) {
      const gx = i + Math.sin(i * 0.5) * 5;
      ctx.beginPath();
      ctx.moveTo(gx, groundY);
      ctx.lineTo(gx + 3, groundY - 6 - Math.sin(i * 0.3) * 4);
      ctx.stroke();
    }
  }

  function drawCloud(x, y, size) {
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.arc(x + size * 0.8, y - size * 0.3, size * 0.7, 0, Math.PI * 2);
    ctx.arc(x + size * 1.5, y, size * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  function adjustColor(hex, amount) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
    const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
    return `rgb(${r},${g},${b})`;
  }

  function render() {
    const gs = gameState;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground();

    drawCastle(gs.playerCastleX, gs.groundY, 'player', gs.playerCastleHp, gs.playerCastleMaxHp);
    drawCastle(gs.enemyCastleX, gs.groundY, 'enemy', gs.enemyCastleHp, gs.enemyCastleMaxHp);

    gs.units.forEach(drawUnit);
    gs.projectiles.forEach(drawProjectile);
    gs.effects.forEach(drawEffect);
  }

  // --- 游戏循环 ---
  function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    if (!paused && gameState && !gameState.gameOver) {
      gameState.time += dt;
      updateGold(dt);
      updateEnemyAI(dt);
      updateUnits(dt);
      updateProjectiles(dt);
      updateEffects(dt);
    }

    if (gameState) render();
    animId = requestAnimationFrame(gameLoop);
  }

  // --- 结果弹窗 ---
  function showResult(won, runResult) {
    Sound.stopBattleMusic();
    const overlay = document.getElementById('result-overlay');
    const title = document.getElementById('result-title');
    const msg = document.getElementById('result-message');
    const nextBtn = document.getElementById('btn-next-level');
    const statsEl = document.getElementById('result-stats');
    const badgeEl = document.getElementById('result-record-badge');

    if (won) {
      title.textContent = '🎉 胜利！';
      msg.textContent = gameState.level.description;
      nextBtn.style.display = currentLevel < LEVELS.length ? 'inline-block' : 'none';
      if (currentLevel === LEVELS.length) {
        msg.textContent = `恭喜！你征服了全部${LEVELS.length}座城堡，执掌万界轮回！`;
      }
      if (runResult) {
        statsEl.classList.remove('hidden');
        document.getElementById('result-time').textContent = formatTime(runResult.time);
        document.getElementById('result-hp').textContent =
          `${Math.floor(runResult.castleHpPct * 100)}%`;
        document.getElementById('result-stars').textContent = starsText(runResult.stars);
        if (runResult.isNewRecord) {
          badgeEl.classList.remove('hidden');
          badgeEl.textContent = runResult.isNewTime && runResult.isNewStars
            ? '🏆 新纪录！最快用时 & 最高评级'
            : runResult.isNewTime
              ? '🏆 新纪录！最快用时'
              : '🏆 新纪录！最高评级';
        } else {
          badgeEl.classList.add('hidden');
        }
      }
      Sound.play('win');
    } else {
      title.textContent = '💀 战败';
      msg.textContent = '你的城堡被攻陷了，整顿军队再来挑战！';
      nextBtn.style.display = 'none';
      statsEl.classList.add('hidden');
      badgeEl.classList.add('hidden');
      Sound.play('lose');
    }

    overlay.classList.remove('hidden');
  }

  // --- 事件绑定 ---
  function bindClickSound(el) {
    el.addEventListener('click', () => Sound.play('click'));
  }

  [
    'btn-start',
    'btn-level-select',
    'btn-records',
    'btn-back-menu',
    'btn-back-from-records',
    'btn-pause',
    'btn-resume',
    'btn-quit',
    'btn-pause-quit',
    'btn-next-level',
    'btn-retry',
    'btn-result-menu'
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) bindClickSound(el);
  });

  document.getElementById('btn-start').addEventListener('click', () => {
    const save = loadSave();
    startLevel(save.maxLevel);
  });

  document.getElementById('btn-level-select').addEventListener('click', () => {
    renderLevelGrid();
    showScreen('level');
  });

  document.getElementById('btn-records').addEventListener('click', () => {
    renderRecordsScreen();
    showScreen('records');
  });

  document.getElementById('btn-back-from-records').addEventListener('click', () => {
    showScreen('menu');
    updateMenuStats();
  });

  document.getElementById('btn-back-menu').addEventListener('click', () => {
    showScreen('menu');
    updateMenuStats();
  });

  document.querySelectorAll('.unit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!gameState || gameState.gameOver || paused) return;
      spawnUnit(btn.dataset.unit, 'player');
    });
  });

  document.getElementById('btn-pause').addEventListener('click', () => {
    paused = true;
    Sound.setBattleMusicPaused(true);
    document.getElementById('pause-overlay').classList.remove('hidden');
  });

  document.getElementById('btn-resume').addEventListener('click', () => {
    paused = false;
    Sound.setBattleMusicPaused(false);
    document.getElementById('pause-overlay').classList.add('hidden');
  });

  function exitToMenu() {
    Sound.stopBattleMusic();
    recordLevelVisit(currentLevel);
    if (animId) cancelAnimationFrame(animId);
    showScreen('menu');
    updateMenuStats();
  }

  document.getElementById('btn-quit').addEventListener('click', () => {
    document.getElementById('pause-overlay').classList.add('hidden');
    paused = false;
    exitToMenu();
  });

  document.getElementById('btn-pause-quit').addEventListener('click', () => {
    paused = false;
    document.getElementById('pause-overlay').classList.add('hidden');
    exitToMenu();
  });

  document.getElementById('btn-next-level').addEventListener('click', () => {
    document.getElementById('result-overlay').classList.add('hidden');
    if (currentLevel < LEVELS.length) startLevel(currentLevel + 1);
  });

  document.getElementById('btn-retry').addEventListener('click', () => {
    document.getElementById('result-overlay').classList.add('hidden');
    startLevel(currentLevel);
  });

  document.getElementById('btn-result-menu').addEventListener('click', () => {
    document.getElementById('result-overlay').classList.add('hidden');
    recordLevelVisit(currentLevel);
    showScreen('menu');
    updateMenuStats();
  });

  window.addEventListener('pagehide', () => {
    if (currentLevel) recordLevelVisit(currentLevel);
  });

  window.addEventListener('resize', () => {
    if (gameState) resizeCanvas();
  });

  // 快捷键
  window.addEventListener('keydown', (e) => {
    if (!gameState || gameState.gameOver || paused) return;
    const keys = { '1': 'warrior', '2': 'archer', '3': 'knight', '4': 'catapult', '5': 'mage', '6': 'speedCatapult', '7': 'holyKnight' };
    if (keys[e.key]) spawnUnit(keys[e.key], 'player');
    if (e.key === 'Escape') {
      paused = !paused;
      Sound.setBattleMusicPaused(paused);
      document.getElementById('pause-overlay').classList.toggle('hidden', !paused);
    }
  });

  // 初始化
  updateMenuStats();
  resizeCanvas();
})();
