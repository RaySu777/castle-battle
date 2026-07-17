(function () {
  'use strict';

  const MASTER_VOLUME = 0.55;

  const THROTTLE_MS = {
    melee: 70,
    shoot: 90,
    catapult: 140,
    explosion: 100,
    castle_hit: 120,
    death: 60,
    spawn: 80,
    click: 50
  };

  const CLIPS = {
    win: { file: '音效/过关.wav', volume: 0.75 },
    archer_shoot: { file: '音效/弓箭手射箭.wav', volume: 0.65, throttle: 'shoot' },
    shoot: { file: '音效/弓箭手射箭.wav', volume: 0.55, throttle: 'shoot' },
    catapult: { file: '音效/拉开弓箭射出.wav', volume: 0.5, offset: 0, duration: 1.4, throttle: 'catapult' },
    knight_spawn: { file: '音效/骏马奔驰嘶鸣声马蹄声.wav', volume: 0.45, offset: 0, duration: 2.2, throttle: 'spawn' },
    battle_bgm: { file: '音效/12649.wav', volume: 0.22, loop: true }
  };

  let ctx = null;
  let unlocked = false;
  const lastPlayed = {};
  const buffers = {};
  let bgmSource = null;
  let bgmGain = null;
  let bgmOut = null;
  let wantsBattleMusic = false;
  let bgmPaused = false;
  let preloadDone = false;

  function ensureContext() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    return ctx;
  }

  function unlock() {
    const audioCtx = ensureContext();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    unlocked = true;
  }

  function canPlay(name) {
    if (!unlocked) return false;
    const minGap = THROTTLE_MS[name] || 0;
    const now = performance.now();
    if (now - (lastPlayed[name] || 0) < minGap) return false;
    lastPlayed[name] = now;
    return true;
  }

  function masterGain(value) {
    const g = ctx.createGain();
    g.gain.value = value * MASTER_VOLUME;
    g.connect(ctx.destination);
    return g;
  }

  async function loadClip(key, clip) {
    const response = await fetch(encodeURI(clip.file));
    if (!response.ok) throw new Error(`Failed to load ${clip.file}`);
    const arrayBuffer = await response.arrayBuffer();
    const audioCtx = ensureContext();
    if (!audioCtx) return;
    buffers[key] = await audioCtx.decodeAudioData(arrayBuffer);
  }

  async function preload() {
    if (!ensureContext()) return;
    await Promise.all(
      Object.entries(CLIPS).map(([key, clip]) => loadClip(key, clip).catch(() => {}))
    );
    preloadDone = true;
    if (wantsBattleMusic) startBattleMusic();
  }

  function playBuffer(key, options = {}) {
    const clip = CLIPS[key];
    const buffer = buffers[key];
    if (!clip || !buffer) return false;

    const throttleKey = clip.throttle || key;
    const isLoop = clip.loop || options.loop;
    if (!isLoop && !canPlay(throttleKey)) return false;
    if (!ensureContext()) return false;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    if (isLoop) {
      source.loop = true;
    }

    const gain = ctx.createGain();
    const out = masterGain(options.volume ?? clip.volume ?? 1);
    gain.connect(out);
    source.connect(gain);

    const offset = options.offset ?? clip.offset ?? 0;
    const duration = options.duration ?? clip.duration;
    if (duration != null) {
      source.start(0, offset, duration);
    } else {
      source.start(0, offset);
    }
    return { source, gain, out };
  }

  function playTone(freq, duration, type, volume, options = {}) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const out = masterGain(volume);

    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (options.freqEnd) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(options.freqEnd, 20),
        ctx.currentTime + duration
      );
    }

    gain.gain.setValueAtTime(options.attack ?? 0.02, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + (options.attack ?? 0.02));
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(out);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration + 0.05);
  }

  function playNoise(duration, volume, filterFreq) {
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;

    const gain = ctx.createGain();
    const out = masterGain(volume);

    gain.gain.setValueAtTime(1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    source.start(ctx.currentTime);
    source.stop(ctx.currentTime + duration + 0.05);
  }

  const SYNTH = {
    click() {
      playTone(880, 0.06, 'sine', 0.25);
      playTone(1320, 0.04, 'sine', 0.12);
    },

    spawn() {
      playTone(180, 0.12, 'square', 0.18, { freqEnd: 420, attack: 0.01 });
      playNoise(0.06, 0.08, 2000);
    },

    melee() {
      playNoise(0.07, 0.35, 900);
      playTone(120, 0.1, 'triangle', 0.3, { freqEnd: 60 });
    },

    explosion() {
      playNoise(0.25, 0.45, 600);
      playTone(80, 0.3, 'sine', 0.35, { freqEnd: 30 });
    },

    death() {
      playTone(320, 0.18, 'sawtooth', 0.2, { freqEnd: 80 });
    },

    castle_hit() {
      playTone(70, 0.25, 'square', 0.4, { freqEnd: 35 });
      playNoise(0.12, 0.3, 500);
    },

    shoot() {
      playTone(600, 0.08, 'sawtooth', 0.15, { freqEnd: 200 });
      playNoise(0.05, 0.1, 3000);
    },

    win() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        const t = ctx.currentTime + i * 0.12;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const out = masterGain(0.3);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(1, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.connect(gain);
        gain.connect(out);
        osc.start(t);
        osc.stop(t + 0.4);
      });
    },

    lose() {
      const notes = [392, 349, 311, 262];
      notes.forEach((freq, i) => {
        const t = ctx.currentTime + i * 0.18;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const out = masterGain(0.28);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(1, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.connect(gain);
        gain.connect(out);
        osc.start(t);
        osc.stop(t + 0.45);
      });
    }
  };

  function playSynth(name) {
    const throttleKey = THROTTLE_MS[name] !== undefined ? name : null;
    if (throttleKey && !canPlay(throttleKey)) return;
    if (!ensureContext()) return;
    const fn = SYNTH[name];
    if (!fn) return;
    try {
      fn();
    } catch {
      // ignore playback errors
    }
  }

  function play(name) {
    if (!unlocked) return;
    if (!ensureContext()) return;

    if (name === 'win') {
      stopBattleMusic();
      if (playBuffer('win')) return;
    }

    playSynth(name);
  }

  function playSpawn(unitType) {
    if (!unlocked) return;
    if (!ensureContext()) return;

    if ((unitType === 'knight' || unitType === 'holyKnight') && playBuffer('knight_spawn')) return;
    playSynth('spawn');
  }

  function playAttack(unit) {
    if (!unit) return;
    if (!unlocked) return;
    if (!ensureContext()) return;

    if (unit.projectile) {
      if (unit.siege || unit.type === 'mage') {
        if (playBuffer('catapult')) return;
      } else if (unit.type === 'archer') {
        if (playBuffer('archer_shoot')) return;
      } else if (playBuffer('shoot')) {
        return;
      }
      playSynth('shoot');
      return;
    }

    playSynth('melee');
  }

  function startBattleMusic() {
    if (!unlocked) return;
    wantsBattleMusic = true;
    bgmPaused = false;
    stopBattleMusic(true);
    if (!preloadDone || !buffers.battle_bgm) return;
    const playback = playBuffer('battle_bgm', { loop: true });
    if (!playback) return;
    bgmSource = playback.source;
    bgmGain = playback.gain;
    bgmOut = playback.out;
  }

  function stopBattleMusic(keepIntent = false) {
    if (!keepIntent) wantsBattleMusic = false;
    bgmPaused = false;
    if (!bgmSource) return;
    try {
      bgmSource.stop();
    } catch {
      // already stopped
    }
    bgmSource = null;
    bgmGain = null;
    bgmOut = null;
  }

  function setBattleMusicPaused(paused) {
    if (!bgmOut || !ctx) return;
    bgmPaused = paused;
    const clip = CLIPS.battle_bgm;
    const vol = paused ? 0 : (clip.volume ?? 1) * MASTER_VOLUME;
    bgmOut.gain.setValueAtTime(vol, ctx.currentTime);
  }

  function bindUnlock() {
    const unlockOnce = () => {
      unlock();
      preload();
      document.removeEventListener('click', unlockOnce, true);
      document.removeEventListener('keydown', unlockOnce, true);
    };
    document.addEventListener('click', unlockOnce, true);
    document.addEventListener('keydown', unlockOnce, true);
  }

  bindUnlock();
  preload();

  window.Sound = {
    play,
    playSpawn,
    playAttack,
    startBattleMusic,
    stopBattleMusic,
    setBattleMusicPaused,
    unlock
  };
})();
