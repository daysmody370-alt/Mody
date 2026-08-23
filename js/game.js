/* ============================================================
   COZMOS KINGDOM
   An 8-bit style platformer starring Cozmo, the royal pup,
   on a quest to reclaim the floating kingdom from Star Slimes.
   ============================================================ */

(() => {
  'use strict';

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
      coin: () => { tone(880, 0.07, 'square', 0.08); tone(1320, 0.09, 'square', 0.07, 0.06); },
      stomp: () => tone(180, 0.15, 'square', 0.1, 0, 60),
      hurt: () => tone(140, 0.25, 'sawtooth', 0.12, 0, 40),
      levelUp: () => { tone(523, 0.09, 'square', 0.09, 0); tone(659, 0.09, 'square', 0.09, 0.09); tone(784, 0.16, 'square', 0.09, 0.18); },
      gameOver: () => { tone(220, 0.2, 'sawtooth', 0.1, 0, 110); tone(150, 0.35, 'sawtooth', 0.1, 0.2, 60); },
      select: () => tone(440, 0.05, 'square', 0.06),
    };
  })();

  // ---------- Pixel-art sprite renderer ----------
  // Draws a grid of characters as chunky pixels using a palette map.
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

  const DOG_PALETTE = {
    K: '#ffd54a', // crown gold
    k: '#b8860b', // crown shadow
    B: '#14100e', // darkest fur (outline)
    F: '#332822', // main fur
    H: '#5a473a', // highlight fur
    E: '#ffffff', // eye
    N: '#000000', // nose
  };

  const DOG_RUN_A = [
    '....KKKK....',
    '...KkkkkK...',
    '..FFFFFFFF..',
    '.FFFFFFFFFF.',
    'BFFFFFFFFFFB',
    'BFFEFFFFFNFB',
    'BFFFFFFFFFFB',
    '.HFFFFFFFFH.',
    '.HFFFFFFFFH.',
    '..FF....FF..',
    '..FF....FF..',
    '.FFF....FFF.',
  ];
  const DOG_RUN_B = [
    '....KKKK....',
    '...KkkkkK...',
    '..FFFFFFFF..',
    '.FFFFFFFFFF.',
    'BFFFFFFFFFFB',
    'BFFEFFFFFNFB',
    'BFFFFFFFFFFB',
    '.HFFFFFFFFH.',
    '.HFFFFFFFFH.',
    '.FF......FF.',
    '.FF......FF.',
    'FF........FF',
  ];
  const DOG_JUMP = [
    '....KKKK....',
    '...KkkkkK...',
    '..FFFFFFFF..',
    '.FFFFFFFFFF.',
    'BFFFFFFFFFFB',
    'BFFEFFFFFNFB',
    'BFFFFFFFFFFB',
    '.HFFFFFFFFH.',
    '.HFFFFFFFFH.',
    '.FF......FF.',
    '............',
    '............',
  ];
  const DOG_HURT = [
    '....kkkk....',
    '...kBBBBk...',
    '..FFFFFFFF..',
    '.FFFFFFFFFF.',
    'BFFFFFFFFFFB',
    'BFFNFFFFFNFB',
    'BFFFFFFFFFFB',
    '.HFFFFFFFFH.',
    '.HFFFFFFFFH.',
    '..FF....FF..',
    '..FF....FF..',
    '.FFF....FFF.',
  ];

  const SLIME_PALETTE = {
    B: '#0d0a1a',
    P: '#8a3ffc',
    p: '#c99bff',
    E: '#ffffff',
    N: '#000000',
  };
  const SLIME_A = [
    '..PPPPPP..',
    '.PppppppP.',
    'PpPpppPpPP',
    'PppEppEppP',
    'PppppppppP',
    'PppNppNppP',
    'BPPPPPPPPB',
    '.B..BB..B.',
  ];
  const SLIME_B = [
    '..........',
    '..PPPPPP..',
    '.PppppppP.',
    'PpPpppPpPP',
    'PppEppEppP',
    'PppNppNppP',
    'BPPPPPPPPB',
    '.BB....BB.',
  ];

  const COIN_PALETTE = { Y: '#ffd54a', y: '#b8860b', W: '#fff6d6' };
  const COIN_FRAMES = [
    ['.YYYY.', 'YYyyYY', 'YyWWyY', 'YyWWyY', 'YYyyYY', '.YYYY.'],
    ['..YY..', '.YyyY.', '.YWWY.', '.YWWY.', '.YyyY.', '..YY..'],
    ['.YYYY.', 'YYyyYY', 'YyWWyY', 'YyWWyY', 'YYyyYY', '.YYYY.'],
  ];

  // ---------- Input ----------
  const keys = {};
  const pressedOnce = {};
  let frameKeys = {}; // snapshot of pressedOnce consumed exactly once per update tick
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

  // ---------- World constants ----------
  const GRAVITY = 0.62;
  const MOVE_SPEED = 2.2;
  const JUMP_VELOCITY = -10.5;
  const FRICTION = 0.82;
  const TILE = 32;

  // ---------- Level data ----------
  // Platforms are floating pixel-art "sky islands" of Cozmos Kingdom.
  function ground(x, w, y = GROUND_Y) { return { x, y, w, h: H - y + 64 }; }
  function plat(x, y, w) { return { x, y, w, h: 16 }; }

  const LEVELS = [
    {
      name: 'Sky Meadow',
      width: 2400,
      start: { x: 40, y: GROUND_Y - 40 },
      platforms: [
        ground(0, 620),
        ground(760, 260),
        ground(1160, 200),
        plat(420, GROUND_Y - 90, 110),
        plat(900, GROUND_Y - 140, 100),
        ground(1500, 300),
        plat(1500, GROUND_Y - 100, 90),
        ground(1940, 460),
        plat(2050, GROUND_Y - 130, 120),
      ],
      moving: [],
      enemies: [
        { x: 850, range: 90 },
        { x: 1250, range: 70 },
        { x: 1620, range: 100 },
        { x: 2100, range: 90 },
      ],
      coins: [
        { x: 460, y: GROUND_Y - 130 }, { x: 500, y: GROUND_Y - 130 },
        { x: 940, y: GROUND_Y - 180 }, { x: 980, y: GROUND_Y - 180 },
        { x: 1540, y: GROUND_Y - 140 },
        { x: 2080, y: GROUND_Y - 170 }, { x: 2120, y: GROUND_Y - 170 }, { x: 2160, y: GROUND_Y - 170 },
      ],
      goal: { x: 2340, y: GROUND_Y - 64 },
    },
    {
      name: 'Cloud Battlements',
      width: 3000,
      start: { x: 40, y: GROUND_Y - 40 },
      platforms: [
        ground(0, 400),
        plat(480, GROUND_Y - 80, 100),
        plat(660, GROUND_Y - 150, 100),
        ground(880, 240),
        plat(1180, GROUND_Y - 110, 90),
        ground(1360, 200),
        plat(1620, GROUND_Y - 160, 90),
        ground(1820, 220),
        plat(2100, GROUND_Y - 100, 100),
        plat(2280, GROUND_Y - 190, 90),
        ground(2500, 500),
      ],
      moving: [
        { x: 1500, y: GROUND_Y - 60, w: 90, range: 160, speed: 1.2, axis: 'x', dir: 1, baseX: 1500 },
      ],
      enemies: [
        { x: 520, y: GROUND_Y - 100, range: 30 },
        { x: 920, range: 90 },
        { x: 1400, range: 80 },
        { x: 1860, range: 90 },
        { x: 2550, range: 120 },
        { x: 2750, range: 90 },
      ],
      coins: [
        { x: 700, y: GROUND_Y - 190 }, { x: 740, y: GROUND_Y - 190 },
        { x: 1220, y: GROUND_Y - 150 },
        { x: 1660, y: GROUND_Y - 200 }, { x: 1700, y: GROUND_Y - 200 },
        { x: 2140, y: GROUND_Y - 140 }, { x: 2320, y: GROUND_Y - 230 }, { x: 2360, y: GROUND_Y - 230 },
      ],
      goal: { x: 2920, y: GROUND_Y - 64 },
    },
    {
      name: 'Star Citadel',
      width: 3400,
      start: { x: 40, y: GROUND_Y - 40 },
      platforms: [
        ground(0, 340),
        plat(420, GROUND_Y - 100, 90),
        plat(600, GROUND_Y - 170, 90),
        plat(780, GROUND_Y - 100, 90),
        ground(980, 200),
        plat(1280, GROUND_Y - 130, 80),
        ground(1460, 180),
        plat(1740, GROUND_Y - 170, 80),
        plat(1920, GROUND_Y - 100, 80),
        ground(2100, 200),
        plat(2400, GROUND_Y - 140, 90),
        ground(2600, 220),
        plat(2900, GROUND_Y - 190, 100),
        ground(3080, 320),
      ],
      moving: [
        { x: 1560, y: GROUND_Y - 60, w: 90, range: 0, speed: 1.0, axis: 'y', dir: 1, baseY: GROUND_Y - 60, rangeY: 90 },
        { x: 2680, y: GROUND_Y - 70, w: 90, range: 180, speed: 1.5, axis: 'x', dir: 1, baseX: 2680 },
      ],
      enemies: [
        { x: 460, y: GROUND_Y - 120, range: 25 },
        { x: 830, y: GROUND_Y - 120, range: 25 },
        { x: 1050, range: 80 },
        { x: 1320, y: GROUND_Y - 150, range: 20 },
        { x: 1520, range: 60 },
        { x: 1980, y: GROUND_Y - 120, range: 20 },
        { x: 2150, range: 80 },
        { x: 2960, y: GROUND_Y - 210, range: 30 },
        { x: 3150, range: 100 },
      ],
      coins: [
        { x: 640, y: GROUND_Y - 210 }, { x: 820, y: GROUND_Y - 140 },
        { x: 1300, y: GROUND_Y - 170 }, { x: 1340, y: GROUND_Y - 170 },
        { x: 1760, y: GROUND_Y - 210 }, { x: 1940, y: GROUND_Y - 140 },
        { x: 2420, y: GROUND_Y - 180 }, { x: 2460, y: GROUND_Y - 180 },
        { x: 2920, y: GROUND_Y - 230 }, { x: 2960, y: GROUND_Y - 230 }, { x: 3000, y: GROUND_Y - 230 },
      ],
      goal: { x: 3320, y: GROUND_Y - 64 },
    },
  ];

  // ---------- Game state ----------
  const STATE = { TITLE: 'title', PLAYING: 'playing', PAUSED: 'paused', LEVEL_DONE: 'level_done', GAME_OVER: 'game_over', WIN: 'win' };
  let state = STATE.TITLE;
  let levelIndex = 0;
  let camX = 0;
  let stateTimer = 0;
  let shake = 0;
  let particles = [];
  let stars = [];
  const highScore = { val: Number(localStorage.getItem('cozmos_highscore') || 0) };

  function makeStars() {
    stars = [];
    for (let i = 0; i < 70; i++) {
      stars.push({
        x: Math.random() * 4000,
        y: Math.random() * (H - 80),
        size: Math.random() < 0.15 ? 2 : 1,
        parallax: 0.15 + Math.random() * 0.35,
        tw: Math.random() * Math.PI * 2,
      });
    }
  }
  makeStars();

  const world = { level: null, platforms: [], moving: [], enemies: [], coins: [], goal: null, width: 0 };

  function loadLevel(idx) {
    const def = LEVELS[idx];
    world.level = def;
    world.width = def.width;
    world.platforms = def.platforms.map(p => ({ ...p }));
    world.moving = def.moving.map(m => ({ ...m, x: m.axis === 'y' ? m.x : m.baseX, y: m.axis === 'y' ? m.baseY : m.y, h: 16 }));
    world.enemies = def.enemies.map(e => new Enemy(e.x, e.y !== undefined ? e.y : GROUND_Y - 20, e.range));
    world.coins = def.coins.map(c => ({ x: c.x, y: c.y, taken: false, anim: Math.random() * 3 }));
    world.goal = { x: def.goal.x, y: def.goal.y, w: 40, h: 64 };
    player.x = def.start.x;
    player.y = def.start.y;
    player.vx = 0; player.vy = 0;
    camX = 0;
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
    }
    reset() {
      this.lives = 3; this.score = 0; this.vx = 0; this.vy = 0; this.invuln = 0;
    }
    hurt() {
      if (this.invuln > 0) return;
      this.lives--;
      this.invuln = 90;
      this.hurtFlash = 20;
      this.vy = -6;
      AudioFX.hurt();
      shake = 10;
      if (this.lives <= 0) {
        triggerGameOver();
      }
    }
    update() {
      const left = keys['ArrowLeft'] || keys['KeyA'];
      const right = keys['ArrowRight'] || keys['KeyD'];
      const jumpKey = keys['Space'] || keys['ArrowUp'] || keys['KeyW'];

      if (left) { this.vx -= 0.6; this.facing = -1; }
      if (right) { this.vx += 0.6; this.facing = 1; }
      this.vx *= FRICTION;
      if (Math.abs(this.vx) > MOVE_SPEED) this.vx = MOVE_SPEED * Math.sign(this.vx);
      if (Math.abs(this.vx) < 0.05) this.vx = 0;

      if (jumpKey && (frameKeys['Space'] || frameKeys['ArrowUp'] || frameKeys['KeyW'])) {
        if (this.onGround) {
          this.vy = JUMP_VELOCITY;
          this.onGround = false;
          AudioFX.jump();
        }
      }

      this.vy += GRAVITY;
      if (this.vy > 14) this.vy = 14;

      // carry player with moving platform
      let carryX = 0;
      if (this.onGround && this.standingOn && this.standingOn.axis === 'x') {
        carryX = this.standingOn.vxNow || 0;
      }

      // horizontal move + collide
      this.x += this.vx + carryX;
      resolveCollisions(this, 'x');
      // vertical move + collide
      this.onGround = false;
      this.standingOn = null;
      this.y += this.vy;
      resolveCollisions(this, 'y');

      if (this.x < 0) this.x = 0;
      if (this.x + this.w > world.width) this.x = world.width - this.w;

      // fell into the void
      if (this.y > H + 100) {
        this.hurt();
        if (this.lives > 0) {
          this.x = world.level.start.x;
          this.y = world.level.start.y;
          this.vx = 0; this.vy = 0;
        }
      }

      if (this.invuln > 0) this.invuln--;
      if (this.hurtFlash > 0) this.hurtFlash--;

      // animation
      if (Math.abs(this.vx) > 0.3 && this.onGround) {
        this.animTimer++;
        if (this.animTimer > 8) { this.animTimer = 0; this.animFrame = 1 - this.animFrame; }
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
      if (this.invuln > 0 && this.invuln % 6 < 3) return; // blink
      const cell = 2.6;
      const spriteW = 12 * cell;
      const spriteH = 12 * cell;
      drawSprite(this.sprite, DOG_PALETTE, this.x - camX + (this.w - spriteW) / 2, this.y + this.h - spriteH, cell, this.facing < 0);
    }
    get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  }

  class Enemy {
    constructor(x, y, range) {
      this.startX = x; this.x = x; this.y = y;
      this.w = 26; this.h = 20;
      this.range = range;
      this.dir = 1;
      this.speed = 0.8 + Math.random() * 0.4;
      this.alive = true;
      this.animTimer = Math.random() * 20;
      this.squish = 0;
    }
    update() {
      if (!this.alive) return;
      this.x += this.dir * this.speed;
      if (this.x < this.startX - this.range) { this.x = this.startX - this.range; this.dir = 1; }
      if (this.x > this.startX + this.range) { this.x = this.startX + this.range; this.dir = -1; }
      this.animTimer++;
      if (this.squish > 0) this.squish--;
    }
    draw() {
      if (!this.alive) return;
      const cell = 2.6;
      const frame = Math.floor(this.animTimer / 16) % 2 === 0 ? SLIME_A : SLIME_B;
      const squishOffset = this.squish > 0 ? 4 : 0;
      drawSprite(frame, SLIME_PALETTE, this.x - camX, this.y + squishOffset, cell, this.dir < 0);
    }
    get rect() { return { x: this.x, y: this.y + 4, w: this.w, h: this.h - 4 }; }
  }

  const player = new Player();

  // ---------- Collision resolution against static + moving platforms ----------
  function allSolids() {
    return world.platforms.concat(world.moving);
  }

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
      particles.push({
        x, y, color,
        vx: (Math.random() - 0.5) * 4,
        vy: -Math.random() * 4 - 1,
        life: 30 + Math.random() * 15,
      });
    }
  }
  function updateParticles() {
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.life--;
    }
    particles = particles.filter(p => p.life > 0);
  }
  function drawParticles() {
    for (const p of particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - camX), Math.round(p.y), 4, 4);
    }
  }

  // ---------- Game flow ----------
  function startGame() {
    player.reset();
    levelIndex = 0;
    loadLevel(0);
    state = STATE.PLAYING;
    AudioFX.select();
  }

  function triggerGameOver() {
    state = STATE.GAME_OVER;
    stateTimer = 0;
    AudioFX.gameOver();
    if (player.score > highScore.val) {
      highScore.val = player.score;
      localStorage.setItem('cozmos_highscore', String(highScore.val));
    }
  }

  function nextLevel() {
    levelIndex++;
    if (levelIndex >= LEVELS.length) {
      state = STATE.WIN;
      stateTimer = 0;
      if (player.score > highScore.val) {
        highScore.val = player.score;
        localStorage.setItem('cozmos_highscore', String(highScore.val));
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

    if (state === STATE.TITLE) {
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

    if (frameKeys['KeyP']) {
      state = state === STATE.PAUSED ? STATE.PLAYING : STATE.PAUSED;
    }
    if (state === STATE.PAUSED) return;

    // moving platforms
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

    // enemy collisions
    for (const e of world.enemies) {
      if (!e.alive) continue;
      if (rectsOverlap(player.rect, e.rect)) {
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

    // coins
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

    // goal
    if (rectsOverlap(player.rect, world.goal)) {
      state = STATE.LEVEL_DONE;
      stateTimer = 0;
      player.score += 200;
      AudioFX.levelUp();
    }

    updateParticles();
    if (shake > 0) shake--;

    // camera
    const targetCam = player.x - W / 2;
    camX += (targetCam - camX) * 0.15;
    camX = Math.max(0, Math.min(camX, world.width - W));
  }

  // ---------- Draw helpers ----------
  function drawBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#241b55');
    grad.addColorStop(0.55, '#3a2a7a');
    grad.addColorStop(1, '#6a3f8f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    for (const s of stars) {
      const tw = 0.6 + Math.sin(s.tw + performance.now() / 400) * 0.4;
      ctx.fillStyle = `rgba(255,255,255,${0.4 + tw * 0.6})`;
      let px = s.x - camX * s.parallax;
      px = ((px % W) + W) % W;
      ctx.fillRect(px, s.y, s.size, s.size);
    }

    // distant floating islands silhouette
    ctx.fillStyle = 'rgba(20,14,40,0.5)';
    for (let i = 0; i < 6; i++) {
      const bx = (i * 500 - camX * 0.3) % (W + 400) - 200;
      ctx.fillRect(bx, H - 120 + (i % 3) * 10, 160, 24);
    }
  }

  function drawPlatform(p) {
    ctx.fillStyle = '#2c8a4a';
    ctx.fillRect(p.x - camX, p.y, p.w, 10);
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(p.x - camX, p.y + 10, p.w, p.h - 10);
    ctx.fillStyle = '#3fae5e';
    for (let i = 0; i < p.w; i += 8) {
      ctx.fillRect(p.x - camX + i, p.y, 4, 4);
    }
    ctx.fillStyle = '#5a3a20';
    for (let i = 4; i < p.w - 4; i += 16) {
      ctx.fillRect(p.x - camX + i, p.y + 16, 6, 6);
    }
  }

  function drawMoving(m) {
    ctx.fillStyle = '#c9a24a';
    ctx.fillRect(m.x - camX, m.y, m.w, 12);
    ctx.fillStyle = '#8a6b2a';
    ctx.fillRect(m.x - camX, m.y + 12, m.w, 6);
    ctx.fillStyle = '#ffe08a';
    for (let i = 0; i < m.w; i += 10) ctx.fillRect(m.x - camX + i, m.y, 4, 3);
  }

  function drawCoin(c) {
    if (c.taken) return;
    const frame = COIN_FRAMES[Math.floor(c.anim) % COIN_FRAMES.length];
    drawSprite(frame, COIN_PALETTE, c.x - camX, c.y + Math.sin(c.anim * 2) * 3, 4);
  }

  function drawGoal() {
    const g = world.goal;
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

    for (let i = 0; i < 3; i++) drawHeart(10 + i * 16, 8, i < player.lives);

    ctx.fillStyle = '#ffd54a';
    ctx.fillText('SCORE ' + String(player.score).padStart(5, '0'), W / 2 - 60, 8);

    ctx.fillStyle = '#a9e0ff';
    ctx.fillText('LVL ' + (levelIndex + 1) + '/' + LEVELS.length, W - 90, 8);
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

  // ---------- Draw ----------
  function draw() {
    ctx.save();
    let dx = 0, dy = 0;
    if (shake > 0) {
      dx = (Math.random() - 0.5) * shake;
      dy = (Math.random() - 0.5) * shake;
    }
    ctx.translate(dx, dy);

    if (state === STATE.TITLE) {
      drawBackground();
      drawTitleScreen();
      ctx.restore();
      return;
    }

    drawBackground();
    for (const p of world.platforms) drawPlatform(p);
    for (const m of world.moving) drawMoving(m);
    for (const c of world.coins) drawCoin(c);
    drawGoal();
    for (const e of world.enemies) e.draw();
    player.draw();
    drawParticles();
    drawHUD();

    if (state === STATE.PAUSED) {
      drawOverlayPanel();
      centerText([{ text: 'PAUSED', size: 20 }, { text: 'PRESS P TO RESUME', size: 9, color: '#f4f1ff' }], H / 2 - 20, 20, '#ffd54a', 30);
    }
    if (state === STATE.LEVEL_DONE) {
      drawOverlayPanel();
      const isLast = levelIndex >= LEVELS.length - 1;
      centerText([
        { text: isLast ? 'FINAL GATE CLEARED!' : 'LEVEL CLEAR!', size: 16 },
        { text: world.level.name.toUpperCase(), size: 9, color: '#a9e0ff' },
      ], H / 2 - 20, 16, '#ffd54a', 26);
    }
    if (state === STATE.GAME_OVER) {
      drawOverlayPanel();
      centerText([
        { text: 'GAME OVER', size: 20 },
        { text: 'SCORE ' + player.score, size: 10, color: '#f4f1ff' },
        { text: 'BEST ' + highScore.val, size: 10, color: '#a9e0ff' },
        { text: 'PRESS ENTER TO RETRY', size: 9, color: '#ffd54a' },
      ], H / 2 - 40, 20, '#ff4d6d', 26);
    }
    if (state === STATE.WIN) {
      drawOverlayPanel();
      centerText([
        { text: 'KINGDOM SAVED!', size: 18 },
        { text: 'COZMO WEARS THE CROWN', size: 9, color: '#a9e0ff' },
        { text: 'SCORE ' + player.score, size: 10, color: '#f4f1ff' },
        { text: 'BEST ' + highScore.val, size: 10, color: '#f4f1ff' },
        { text: 'PRESS ENTER TO PLAY AGAIN', size: 9, color: '#ffd54a' },
      ], H / 2 - 60, 18, '#ffd54a', 26);
    }

    ctx.restore();
  }

  function drawTitleScreen() {
    // hero preview
    const cell = 4;
    const bob = Math.sin(performance.now() / 300) * 4;
    drawSprite(DOG_RUN_A, DOG_PALETTE, W / 2 - 24, 130 + bob, cell);

    centerText([
      { text: 'COZMOS KINGDOM', size: 20 },
    ], 40, 20, '#ffd54a');

    centerText([
      { text: 'The Star Slimes stole the', size: 8, color: '#e6e0ff' },
      { text: 'Royal Star-Bones! Help Cozmo', size: 8, color: '#e6e0ff' },
      { text: 'hop across the sky islands', size: 8, color: '#e6e0ff' },
      { text: 'and reclaim the kingdom!', size: 8, color: '#e6e0ff' },
    ], 210, 8, '#e6e0ff', 14);

    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    if (blink) {
      centerText([{ text: 'PRESS ENTER TO START', size: 11 }], 272, 11, '#ffd54a');
    }
    ctx.textAlign = 'center';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = '#a9e0ff';
    ctx.fillText('BEST SCORE: ' + highScore.val, W / 2, 258);
    ctx.textAlign = 'left';
  }

  // ---------- Main loop ----------
  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  loadLevel(0); // preload first level geometry for title-screen consistency
  state = STATE.TITLE;
  requestAnimationFrame(loop);
})();
