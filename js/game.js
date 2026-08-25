/* ============================================================
   COZMOS KINGDOM
   An 8-bit style platformer starring Cozmo, the royal pup,
   on a quest to reclaim the floating kingdom from King Fang and his pups.
   ============================================================ */

(() => {
  'use strict';

  // ---------- Safe storage (some sandboxed/embedded contexts throw on access) ----------
  function safeGet(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable, ignore */ }
  }

  // ---------- Canvas setup ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width;
  const H = canvas.height;
  const GROUND_Y = H - 32;

  // ---------- Audio (synthesized, no assets) ----------
  const AudioFX = (() => {
    let actx = null;
    function ctxReady() {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      return actx;
    }
    function tone(freq, dur, type = 'square', vol = 0.08, delay = 0, slideTo = null) {
      try {
        const ac = ctxReady();
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ac.currentTime + delay);
        if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, ac.currentTime + delay + dur);
        gain.gain.setValueAtTime(vol, ac.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + dur);
        osc.connect(gain).connect(ac.destination);
        osc.start(ac.currentTime + delay);
        osc.stop(ac.currentTime + delay + dur);
      } catch (e) { /* audio unavailable */ }
    }
    return {
      unlock: ctxReady,
      jump: () => tone(330, 0.12, 'square', 0.09, 0, 520),
      doubleJump: () => tone(500, 0.1, 'square', 0.08, 0, 760),
      coin: () => { tone(880, 0.07, 'square', 0.08); tone(1320, 0.09, 'square', 0.07, 0.06); },
      stomp: () => tone(180, 0.15, 'square', 0.1, 0, 60),
      hurt: () => tone(140, 0.25, 'sawtooth', 0.12, 0, 40),
      shieldBreak: () => { tone(600, 0.08, 'square', 0.08); tone(300, 0.12, 'square', 0.07, 0.05); },
      powerup: () => { tone(523, 0.08, 'square', 0.08); tone(659, 0.08, 'square', 0.08, 0.07); tone(880, 0.12, 'square', 0.08, 0.14); },
      checkpoint: () => { tone(440, 0.06, 'square', 0.06); tone(660, 0.1, 'square', 0.06, 0.08); },
      shoot: () => tone(260, 0.08, 'sawtooth', 0.05, 0, 140),
      bossHit: () => tone(160, 0.18, 'sawtooth', 0.12, 0, 50),
      bossSlam: () => tone(80, 0.3, 'square', 0.14, 0, 40),
      bossDeath: () => { tone(220, 0.2, 'sawtooth', 0.12, 0, 500); tone(140, 0.3, 'sawtooth', 0.1, 0.15, 40); tone(90, 0.4, 'sawtooth', 0.1, 0.3, 30); },
      levelUp: () => { tone(523, 0.09, 'square', 0.09, 0); tone(659, 0.09, 'square', 0.09, 0.09); tone(784, 0.16, 'square', 0.09, 0.18); },
      gameOver: () => { tone(220, 0.2, 'sawtooth', 0.1, 0, 110); tone(150, 0.35, 'sawtooth', 0.1, 0.2, 60); },
      select: () => tone(440, 0.05, 'square', 0.06),
      note: (freq, dur, type, vol) => tone(freq, dur, type, vol),
    };
  })();

  // ---------- Background music (simple looping chiptune, WebAudio-scheduled) ----------
  const Music = (() => {
    let enabled = true;
    let nextNoteTime = 0;
    let step = 0;
    const stepDurMs = (60 / 132 / 2) * 1000;
    const bass = [110, 0, 110, 146.83, 0, 110, 0, 130.81, 110, 0, 110, 164.81, 0, 146.83, 0, 0];
    const lead = [440, 0, 0, 523.25, 0, 0, 587.33, 0, 523.25, 0, 0, 440, 0, 0, 392, 0];
    function tick(now, playing) {
      if (!enabled || !playing) return;
      if (nextNoteTime === 0) nextNoteTime = now;
      if (now >= nextNoteTime) {
        const b = bass[step % bass.length];
        const l = lead[step % lead.length];
        if (b) AudioFX.note(b, (stepDurMs / 1000) * 0.9, 'triangle', 0.045);
        if (l) AudioFX.note(l, (stepDurMs / 1000) * 0.6, 'square', 0.03);
        step++;
        nextNoteTime += stepDurMs;
      }
    }
    return {
      tick,
      toggle: () => { enabled = !enabled; },
      reset: () => { nextNoteTime = 0; step = 0; },
      get enabled() { return enabled; },
    };
  })();

  // ---------- Pixel-art sprite renderer ----------
  function drawSprite(grid, palette, x, y, cell, flip = false) {
    const rows = grid.length;
    const cols = grid[0].length;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = grid[r][c];
        if (ch === '.') continue;
        const color = palette[ch];
        if (!color) continue;
        const cx = flip ? (cols - 1 - c) : c;
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(x + cx * cell), Math.round(y + r * cell), cell, cell);
      }
    }
  }

  // Player skins - all dogs, just different coats. Cycle on the title screen.
  const SKINS = [
    { name: 'Cozmo (Classic)', F: '#332822', H: '#5a473a' },
    { name: 'Golden Pup', F: '#c9922a', H: '#f0c96a' },
    { name: 'Snow Pup', F: '#dcdce6', H: '#ffffff' },
    { name: 'Rusty Pup', F: '#8a3a1a', H: '#c9702a' },
    { name: 'Midnight Pup', F: '#1c1830', H: '#3a3458' },
  ];
  let selectedSkin = Math.min(Math.max(Number(safeGet('cozmos_skin', 0)), 0), SKINS.length - 1);
  function currentPalette() {
    const s = SKINS[selectedSkin];
    return { K: '#ffd54a', k: '#b8860b', B: '#14100e', F: s.F, H: s.H, E: '#ffffff', N: '#000000' };
  }
  const STAR_COLORS = ['#ffd54a', '#ff6a3a', '#8a3ffc', '#4ad4ff', '#ff4d6d'];
  function starPalette() {
    const c = STAR_COLORS[Math.floor(performance.now() / 90) % STAR_COLORS.length];
    return { K: '#ffffff', k: c, B: '#1a1410', F: c, H: '#ffffff', E: '#ffffff', N: '#000000' };
  }

  const DOG_RUN_A = [
    '....KKKK....', '...KkkkkK...', '..FFFFFFFF..', '.FFFFFFFFFF.',
    'BFFFFFFFFFFB', 'BFFEFFFFFNFB', 'BFFFFFFFFFFB', '.HFFFFFFFFH.',
    '.HFFFFFFFFH.', '..FF....FF..', '..FF....FF..', '.FFF....FFF.',
  ];
  const DOG_RUN_B = [
    '....KKKK....', '...KkkkkK...', '..FFFFFFFF..', '.FFFFFFFFFF.',
    'BFFFFFFFFFFB', 'BFFEFFFFFNFB', 'BFFFFFFFFFFB', '.HFFFFFFFFH.',
    '.HFFFFFFFFH.', '.FF......FF.', '.FF......FF.', 'FF........FF',
  ];
  const DOG_JUMP = [
    '....KKKK....', '...KkkkkK...', '..FFFFFFFF..', '.FFFFFFFFFF.',
    'BFFFFFFFFFFB', 'BFFEFFFFFNFB', 'BFFFFFFFFFFB', '.HFFFFFFFFH.',
    '.HFFFFFFFFH.', '.FF......FF.', '............', '............',
  ];
  const DOG_HURT = [
    '....kkkk....', '...kBBBBk...', '..FFFFFFFF..', '.FFFFFFFFFF.',
    'BFFFFFFFFFFB', 'BFFNFFFFFNFB', 'BFFFFFFFFFFB', '.HFFFFFFFFH.',
    '.HFFFFFFFFH.', '..FF....FF..', '..FF....FF..', '.FFF....FFF.',
  ];

  // Every character in the kingdom is a dog - enemies just reuse the same
  // running-dog silhouette as Cozmo, recolored, with their own headgear.
  const ROGUE_PALETTE = { K: '#3a2a1a', k: '#1a1008', B: '#1a0a08', F: '#8a2a1a', H: '#c9502a', E: '#ffffff', N: '#000000' };
  const SKY_PALETTE = { K: '#eaffff', k: '#8fd8ff', B: '#1a1a2a', F: '#8fd8ff', H: '#eaffff', E: '#000000', N: '#000000' };
  const GUARD_PALETTE = { K: '#ff4d6d', k: '#a8324a', B: '#1a1a1a', F: '#c9c9d4', H: '#ffffff', E: '#000000', N: '#000000' };
  const KINGFANG_PALETTE = { K: '#ffd54a', k: '#8a6b00', B: '#0a0a0a', F: '#2a2430', H: '#4a4058', E: '#ff4d6d', N: '#000000' };

  const COIN_PALETTE = { Y: '#ffd54a', y: '#b8860b', W: '#fff6d6' };
  const COIN_FRAMES = [
    ['.YYYY.', 'YYyyYY', 'YyWWyY', 'YyWWyY', 'YYyyYY', '.YYYY.'],
    ['..YY..', '.YyyY.', '.YWWY.', '.YWWY.', '.YyyY.', '..YY..'],
    ['.YYYY.', 'YYyyYY', 'YyWWyY', 'YyWWyY', 'YYyyYY', '.YYYY.'],
  ];

  const POWERUP_COLORS = { star: '#ffd54a', wing: '#8fd8ff', heart: '#ff4d6d', shield: '#4ad4ff' };

  // ---------- Input ----------
  const keys = {};
  const pressedOnce = {};
  let frameKeys = {};
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!keys[e.code]) pressedOnce[e.code] = true;
    keys[e.code] = true;
    AudioFX.unlock();
  }, { passive: false });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  function bindTouch(id, code) {
    const el = document.getElementById(id);
    if (!el) return;
    const on = (e) => { e.preventDefault(); if (!keys[code]) pressedOnce[code] = true; keys[code] = true; AudioFX.unlock(); };
    const off = (e) => { e.preventDefault(); keys[code] = false; };
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off, { passive: false });
    el.addEventListener('touchcancel', off, { passive: false });
    el.addEventListener('mousedown', on);
    el.addEventListener('mouseup', off);
    el.addEventListener('mouseleave', off);
  }
  bindTouch('btn-left', 'ArrowLeft');
  bindTouch('btn-right', 'ArrowRight');
  bindTouch('btn-jump', 'Space');
  bindTouch('btn-pause', 'KeyP');

  // Games embedded in a sandboxed frame don't get keyboard focus until
  // something inside them is clicked, so make the canvas itself the primary
  // "press start" control instead of depending on a keypress alone.
  function activateCanvas() {
    AudioFX.unlock();
    canvas.focus();
    if (state === STATE.TITLE) startGame();
    else if ((state === STATE.GAME_OVER || state === STATE.WIN) && stateTimer > 30) startGame();
    else if (state === STATE.PAUSED) state = STATE.PLAYING;
  }
  canvas.addEventListener('click', activateCanvas);
  // iOS Safari can be sluggish or unreliable dispatching the synthetic
  // click after a tap inside an embedded frame, so respond to the raw touch
  // directly too. preventDefault stops the follow-up click from double-firing.
  canvas.addEventListener('touchend', (e) => { e.preventDefault(); activateCanvas(); }, { passive: false });
  window.addEventListener('load', () => canvas.focus());
  canvas.focus();

  // ---------- World constants ----------
  const GRAVITY = 0.62;
  const MOVE_SPEED = 2.3;
  const JUMP_VELOCITY = -13;
  const FRICTION = 0.82;
  const COYOTE_FRAMES = 6;
  const JUMP_BUFFER_FRAMES = 7;

  // ---------- Level building helpers ----------
  function ground(x, w, y = GROUND_Y) { return { x, y, w, h: H - y + 64 }; }
  function plat(x, y, w) { return { x, y, w, h: 16 }; }
  function onPlat(p, range, opts = {}) {
    const h = opts.h || 20;
    const w = opts.w || 26;
    const margin = opts.margin != null ? opts.margin : 12;
    const maxRange = Math.max(4, (p.w - margin * 2) / 2);
    return { x: p.x + p.w / 2 - w / 2, y: p.y - h, range: Math.min(range, maxRange), type: opts.type || 'slime' };
  }
  function spike(p, frac = 0.5, w = 20) { return { x: p.x + p.w * frac - w / 2, y: p.y - 16, w, h: 16 }; }
  function above(p, h, frac = 0.5) { return { x: p.x + p.w * frac, y: p.y - h }; }

  // ---------- Level themes ----------
  const THEME = {
    MEADOW: { sky: ['#241b55', '#3a2a7a', '#6a3f8f'], groundTop: '#2c8a4a', groundFill: '#7a5230', accent: '#3fae5e', dot: '#5a3a20' },
    CLOUD: { sky: ['#16244a', '#2a3f7a', '#4f6fae'], groundTop: '#4a8fae', groundFill: '#3a5a7a', accent: '#7fc4e0', dot: '#294a63' },
    FROST: { sky: ['#0e1a33', '#1f3a63', '#5f8fc9'], groundTop: '#bfe6ff', groundFill: '#6f9fc9', accent: '#eaffff', dot: '#4a7aa0' },
    CITADEL: { sky: ['#241033', '#4a1f63', '#8a3ffc'], groundTop: '#7a4ad4', groundFill: '#4a2a6a', accent: '#c99bff', dot: '#301a4a' },
    EMBER: { sky: ['#2a0e0e', '#5a1a1a', '#c9502a'], groundTop: '#7a2a1a', groundFill: '#3a1410', accent: '#ff6a3a', dot: '#1a0a08' },
    THRONE: { sky: ['#0d0a1a', '#2a1030', '#5a1a3a'], groundTop: '#3a1a2a', groundFill: '#1a0a14', accent: '#ff4d6d', dot: '#0d0510' },
  };

  // ---------- Level definitions ----------
  function buildLevel1() {
    const g1 = ground(0, 620), g2 = ground(760, 260), g3 = ground(1160, 200);
    const pA = plat(420, GROUND_Y - 90, 110), pB = plat(900, GROUND_Y - 140, 100);
    const g4 = ground(1500, 300), pC = plat(1500, GROUND_Y - 100, 90);
    const g5 = ground(1940, 460), pD = plat(2050, GROUND_Y - 130, 120);
    return {
      name: 'Sky Meadow', theme: THEME.MEADOW, width: 2400, start: { x: 40, y: GROUND_Y - 40 },
      platforms: [g1, g2, g3, pA, pB, g4, pC, g5, pD], moving: [],
      enemies: [onPlat(g2, 90), onPlat(g3, 70), onPlat(g4, 100), onPlat(g5, 90),
        { x: pB.x + pB.w / 2 - 12, y: pB.y - 55, range: 70, type: 'flyer' }],
      hazards: [],
      powerups: [{ ...above(pB, 40, 0.5), type: 'star' }, { ...above(g5, 40, 0.15), type: 'heart' }],
      checkpoints: [{ x: g4.x + 40, y: g4.y - 48 }],
      coins: [
        { x: 460, y: GROUND_Y - 130 }, { x: 500, y: GROUND_Y - 130 },
        { x: 940, y: GROUND_Y - 180 }, { x: 980, y: GROUND_Y - 180 },
        { x: 1540, y: GROUND_Y - 140 },
        { x: 2080, y: GROUND_Y - 170 }, { x: 2120, y: GROUND_Y - 170 }, { x: 2160, y: GROUND_Y - 170 },
      ],
      goal: { x: 2340, y: GROUND_Y - 64 },
    };
  }

  function buildLevel2() {
    const g1 = ground(0, 400), pA = plat(480, GROUND_Y - 80, 100), pB = plat(660, GROUND_Y - 150, 100);
    const g2 = ground(880, 240), pC = plat(1180, GROUND_Y - 110, 90), g3 = ground(1360, 200);
    const pD = plat(1620, GROUND_Y - 160, 90), g4 = ground(1820, 220);
    const pE = plat(2100, GROUND_Y - 100, 100), pF = plat(2280, GROUND_Y - 190, 90), g5 = ground(2500, 500);
    return {
      name: 'Cloud Battlements', theme: THEME.CLOUD, width: 3000, start: { x: 40, y: GROUND_Y - 40 },
      platforms: [g1, pA, pB, g2, pC, g3, pD, g4, pE, pF, g5],
      moving: [{ axis: 'x', baseX: 1500, x: 1500, y: GROUND_Y - 60, w: 90, range: 160, speed: 1.2, dir: 1 }],
      enemies: [
        onPlat(pA, 30), onPlat(g2, 90), onPlat(g3, 80), onPlat(g4, 90), onPlat(g5, 120),
        { x: 1460, y: GROUND_Y - 190, range: 70, type: 'flyer' },
        { ...above(pF, 24, 0.5), type: 'shooter', range: 0 },
      ],
      hazards: [spike(pC, 0.5)],
      powerups: [{ ...above(pB, 40, 0.5), type: 'shield' }, { ...above(g4, 40, 0.5), type: 'heart' }],
      checkpoints: [{ x: g3.x + 40, y: g3.y - 48 }],
      coins: [
        { x: 700, y: GROUND_Y - 190 }, { x: 740, y: GROUND_Y - 190 },
        { x: 1220, y: GROUND_Y - 150 },
        { x: 1660, y: GROUND_Y - 200 }, { x: 1700, y: GROUND_Y - 200 },
        { x: 2140, y: GROUND_Y - 140 }, { x: 2320, y: GROUND_Y - 230 }, { x: 2360, y: GROUND_Y - 230 },
      ],
      goal: { x: 2920, y: GROUND_Y - 64 },
    };
  }

  function buildLevel3() {
    const g1 = ground(0, 300), p1 = plat(380, GROUND_Y - 70, 90), p2 = plat(560, GROUND_Y - 140, 80);
    const p3 = plat(740, GROUND_Y - 70, 90), g2 = ground(920, 220);
    const p4 = plat(1220, GROUND_Y - 120, 80), p5 = plat(1400, GROUND_Y - 200, 80), p6 = plat(1580, GROUND_Y - 120, 80);
    const g3 = ground(1760, 220), g4 = ground(2280, 320);
    return {
      name: 'Frost Spire', theme: THEME.FROST, width: 2600, start: { x: 40, y: GROUND_Y - 40 },
      platforms: [g1, p1, p2, p3, g2, p4, p5, p6, g3, g4],
      moving: [{ axis: 'y', x: 2060, y: GROUND_Y - 60, baseY: GROUND_Y - 60, rangeY: 100, w: 90, speed: 1.1, dir: 1 }],
      enemies: [
        onPlat(g2, 90), onPlat(g3, 90),
        { x: p2.x + p2.w / 2 - 12, y: p2.y - 50, range: 55, type: 'flyer' },
        { x: p5.x + p5.w / 2 - 12, y: p5.y - 50, range: 55, type: 'flyer' },
      ],
      hazards: [spike(g2, 0.5), spike(g3, 0.6)],
      powerups: [{ ...above(p4, 40, 0.5), type: 'wing' }],
      checkpoints: [{ x: g2.x + 40, y: g2.y - 48 }],
      coins: [
        { x: 420, y: GROUND_Y - 110 }, { x: 600, y: GROUND_Y - 180 },
        { x: 1000, y: GROUND_Y - 60 }, { x: 1260, y: GROUND_Y - 160 },
        { x: 1440, y: GROUND_Y - 240 }, { x: 1620, y: GROUND_Y - 160 },
        { x: 2340, y: GROUND_Y - 60 }, { x: 2380, y: GROUND_Y - 60 },
      ],
      goal: { x: 2520, y: GROUND_Y - 64 },
    };
  }

  function buildLevel4() {
    const g1 = ground(0, 340), pA = plat(420, GROUND_Y - 100, 90), pB = plat(600, GROUND_Y - 170, 90);
    const pC = plat(780, GROUND_Y - 100, 90), g2 = ground(980, 200), pD = plat(1280, GROUND_Y - 130, 80);
    const g3 = ground(1460, 180), pE = plat(1740, GROUND_Y - 170, 80), pF = plat(1920, GROUND_Y - 100, 80);
    const g4 = ground(2100, 200), pG = plat(2400, GROUND_Y - 140, 90), g5 = ground(2600, 220);
    const pH = plat(2900, GROUND_Y - 190, 100), g6 = ground(3080, 320);
    return {
      name: 'Star Citadel', theme: THEME.CITADEL, width: 3400, start: { x: 40, y: GROUND_Y - 40 },
      platforms: [g1, pA, pB, pC, g2, pD, g3, pE, pF, g4, pG, g5, pH, g6],
      moving: [
        { axis: 'y', x: 1560, y: GROUND_Y - 60, baseY: GROUND_Y - 60, rangeY: 90, w: 90, speed: 1.0, dir: 1 },
        { axis: 'x', baseX: 2680, x: 2680, y: GROUND_Y - 70, w: 90, range: 180, speed: 1.5, dir: 1 },
      ],
      enemies: [
        onPlat(pA, 25), onPlat(pC, 25), onPlat(g2, 80), onPlat(pD, 20), onPlat(g3, 60),
        onPlat(pF, 20), onPlat(g4, 80), onPlat(pH, 30), onPlat(g6, 100),
        { x: 1130, y: GROUND_Y - 170, range: 60, type: 'flyer' },
        { ...above(pG, 24, 0.5), type: 'shooter', range: 0 },
      ],
      hazards: [spike(g4, 0.4)],
      powerups: [{ ...above(pE, 40, 0.5), type: 'star' }, { ...above(g5, 40, 0.5), type: 'heart' }],
      checkpoints: [{ x: g2.x + 40, y: g2.y - 48 }, { x: g5.x + 40, y: g5.y - 48 }],
      coins: [
        { x: 640, y: GROUND_Y - 210 }, { x: 820, y: GROUND_Y - 140 },
        { x: 1300, y: GROUND_Y - 170 }, { x: 1340, y: GROUND_Y - 170 },
        { x: 1760, y: GROUND_Y - 210 }, { x: 1940, y: GROUND_Y - 140 },
        { x: 2420, y: GROUND_Y - 180 }, { x: 2460, y: GROUND_Y - 180 },
        { x: 2920, y: GROUND_Y - 230 }, { x: 2960, y: GROUND_Y - 230 }, { x: 3000, y: GROUND_Y - 230 },
      ],
      goal: { x: 3320, y: GROUND_Y - 64 },
    };
  }

  function buildLevel5() {
    const g1 = ground(0, 280), p1 = plat(360, GROUND_Y - 90, 80), p2 = plat(540, GROUND_Y - 160, 80);
    const p3 = plat(720, GROUND_Y - 90, 80), g2 = ground(900, 240);
    const p4 = plat(1240, GROUND_Y - 130, 70), p5 = plat(1400, GROUND_Y - 210, 70), p6 = plat(1560, GROUND_Y - 130, 70);
    const g3 = ground(1720, 240), g4 = ground(2300, 220), p7 = plat(2620, GROUND_Y - 160, 90), g5 = ground(2820, 180);
    return {
      name: 'Ember Ruins', theme: THEME.EMBER, width: 3000, start: { x: 40, y: GROUND_Y - 40 },
      platforms: [g1, p1, p2, p3, g2, p4, p5, p6, g3, g4, p7, g5],
      moving: [{ axis: 'x', baseX: 2060, x: 2060, y: GROUND_Y - 80, w: 90, range: 150, speed: 1.6, dir: 1 }],
      enemies: [
        onPlat(g2, 90), onPlat(g3, 90), onPlat(g4, 80), onPlat(g5, 80),
        { ...above(p5, 24, 0.5), type: 'shooter', range: 0 },
        { x: 2060, y: GROUND_Y - 170, range: 90, type: 'flyer' },
      ],
      hazards: [spike(g2, 0.3), spike(g2, 0.7), spike(g4, 0.5), spike(p6, 0.5, 18)],
      powerups: [{ ...above(p2, 40, 0.5), type: 'shield' }, { ...above(p7, 40, 0.5), type: 'star' }, { ...above(g3, 40, 0.5), type: 'heart' }],
      checkpoints: [{ x: g3.x + 40, y: g3.y - 48 }, { x: g4.x + 40, y: g4.y - 48 }],
      coins: [
        { x: 400, y: GROUND_Y - 130 }, { x: 780, y: GROUND_Y - 130 },
        { x: 1280, y: GROUND_Y - 170 }, { x: 1440, y: GROUND_Y - 250 }, { x: 1600, y: GROUND_Y - 170 },
        { x: 2660, y: GROUND_Y - 200 }, { x: 2700, y: GROUND_Y - 200 },
      ],
      goal: { x: 2930, y: GROUND_Y - 64 },
    };
  }

  function buildLevel6() {
    const g1 = ground(0, 900), sideL = plat(120, GROUND_Y - 90, 80), sideR = plat(700, GROUND_Y - 90, 80);
    return {
      name: "King Fang's Throne", theme: THEME.THRONE, width: 900, start: { x: 40, y: GROUND_Y - 40 },
      platforms: [g1, sideL, sideR], moving: [], enemies: [], hazards: [],
      powerups: [{ x: 440, y: GROUND_Y - 50, type: 'heart' }],
      checkpoints: [], coins: [],
      goal: null,
      boss: { x: 420, range: 220 },
    };
  }

  const LEVELS = [buildLevel1(), buildLevel2(), buildLevel3(), buildLevel4(), buildLevel5(), buildLevel6()];

  // ---------- Game state ----------
  const STATE = { TITLE: 'title', PLAYING: 'playing', PAUSED: 'paused', LEVEL_DONE: 'level_done', GAME_OVER: 'game_over', WIN: 'win' };
  let state = STATE.TITLE;
  let levelIndex = 0;
  let camX = 0;
  let stateTimer = 0;
  let introTimer = 0;
  let shake = 0;
  let hitStopTimer = 0;
  let particles = [];
  let stars = [];
  const highScore = { val: Number(safeGet('cozmos_highscore', 0)) };
  const debugLevel = parseInt(new URLSearchParams(location.search).get('level'), 10);

  function makeStars() {
    stars = [];
    for (let i = 0; i < 70; i++) {
      stars.push({ x: Math.random() * 4000, y: Math.random() * (H - 80), size: Math.random() < 0.15 ? 2 : 1, parallax: 0.15 + Math.random() * 0.35, tw: Math.random() * Math.PI * 2 });
    }
  }
  makeStars();

  const world = {
    level: null, platforms: [], moving: [], enemies: [], coins: [], hazards: [], powerups: [],
    checkpoints: [], projectiles: [], hazardWaves: [], goal: null, boss: null, width: 0,
    theme: THEME.MEADOW, respawn: { x: 40, y: 0 },
  };

  function loadLevel(idx) {
    const def = LEVELS[idx];
    world.level = def;
    world.width = def.width;
    world.theme = def.theme;
    world.platforms = def.platforms.map(p => ({ ...p }));
    world.moving = def.moving.map(m => ({ ...m, h: 16 }));
    world.enemies = def.enemies.map(e => new Enemy(e.x, e.y, e.range, e.type));
    world.coins = def.coins.map(c => ({ x: c.x, y: c.y, taken: false, anim: Math.random() * 3 }));
    world.hazards = def.hazards.map(h => ({ ...h }));
    world.powerups = def.powerups.map(p => ({ ...p, taken: false, bob: Math.random() * 10 }));
    world.checkpoints = def.checkpoints.map(c => ({ ...c, activated: false }));
    world.projectiles = [];
    world.hazardWaves = [];
    world.goal = def.goal ? { x: def.goal.x, y: def.goal.y, w: 40, h: 64 } : null;
    world.boss = def.boss ? new Boss(def.boss.x, GROUND_Y - 64, def.boss.range) : null;
    world.respawn = { x: def.start.x, y: def.start.y };
    player.x = def.start.x;
    player.y = def.start.y;
    player.vx = 0; player.vy = 0;
    player.doubleJumpCharges = 0;
    player.starTimer = 0;
    camX = 0;
    introTimer = 80;
  }

  // ---------- Player ----------
  class Player {
    constructor() {
      this.w = 30; this.h = 30;
      this.x = 40; this.y = GROUND_Y - 40;
      this.vx = 0; this.vy = 0;
      this.onGround = false;
      this.facing = 1;
      this.animTimer = 0;
      this.animFrame = 0;
      this.lives = 3;
      this.score = 0;
      this.invuln = 0;
      this.hurtFlash = 0;
      this.standingOn = null;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.shortHopped = false;
      this.usedDoubleJump = false;
      this.doubleJumpCharges = 0;
      this.starTimer = 0;
      this.shield = false;
      this.scaleX = 1; this.scaleY = 1;
      this.dustCooldown = 0;
    }
    reset() {
      this.lives = 3; this.score = 0; this.vx = 0; this.vy = 0; this.invuln = 0;
      this.starTimer = 0; this.shield = false; this.doubleJumpCharges = 0;
    }
    hurt() {
      if (this.invuln > 0) return;
      if (this.starTimer > 0) return;
      if (this.shield) {
        this.shield = false;
        this.invuln = 50;
        spawnParticles(this.x + this.w / 2, this.y + this.h / 2, '#8fd8ff', 14);
        AudioFX.shieldBreak();
        shake = 6;
        return;
      }
      this.lives--;
      this.invuln = 90;
      this.hurtFlash = 20;
      this.vy = -6;
      AudioFX.hurt();
      shake = 10;
      hitStopTimer = 5;
      if (this.lives <= 0) triggerGameOver();
    }
    update() {
      const left = keys['ArrowLeft'] || keys['KeyA'];
      const right = keys['ArrowRight'] || keys['KeyD'];
      const jumpHeld = keys['Space'] || keys['ArrowUp'] || keys['KeyW'];
      const jumpPressed = frameKeys['Space'] || frameKeys['ArrowUp'] || frameKeys['KeyW'];

      const speedMul = this.starTimer > 0 ? 1.35 : 1;
      if (left) { this.vx -= 0.6 * speedMul; this.facing = -1; }
      if (right) { this.vx += 0.6 * speedMul; this.facing = 1; }
      this.vx *= FRICTION;
      const maxSpeed = MOVE_SPEED * speedMul;
      if (Math.abs(this.vx) > maxSpeed) this.vx = maxSpeed * Math.sign(this.vx);
      if (Math.abs(this.vx) < 0.05) this.vx = 0;

      // coyote time (based on previous frame's grounded state)
      if (this.onGround) this.coyoteTimer = COYOTE_FRAMES;
      else if (this.coyoteTimer > 0) this.coyoteTimer--;

      if (jumpPressed) this.jumpBufferTimer = JUMP_BUFFER_FRAMES;
      else if (this.jumpBufferTimer > 0) this.jumpBufferTimer--;

      if (this.jumpBufferTimer > 0 && (this.onGround || this.coyoteTimer > 0)) {
        this.vy = JUMP_VELOCITY;
        this.onGround = false;
        this.coyoteTimer = 0;
        this.jumpBufferTimer = 0;
        this.shortHopped = false;
        this.scaleX = 0.7; this.scaleY = 1.3;
        AudioFX.jump();
        spawnParticles(this.x + this.w / 2, this.y + this.h, '#c9c0e0', 6);
      } else if (this.jumpBufferTimer > 0 && !this.onGround && this.doubleJumpCharges > 0 && !this.usedDoubleJump) {
        this.vy = JUMP_VELOCITY * 0.9;
        this.doubleJumpCharges--;
        this.usedDoubleJump = true;
        this.jumpBufferTimer = 0;
        this.shortHopped = false;
        this.scaleX = 0.7; this.scaleY = 1.3;
        AudioFX.doubleJump();
        spawnParticles(this.x + this.w / 2, this.y + this.h / 2, '#8fd8ff', 12);
      }

      if (!jumpHeld && this.vy < -1 && !this.shortHopped) {
        this.vy *= 0.45;
        this.shortHopped = true;
      }

      this.vy += GRAVITY;
      if (this.vy > 14) this.vy = 14;

      let carryX = 0;
      if (this.onGround && this.standingOn && this.standingOn.axis === 'x') {
        carryX = this.standingOn.vxNow || 0;
      }

      const prevVy = this.vy;

      this.x += this.vx + carryX;
      resolveCollisions(this, 'x');
      const wasOnGround = this.onGround;
      this.onGround = false;
      this.standingOn = null;
      this.y += this.vy;
      resolveCollisions(this, 'y');

      if (!wasOnGround && this.onGround) {
        this.usedDoubleJump = false;
        this.scaleX = 1.3; this.scaleY = 0.7;
        if (prevVy > 6) {
          spawnParticles(this.x + this.w / 2, this.y + this.h, '#c9c0e0', 8);
          if (prevVy > 9) AudioFX.select();
        }
      }
      this.scaleX += (1 - this.scaleX) * 0.25;
      this.scaleY += (1 - this.scaleY) * 0.25;

      if (this.x < 0) this.x = 0;
      if (this.x + this.w > world.width) this.x = world.width - this.w;

      if (this.y > H + 100) {
        this.hurt();
        if (this.lives > 0) {
          this.x = world.respawn.x;
          this.y = world.respawn.y;
          this.vx = 0; this.vy = 0;
        }
      }

      if (this.invuln > 0) this.invuln--;
      if (this.hurtFlash > 0) this.hurtFlash--;
      if (this.starTimer > 0) {
        this.starTimer--;
        if (this.dustCooldown <= 0) {
          spawnParticles(this.x + this.w / 2, this.y + this.h / 2, STAR_COLORS[Math.floor(performance.now() / 90) % STAR_COLORS.length], 2);
          this.dustCooldown = 4;
        }
      }
      if (this.dustCooldown > 0) this.dustCooldown--;

      if (Math.abs(this.vx) > 0.3 && this.onGround) {
        this.animTimer++;
        if (this.animTimer > 8) {
          this.animTimer = 0;
          this.animFrame = 1 - this.animFrame;
          if (this.dustCooldown <= 0) {
            spawnParticles(this.x + this.w / 2, this.y + this.h - 2, '#c9c0e0', 2);
            this.dustCooldown = 6;
          }
        }
      } else if (this.onGround) {
        this.animFrame = 0;
      }
    }
    get sprite() {
      if (this.hurtFlash > 0 && this.hurtFlash % 8 < 4) return DOG_HURT;
      if (!this.onGround) return DOG_JUMP;
      return this.animFrame === 0 ? DOG_RUN_A : DOG_RUN_B;
    }
    draw() {
      if (this.invuln > 0 && this.starTimer <= 0 && this.invuln % 6 < 3) return;
      const cell = 2.6;
      const spriteW = 12 * cell;
      const spriteH = 12 * cell;
      const drawX = this.x - camX + (this.w - spriteW) / 2;
      const drawY = this.y + this.h - spriteH;
      const feetX = this.x - camX + this.w / 2;
      const feetY = this.y + this.h;
      const palette = this.starTimer > 0 ? starPalette() : currentPalette();
      ctx.save();
      ctx.translate(feetX, feetY);
      ctx.scale(this.scaleX, this.scaleY);
      ctx.translate(-feetX, -feetY);
      drawSprite(this.sprite, palette, drawX, drawY, cell, this.facing < 0);
      ctx.restore();
      if (this.shield) {
        ctx.strokeStyle = 'rgba(143,216,255,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(feetX, this.y + this.h / 2, 24, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  }

  // ---------- Enemy: Rogue Pup (ground) / Sky Pup (flyer) / Guard Pup (shooter) ----------
  class Enemy {
    constructor(x, y, range, type = 'slime') {
      this.type = type;
      this.startX = x; this.x = x;
      this.startY = y; this.y = y;
      this.w = type === 'flyer' ? 24 : type === 'shooter' ? 28 : 26;
      this.h = type === 'shooter' ? 26 : type === 'flyer' ? 22 : 24;
      this.range = range || 0;
      this.dir = 1;
      this.speed = type === 'flyer' ? 1.0 + Math.random() * 0.3 : 0.8 + Math.random() * 0.4;
      this.alive = true;
      this.animTimer = Math.random() * 20;
      this.squish = 0;
      this.fireCooldown = 100 + Math.random() * 60;
    }
    update() {
      if (!this.alive) return;
      this.animTimer++;
      if (this.squish > 0) this.squish--;
      if (this.type === 'shooter') {
        this.y = this.startY + Math.sin(this.animTimer * 0.05) * 4;
        this.fireCooldown--;
        if (this.fireCooldown <= 0) {
          this.fireCooldown = 150;
          const dir = player.x < this.x ? -1 : 1;
          world.projectiles.push(new Projectile(this.x + this.w / 2, this.y + this.h / 2, dir));
          AudioFX.shoot();
        }
        return;
      }
      this.x += this.dir * this.speed;
      if (this.x < this.startX - this.range) { this.x = this.startX - this.range; this.dir = 1; }
      if (this.x > this.startX + this.range) { this.x = this.startX + this.range; this.dir = -1; }
      if (this.type === 'flyer') this.y = this.startY + Math.sin(this.animTimer * 0.06) * 18;
    }
    get rect() {
      if (this.type === 'flyer') return { x: this.x, y: this.y, w: this.w, h: this.h };
      return { x: this.x, y: this.y + 4, w: this.w, h: this.h - 4 };
    }
    draw() {
      if (!this.alive) return;
      const squishOffset = this.squish > 0 ? 4 : 0;
      const sx = this.x - camX;
      const sy = this.y + squishOffset;
      const frame = Math.floor(this.animTimer / (this.type === 'shooter' ? 20 : this.type === 'flyer' ? 10 : 16)) % 2 === 0 ? DOG_RUN_A : DOG_RUN_B;
      if (this.type === 'flyer') {
        const flap = Math.sin(this.animTimer * 0.5) * 4;
        ctx.fillStyle = SKY_PALETTE.k;
        ctx.beginPath(); ctx.ellipse(sx + 2, sy + 14 - flap, 7, 4, -0.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(sx + this.w - 2, sy + 14 + flap, 7, 4, 0.5, 0, Math.PI * 2); ctx.fill();
        drawSprite(frame, SKY_PALETTE, sx, sy, 2.0, this.dir < 0);
      } else if (this.type === 'shooter') {
        drawSprite(frame, GUARD_PALETTE, sx, sy, 2.3);
      } else {
        drawSprite(frame, ROGUE_PALETTE, sx, sy, 2.1, this.dir < 0);
      }
    }
  }

  // ---------- Projectile ----------
  class Projectile {
    constructor(x, y, dir) { this.x = x; this.y = y; this.vx = dir * 3.4; this.w = 10; this.h = 10; this.life = 240; }
    update() { this.x += this.vx; this.life--; }
    get rect() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }
    draw() {
      // Guard Pups fling tennis balls, not lasers.
      const sx = this.x - camX;
      const spin = this.x * 0.15;
      ctx.save();
      ctx.translate(sx, this.y);
      ctx.rotate(spin);
      ctx.fillStyle = '#c9e04a';
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, 5, -0.6, 1.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 5, 2.5, 4.5); ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- Boss ----------
  class Boss {
    constructor(x, y, range) {
      this.x = x; this.y = y; this.startX = x; this.range = range;
      this.w = 64; this.h = 64;
      this.hp = 3; this.maxHp = 3;
      this.dir = 1; this.speed = 1.1;
      this.state = 'patrol'; this.timer = 200;
      this.invuln = 0;
      this.animTimer = 0;
      this.cycle = 0;
      this.alive = true;
      this.doneTriggered = false;
    }
    update() {
      if (!this.alive) return;
      this.animTimer++;
      if (this.invuln > 0) this.invuln--;
      this.timer--;
      if (this.state === 'patrol') {
        this.x += this.dir * this.speed;
        if (this.x < this.startX - this.range) { this.x = this.startX - this.range; this.dir = 1; }
        if (this.x > this.startX + this.range) { this.x = this.startX + this.range; this.dir = -1; }
        if (this.timer <= 0) { this.state = 'telegraph'; this.timer = 45; }
      } else if (this.state === 'telegraph') {
        if (this.timer <= 0) {
          this.state = 'slam'; this.timer = 20;
          shake = 14;
          AudioFX.bossSlam();
          world.hazardWaves.push(
            { x: this.x + this.w / 2, y: GROUND_Y - 10, vx: -4.5, life: 55 },
            { x: this.x + this.w / 2, y: GROUND_Y - 10, vx: 4.5, life: 55 }
          );
          this.cycle++;
          if (this.cycle % 2 === 0) {
            const spawnX = this.x < this.startX ? this.x + 180 : this.x - 180;
            world.enemies.push(new Enemy(Math.max(20, spawnX), GROUND_Y - 24, 60, 'slime'));
          }
        }
      } else if (this.state === 'slam') {
        if (this.timer <= 0) { this.state = 'patrol'; this.timer = 220; }
      } else if (this.state === 'stunned') {
        if (this.timer <= 0) { this.state = 'patrol'; this.timer = 180; }
      }
    }
    get rect() { return { x: this.x, y: this.y + 10, w: this.w, h: this.h - 10 }; }
    hit() {
      if (this.invuln > 0 || this.state === 'dead') return;
      this.hp--;
      this.invuln = 70;
      hitStopTimer = 6;
      shake = 10;
      spawnParticles(this.x + this.w / 2, this.y + this.h / 2, '#ff4d6d', 20);
      AudioFX.bossHit();
      if (this.hp <= 0) {
        this.alive = false;
        this.state = 'dead';
        spawnParticles(this.x + this.w / 2, this.y + this.h / 2, '#ffd54a', 50);
        AudioFX.bossDeath();
      } else {
        this.state = 'stunned';
        this.timer = 90;
      }
    }
    draw() {
      const sx = this.x - camX;
      if (this.state === 'telegraph') {
        const pulse = 20 + Math.sin(this.animTimer * 0.6) * 8;
        ctx.fillStyle = 'rgba(255,77,109,0.35)';
        ctx.beginPath();
        ctx.ellipse(sx + this.w / 2, this.y + this.h + 4, pulse, 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (this.invuln > 0 && this.invuln % 6 < 3) return;
      const frame = Math.floor(this.animTimer / 16) % 2 === 0 ? DOG_RUN_A : DOG_RUN_B;
      drawSprite(frame, KINGFANG_PALETTE, sx, this.y, 5.3, this.dir < 0);
    }
  }

  const player = new Player();

  // ---------- Collision resolution ----------
  function allSolids() { return world.platforms.concat(world.moving); }
  function resolveCollisions(entity, axis) {
    for (const p of allSolids()) {
      if (rectsOverlap(entity, p)) {
        if (axis === 'x') {
          if (entity.vx > 0) entity.x = p.x - entity.w;
          else if (entity.vx < 0) entity.x = p.x + p.w;
          entity.vx = 0;
        } else {
          if (entity.vy > 0) {
            entity.y = p.y - entity.h;
            entity.vy = 0;
            entity.onGround = true;
            entity.standingOn = p;
          } else if (entity.vy < 0) {
            entity.y = p.y + p.h;
            entity.vy = 0;
          }
        }
      }
    }
  }
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- Particles ----------
  function spawnParticles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      particles.push({ x, y, color, vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 4 - 1, life: 30 + Math.random() * 15 });
    }
  }
  function updateParticles() {
    for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.life--; }
    particles = particles.filter(p => p.life > 0);
  }
  function drawParticles() {
    for (const p of particles) { ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x - camX), Math.round(p.y), 4, 4); }
  }

  // ---------- Power-ups ----------
  function applyPowerup(type) {
    spawnParticles(player.x + player.w / 2, player.y + player.h / 2, POWERUP_COLORS[type] || '#fff', 14);
    AudioFX.powerup();
    if (type === 'star') player.starTimer = 420;
    else if (type === 'wing') player.doubleJumpCharges = 1;
    else if (type === 'heart') player.lives = Math.min(player.lives + 1, 5);
    else if (type === 'shield') player.shield = true;
  }

  // ---------- Game flow ----------
  function startGame() {
    player.reset();
    levelIndex = (!isNaN(debugLevel) && debugLevel >= 1 && debugLevel <= LEVELS.length) ? debugLevel - 1 : 0;
    loadLevel(levelIndex);
    state = STATE.PLAYING;
    Music.reset();
    AudioFX.select();
  }

  function triggerGameOver() {
    state = STATE.GAME_OVER;
    stateTimer = 0;
    AudioFX.gameOver();
    if (player.score > highScore.val) {
      highScore.val = player.score;
      safeSet('cozmos_highscore', String(highScore.val));
    }
  }

  function nextLevel() {
    levelIndex++;
    if (levelIndex >= LEVELS.length) {
      state = STATE.WIN;
      stateTimer = 0;
      if (player.score > highScore.val) {
        highScore.val = player.score;
        safeSet('cozmos_highscore', String(highScore.val));
      }
    } else {
      loadLevel(levelIndex);
      state = STATE.PLAYING;
    }
  }

  // ---------- Update ----------
  function update() {
    frameKeys = { ...pressedOnce };
    for (const k in pressedOnce) delete pressedOnce[k];

    if (frameKeys['KeyM']) Music.toggle();

    if (state === STATE.TITLE) {
      if (frameKeys['ArrowLeft'] || frameKeys['KeyA']) {
        selectedSkin = (selectedSkin - 1 + SKINS.length) % SKINS.length;
        safeSet('cozmos_skin', String(selectedSkin));
        AudioFX.select();
      }
      if (frameKeys['ArrowRight'] || frameKeys['KeyD']) {
        selectedSkin = (selectedSkin + 1) % SKINS.length;
        safeSet('cozmos_skin', String(selectedSkin));
        AudioFX.select();
      }
      if (frameKeys['Enter'] || frameKeys['Space']) startGame();
      return;
    }
    if (state === STATE.GAME_OVER) {
      stateTimer++;
      if (stateTimer > 30 && (frameKeys['Enter'] || frameKeys['Space'])) startGame();
      return;
    }
    if (state === STATE.WIN) {
      stateTimer++;
      if (stateTimer > 30 && (frameKeys['Enter'] || frameKeys['Space'])) startGame();
      return;
    }
    if (state === STATE.LEVEL_DONE) {
      stateTimer++;
      if (stateTimer > 70) nextLevel();
      return;
    }

    if (frameKeys['KeyP']) state = state === STATE.PAUSED ? STATE.PLAYING : STATE.PAUSED;
    if (state === STATE.PAUSED) return;

    if (hitStopTimer > 0) { hitStopTimer--; return; }

    if (introTimer > 0) {
      introTimer--;
      updateParticles();
      if (shake > 0) shake--;
      return;
    }

    for (const m of world.moving) {
      if (m.axis === 'x') {
        const prevX = m.x;
        m.x += m.dir * m.speed;
        if (m.x < m.baseX - m.range) { m.x = m.baseX - m.range; m.dir = 1; }
        if (m.x > m.baseX + m.range) { m.x = m.baseX + m.range; m.dir = -1; }
        m.vxNow = m.x - prevX;
      } else {
        m.y += m.dir * m.speed;
        if (m.y < m.baseY - m.rangeY) { m.y = m.baseY - m.rangeY; m.dir = 1; }
        if (m.y > m.baseY + m.rangeY) { m.y = m.baseY + m.rangeY; m.dir = -1; }
      }
    }

    player.update();

    for (const e of world.enemies) e.update();

    for (const e of world.enemies) {
      if (!e.alive) continue;
      if (rectsOverlap(player.rect, e.rect)) {
        if (player.starTimer > 0) {
          e.alive = false; e.squish = 10; player.score += 50;
          spawnParticles(e.x + e.w / 2, e.y, '#ffd54a', 12);
          AudioFX.stomp();
          continue;
        }
        const falling = player.vy > 0 && (player.y + player.h) - e.y < 18;
        if (falling) {
          e.alive = false;
          e.squish = 10;
          player.vy = JUMP_VELOCITY * 0.6;
          player.score += 50;
          spawnParticles(e.x + e.w / 2, e.y, '#c99bff', 12);
          AudioFX.stomp();
          shake = 4;
        } else {
          player.hurt();
        }
      }
    }

    for (const h of world.hazards) {
      if (rectsOverlap(player.rect, h)) player.hurt();
    }

    for (const p of world.powerups) {
      if (p.taken) continue;
      p.bob += 0.06;
      if (rectsOverlap(player.rect, { x: p.x, y: p.y, w: 24, h: 24 })) {
        p.taken = true;
        applyPowerup(p.type);
      }
    }

    for (const c of world.checkpoints) {
      if (c.activated) continue;
      if (rectsOverlap(player.rect, { x: c.x, y: c.y - 56, w: 16, h: 56 })) {
        c.activated = true;
        world.respawn = { x: c.x, y: c.y - 40 };
        AudioFX.checkpoint();
        spawnParticles(c.x + 8, c.y - 20, '#ffd54a', 10);
      }
    }

    for (const pr of world.projectiles) {
      pr.update();
      if (rectsOverlap(player.rect, pr.rect)) {
        player.hurt();
        pr.life = 0;
      }
    }
    world.projectiles = world.projectiles.filter(pr => pr.life > 0 && pr.x > camX - 100 && pr.x < camX + W + 100);

    for (const wv of world.hazardWaves) {
      wv.x += wv.vx;
      wv.life--;
      const waveRect = { x: wv.x - 8, y: wv.y - 16, w: 16, h: 16 };
      if (rectsOverlap(player.rect, waveRect)) player.hurt();
    }
    world.hazardWaves = world.hazardWaves.filter(wv => wv.life > 0);

    if (world.boss) {
      world.boss.update();
      if (world.boss.alive && rectsOverlap(player.rect, world.boss.rect)) {
        const falling = player.vy > 0 && (player.y + player.h) - world.boss.y < 26;
        if (falling && world.boss.invuln <= 0) {
          world.boss.hit();
          player.vy = JUMP_VELOCITY * 0.7;
        } else if (world.boss.invuln <= 0 || !falling) {
          player.hurt();
        }
      }
      if (!world.boss.alive && !world.boss.doneTriggered) {
        world.boss.doneTriggered = true;
        player.score += 500;
        state = STATE.LEVEL_DONE;
        stateTimer = 0;
        AudioFX.levelUp();
      }
    }

    for (const c of world.coins) {
      if (c.taken) continue;
      c.anim += 0.05;
      const cr = { x: c.x, y: c.y, w: 24, h: 24 };
      if (rectsOverlap(player.rect, cr)) {
        c.taken = true;
        player.score += 10;
        spawnParticles(c.x + 12, c.y + 12, '#ffd54a', 8);
        AudioFX.coin();
      }
    }

    if (world.goal && rectsOverlap(player.rect, world.goal)) {
      state = STATE.LEVEL_DONE;
      stateTimer = 0;
      player.score += 200;
      AudioFX.levelUp();
    }

    updateParticles();
    if (shake > 0) shake--;

    const targetCam = player.x - W / 2;
    camX += (targetCam - camX) * 0.15;
    camX = Math.max(0, Math.min(camX, world.width - W));
  }

  // ---------- Draw helpers ----------
  function drawBackground() {
    const theme = world.theme || THEME.MEADOW;
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, theme.sky[0]);
    grad.addColorStop(0.55, theme.sky[1]);
    grad.addColorStop(1, theme.sky[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    for (const s of stars) {
      const tw = 0.6 + Math.sin(s.tw + performance.now() / 400) * 0.4;
      ctx.fillStyle = `rgba(255,255,255,${0.4 + tw * 0.6})`;
      let px = s.x - camX * s.parallax;
      px = ((px % W) + W) % W;
      ctx.fillRect(px, s.y, s.size, s.size);
    }

    ctx.fillStyle = 'rgba(20,14,40,0.5)';
    for (let i = 0; i < 6; i++) {
      const bx = (i * 500 - camX * 0.3) % (W + 400) - 200;
      ctx.fillRect(bx, H - 120 + (i % 3) * 10, 160, 24);
    }
  }

  function drawPlatform(p) {
    const theme = world.theme || THEME.MEADOW;
    ctx.fillStyle = theme.groundTop;
    ctx.fillRect(p.x - camX, p.y, p.w, 10);
    ctx.fillStyle = theme.groundFill;
    ctx.fillRect(p.x - camX, p.y + 10, p.w, p.h - 10);
    ctx.fillStyle = theme.accent;
    for (let i = 0; i < p.w; i += 8) ctx.fillRect(p.x - camX + i, p.y, 4, 4);
    ctx.fillStyle = theme.dot;
    for (let i = 4; i < p.w - 4; i += 16) ctx.fillRect(p.x - camX + i, p.y + 16, 6, 6);
  }

  function drawMoving(m) {
    ctx.fillStyle = '#c9a24a';
    ctx.fillRect(m.x - camX, m.y, m.w, 12);
    ctx.fillStyle = '#8a6b2a';
    ctx.fillRect(m.x - camX, m.y + 12, m.w, 6);
    ctx.fillStyle = '#ffe08a';
    for (let i = 0; i < m.w; i += 10) ctx.fillRect(m.x - camX + i, m.y, 4, 3);
  }

  function drawHazard(h) {
    const sx = h.x - camX;
    ctx.fillStyle = '#2a2430';
    const teeth = Math.max(1, Math.floor(h.w / 10));
    for (let i = 0; i < teeth; i++) {
      const tx = sx + i * (h.w / teeth);
      ctx.beginPath();
      ctx.moveTo(tx, h.y + h.h);
      ctx.lineTo(tx + h.w / teeth / 2, h.y);
      ctx.lineTo(tx + h.w / teeth, h.y + h.h);
      ctx.closePath();
      ctx.fillStyle = '#3a3040';
      ctx.fill();
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath();
      ctx.moveTo(tx + h.w / teeth / 2 - 2, h.y + 4);
      ctx.lineTo(tx + h.w / teeth / 2, h.y);
      ctx.lineTo(tx + h.w / teeth / 2 + 2, h.y + 4);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawHazardWave(wv) {
    const sx = wv.x - camX;
    const alpha = Math.min(1, wv.life / 55);
    ctx.fillStyle = `rgba(255,106,58,${alpha})`;
    ctx.fillRect(sx - 8, wv.y - 14, 16, 14);
    ctx.fillStyle = `rgba(255,213,74,${alpha * 0.8})`;
    ctx.fillRect(sx - 4, wv.y - 18, 8, 6);
  }

  function drawCoin(c) {
    if (c.taken) return;
    const frame = COIN_FRAMES[Math.floor(c.anim) % COIN_FRAMES.length];
    drawSprite(frame, COIN_PALETTE, c.x - camX, c.y + Math.sin(c.anim * 2) * 3, 4);
  }

  function drawPowerup(p) {
    if (p.taken) return;
    const sx = p.x - camX;
    const sy = p.y + Math.sin(p.bob) * 4;
    const pulse = 0.85 + Math.sin(p.bob * 2) * 0.15;
    ctx.save();
    ctx.translate(sx + 12, sy + 12);
    ctx.scale(pulse, pulse);
    if (p.type === 'star') {
      ctx.fillStyle = '#ffd54a';
      drawStarShape(0, 0, 5, 11, 5);
      ctx.fillStyle = '#fff6d6';
      drawStarShape(0, 0, 5, 5, 2.2);
    } else if (p.type === 'wing') {
      ctx.fillStyle = '#8fd8ff';
      ctx.beginPath();
      ctx.ellipse(-4, 0, 9, 6, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(4, 0, 9, 6, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#eaffff';
      ctx.fillRect(-2, -2, 4, 4);
    } else if (p.type === 'heart') {
      ctx.fillStyle = '#ff4d6d';
      ctx.fillRect(-8, -6, 6, 6); ctx.fillRect(2, -6, 6, 6);
      ctx.fillRect(-8, 0, 16, 4);
      ctx.fillRect(-6, 4, 12, 4);
      ctx.fillRect(-3, 8, 6, 3);
    } else if (p.type === 'shield') {
      ctx.fillStyle = '#4ad4ff';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0d0a1a';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawStarShape(cx, cy, spikes, outerR, innerR) {
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
      let x = cx + Math.cos(rot) * outerR, y = cy + Math.sin(rot) * outerR;
      ctx.lineTo(x, y);
      rot += step;
      x = cx + Math.cos(rot) * innerR; y = cy + Math.sin(rot) * innerR;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerR);
    ctx.closePath();
    ctx.fill();
  }

  function drawCheckpoint(c) {
    const sx = c.x - camX;
    ctx.fillStyle = '#5a4a3a';
    ctx.fillRect(sx, c.y - 56, 4, 56);
    const flutter = Math.sin(performance.now() / 200 + c.x) * 3;
    ctx.fillStyle = c.activated ? '#ffd54a' : '#5a5568';
    ctx.beginPath();
    ctx.moveTo(sx + 4, c.y - 56);
    ctx.lineTo(sx + 22 + flutter, c.y - 48);
    ctx.lineTo(sx + 4, c.y - 40);
    ctx.closePath();
    ctx.fill();
  }

  function drawGoal() {
    const g = world.goal;
    if (!g) return;
    const gx = g.x - camX;
    for (let i = 0; i < 4; i++) {
      const r = 10 + i * 8 + (performance.now() / 40 % 8);
      ctx.strokeStyle = `rgba(255,213,74,${0.5 - i * 0.1})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(gx + g.w / 2, g.y + g.h / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd54a';
    ctx.fillRect(gx + g.w / 2 - 3, g.y - 30, 6, g.h + 30);
    ctx.beginPath();
    ctx.moveTo(gx + g.w / 2 + 3, g.y - 30);
    ctx.lineTo(gx + g.w / 2 + 26, g.y - 22);
    ctx.lineTo(gx + g.w / 2 + 3, g.y - 14);
    ctx.closePath();
    ctx.fillStyle = '#8a3ffc';
    ctx.fill();
  }

  function drawHeart(x, y, filled) {
    ctx.fillStyle = filled ? '#ff4d6d' : '#3a2a55';
    ctx.fillRect(x, y, 3, 3); ctx.fillRect(x + 6, y, 3, 3);
    ctx.fillRect(x, y + 3, 9, 3);
    ctx.fillRect(x + 1, y + 6, 7, 3);
    ctx.fillRect(x + 2, y + 9, 5, 2);
  }

  function drawHUD() {
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#0d0a1a';
    ctx.fillRect(0, 0, W, 26);
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, 0, W, 26);
    ctx.globalAlpha = 1;

    for (let i = 0; i < Math.max(3, player.lives); i++) drawHeart(10 + i * 16, 8, i < player.lives);

    ctx.fillStyle = '#ffd54a';
    ctx.fillText('SCORE ' + String(player.score).padStart(5, '0'), W / 2 - 60, 8);

    ctx.fillStyle = '#a9e0ff';
    ctx.fillText('LVL ' + (levelIndex + 1) + '/' + LEVELS.length, W - 130, 8);

    ctx.fillStyle = Music.enabled ? '#ffd54a' : '#5a5568';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillText(Music.enabled ? '♪' : '♪/', W - 20, 8);

    if (player.doubleJumpCharges > 0) {
      ctx.fillStyle = '#8fd8ff';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText('WING READY', 10, H - 16);
    }

    if (world.boss && world.boss.alive) {
      const barW = 200;
      const bx = W / 2 - barW / 2;
      ctx.fillStyle = '#0d0a1a';
      ctx.fillRect(bx - 2, 32, barW + 4, 12);
      ctx.fillStyle = '#3a1a2a';
      ctx.fillRect(bx, 34, barW, 8);
      ctx.fillStyle = '#ff4d6d';
      ctx.fillRect(bx, 34, barW * (world.boss.hp / world.boss.maxHp), 8);
      ctx.fillStyle = '#ffd54a';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('KING FANG', W / 2, 46);
      ctx.textAlign = 'left';
    }
  }

  function centerText(lines, startY, size = 14, color = '#ffd54a', gap = 24) {
    ctx.textAlign = 'center';
    lines.forEach((line, i) => {
      ctx.font = `${line.size || size}px "Press Start 2P", monospace`;
      ctx.fillStyle = line.color || color;
      ctx.fillText(line.text, W / 2, startY + i * gap);
    });
    ctx.textAlign = 'left';
  }

  function drawOverlayPanel() {
    ctx.fillStyle = 'rgba(13,10,26,0.72)';
    ctx.fillRect(0, 0, W, H);
  }

  function drawLevelIntro() {
    const alpha = introTimer > 20 ? 1 : introTimer / 20;
    ctx.fillStyle = `rgba(13,10,26,${0.5 * alpha})`;
    ctx.fillRect(0, H / 2 - 34, W, 68);
    ctx.globalAlpha = alpha;
    centerText([
      { text: 'LEVEL ' + (levelIndex + 1), size: 12, color: '#a9e0ff' },
      { text: world.level.name.toUpperCase(), size: 16, color: '#ffd54a' },
    ], H / 2 - 18, 16, '#ffd54a', 22);
    ctx.globalAlpha = 1;
  }

  // ---------- Draw ----------
  function draw() {
    ctx.save();
    let dx = 0, dy = 0;
    if (shake > 0) { dx = (Math.random() - 0.5) * shake; dy = (Math.random() - 0.5) * shake; }
    ctx.translate(dx, dy);

    if (state === STATE.TITLE) {
      world.theme = THEME.MEADOW;
      drawBackground();
      drawTitleScreen();
      ctx.restore();
      return;
    }

    drawBackground();
    for (const p of world.platforms) drawPlatform(p);
    for (const m of world.moving) drawMoving(m);
    for (const h of world.hazards) drawHazard(h);
    for (const c of world.checkpoints) drawCheckpoint(c);
    for (const c of world.coins) drawCoin(c);
    for (const p of world.powerups) drawPowerup(p);
    drawGoal();
    for (const wv of world.hazardWaves) drawHazardWave(wv);
    for (const e of world.enemies) e.draw();
    for (const pr of world.projectiles) pr.draw();
    if (world.boss) world.boss.draw();
    player.draw();
    drawParticles();
    drawHUD();

    if (introTimer > 0) drawLevelIntro();

    if (state === STATE.PAUSED) {
      drawOverlayPanel();
      centerText([{ text: 'PAUSED', size: 20 }, { text: 'CLICK OR PRESS P TO RESUME', size: 9, color: '#f4f1ff' }], H / 2 - 20, 20, '#ffd54a', 30);
    }
    if (state === STATE.LEVEL_DONE) {
      drawOverlayPanel();
      const isLast = levelIndex >= LEVELS.length - 1;
      centerText([
        { text: isLast ? 'THE KINGDOM IS SAVED!' : 'LEVEL CLEAR!', size: 16 },
        { text: world.level.name.toUpperCase(), size: 9, color: '#a9e0ff' },
      ], H / 2 - 20, 16, '#ffd54a', 26);
    }
    if (state === STATE.GAME_OVER) {
      drawOverlayPanel();
      centerText([
        { text: 'GAME OVER', size: 20 },
        { text: 'SCORE ' + player.score, size: 10, color: '#f4f1ff' },
        { text: 'BEST ' + highScore.val, size: 10, color: '#a9e0ff' },
        { text: 'CLICK TO RETRY', size: 9, color: '#ffd54a' },
      ], H / 2 - 40, 20, '#ff4d6d', 26);
    }
    if (state === STATE.WIN) {
      drawOverlayPanel();
      centerText([
        { text: 'KINGDOM SAVED!', size: 18 },
        { text: 'COZMO WEARS THE CROWN', size: 9, color: '#a9e0ff' },
        { text: 'SCORE ' + player.score, size: 10, color: '#f4f1ff' },
        { text: 'BEST ' + highScore.val, size: 10, color: '#f4f1ff' },
        { text: 'CLICK TO PLAY AGAIN', size: 9, color: '#ffd54a' },
      ], H / 2 - 60, 18, '#ffd54a', 26);
    }

    ctx.restore();
  }

  function drawTitleScreen() {
    const cell = 4;
    const bob = Math.sin(performance.now() / 300) * 4;
    drawSprite(DOG_RUN_A, currentPalette(), W / 2 - 24, 88 + bob, cell);

    centerText([{ text: 'COZMOS KINGDOM', size: 20 }], 30, 20, '#ffd54a');

    centerText([{ text: '◀  ' + SKINS[selectedSkin].name.toUpperCase() + '  ▶', size: 9, color: '#8fd8ff' }], 150, 9);

    centerText([
      { text: 'King Fang and his rogue pups', size: 7, color: '#e6e0ff' },
      { text: 'stole the crown! Cross 6 sky-', size: 7, color: '#e6e0ff' },
      { text: 'kingdoms and beat the boss!', size: 7, color: '#e6e0ff' },
    ], 170, 7, '#e6e0ff', 12);

    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    if (blink) centerText([{ text: 'CLICK OR TAP TO START', size: 11 }], 212, 11, '#ffd54a');

    ctx.textAlign = 'center';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = '#a9e0ff';
    ctx.fillText('BEST SCORE: ' + highScore.val, W / 2, 234);
    ctx.fillStyle = '#8fd8ff';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillText('ARROWS: CHANGE SKIN', W / 2, 250);
    ctx.fillText('M: MUSIC   P: PAUSE', W / 2, 262);
    ctx.textAlign = 'left';
  }

  // ---------- Main loop ----------
  function loop(now) {
    update();
    draw();
    Music.tick(now || performance.now(), state === STATE.PLAYING);
    requestAnimationFrame(loop);
  }

  loadLevel(0);
  state = STATE.TITLE;
  requestAnimationFrame(loop);
})();
