(() => {
  'use strict';

  /** @typedef {{x:number,y:number,w:number,h:number}} Rect */

  const STORAGE_KEYS = {
    bestTimes: 'obby.bestTimes.v1',
    unlocked: 'obby.unlocked.v1',
  };

  const CONFIG = {
    gravity: 1900,
    maxFall: 1200,
    moveSpeed: 330,
    groundAccel: 2600,
    airAccel: 1500,
    friction: 2000,
    jumpVel: 720,
    jumpCut: 0.52,
    coyoteTime: 0.09,
    jumpBuffer: 0.12,
    defaultLives: 5,
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds)) return '—';
    return `${seconds.toFixed(2)}s`;
  };

  const rectsOverlap = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  const expandedRect = (r, pad) => ({ x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 });

  const safeJsonParse = (value, fallback) => {
    try {
      const parsed = JSON.parse(value);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  };

  const storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw == null) return fallback;
        return safeJsonParse(raw, fallback);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // ignore
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
  };

  class Input {
    constructor() {
      /** @type {Record<string, boolean>} */
      this.down = Object.create(null);
      /** @type {Record<string, boolean>} */
      this.pressed = Object.create(null);
      /** @type {Record<string, boolean>} */
      this.released = Object.create(null);

      this._bindKeyboard();
    }

    _bindKeyboard() {
      const normalize = (e) => {
        const k = e.key;
        if (k === 'ArrowLeft') return 'left';
        if (k === 'ArrowRight') return 'right';
        if (k === 'ArrowUp') return 'jump';
        if (k === ' ' || k === 'Spacebar') return 'jump';
        if (k === 'w' || k === 'W') return 'jump';
        if (k === 'a' || k === 'A') return 'left';
        if (k === 'd' || k === 'D') return 'right';
        if (k === 'r' || k === 'R') return 'respawn';
        if (k === 'Escape') return 'escape';
        return null;
      };

      window.addEventListener('keydown', (e) => {
        const key = normalize(e);
        if (!key) return;
        if (key === 'jump' || key === 'left' || key === 'right') e.preventDefault();
        if (!this.down[key]) this.pressed[key] = true;
        this.down[key] = true;
      });

      window.addEventListener('keyup', (e) => {
        const key = normalize(e);
        if (!key) return;
        if (key === 'jump' || key === 'left' || key === 'right') e.preventDefault();
        this.down[key] = false;
        this.released[key] = true;
      });

      window.addEventListener('blur', () => {
        this.down = Object.create(null);
        this.pressed = Object.create(null);
        this.released = Object.create(null);
      });
    }

    frameReset() {
      this.pressed = Object.create(null);
      this.released = Object.create(null);
    }

    isDown(key) {
      return !!this.down[key];
    }

    wasPressed(key) {
      return !!this.pressed[key];
    }

    wasReleased(key) {
      return !!this.released[key];
    }
  }

  class Camera {
    constructor() {
      this.x = 0;
      this.y = 0;
      this.shake = 0;
    }

    update(dt, target, bounds, view) {
      const tx = target.x + target.w / 2 - view.w / 2;
      const ty = target.y + target.h / 2 - view.h / 2;
      this.x = lerp(this.x, tx, 1 - Math.pow(0.0001, dt));
      this.y = lerp(this.y, ty, 1 - Math.pow(0.0001, dt));
      this.x = clamp(this.x, bounds.x, bounds.x + bounds.w - view.w);
      this.y = clamp(this.y, bounds.y, bounds.y + bounds.h - view.h);

      this.shake = Math.max(0, this.shake - dt * 3.2);
    }

    apply(ctx) {
      if (this.shake <= 0) return;
      const mag = this.shake * this.shake * 10;
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }
  }

  class Platform {
    /** @param {Rect & {color?:string}} r */
    constructor(r) {
      this.x = r.x;
      this.y = r.y;
      this.w = r.w;
      this.h = r.h;
      this.color = r.color ?? 'rgba(220, 230, 255, 0.85)';

      this.prevX = this.x;
      this.prevY = this.y;
    }

    get rect() {
      return { x: this.x, y: this.y, w: this.w, h: this.h };
    }

    preUpdate() {
      this.prevX = this.x;
      this.prevY = this.y;
    }

    update(_dt) {}

    get delta() {
      return { x: this.x - this.prevX, y: this.y - this.prevY };
    }

    render(ctx) {
      ctx.fillStyle = this.color;
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeRect(this.x + 0.5, this.y + 0.5, this.w - 1, this.h - 1);
    }
  }

  class MovingPlatform extends Platform {
    /**
     * @param {Rect & {toX:number,toY:number,speed:number,color?:string}} r
     */
    constructor(r) {
      super(r);
      this.fromX = r.x;
      this.fromY = r.y;
      this.toX = r.toX;
      this.toY = r.toY;
      this.speed = r.speed;
      this.t = 0;
      this.dir = 1;
      this.color = r.color ?? 'rgba(120, 210, 255, 0.9)';
    }

    update(dt) {
      const dx = this.toX - this.fromX;
      const dy = this.toY - this.fromY;
      const dist = Math.hypot(dx, dy) || 1;
      const step = (this.speed / dist) * dt;
      this.t += step * this.dir;
      if (this.t >= 1) {
        this.t = 1;
        this.dir = -1;
      } else if (this.t <= 0) {
        this.t = 0;
        this.dir = 1;
      }
      this.x = lerp(this.fromX, this.toX, this.t);
      this.y = lerp(this.fromY, this.toY, this.t);
    }

    render(ctx) {
      super.render(ctx);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(this.x + 4, this.y + 4, this.w - 8, 4);
    }
  }

  class FallingBlock extends Platform {
    /** @param {Rect & {delay?:number}} r */
    constructor(r) {
      super({ ...r, color: 'rgba(255, 207, 91, 0.92)' });
      this.homeX = this.x;
      this.homeY = this.y;
      this.delay = r.delay ?? 0.22;
      this.state = 'idle'; // idle | armed | falling | gone
      this.timer = 0;
      this.vy = 0;
    }

    reset() {
      this.x = this.homeX;
      this.y = this.homeY;
      this.state = 'idle';
      this.timer = 0;
      this.vy = 0;
    }

    arm() {
      if (this.state !== 'idle') return;
      this.state = 'armed';
      this.timer = this.delay;
    }

    update(dt) {
      if (this.state === 'armed') {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'falling';
          this.vy = 0;
        }
      }
      if (this.state === 'falling') {
        this.vy += CONFIG.gravity * dt;
        this.y += this.vy * dt;
        if (this.y > 5000) this.state = 'gone';
      }
    }

    get solid() {
      return this.state !== 'gone';
    }

    render(ctx) {
      if (this.state === 'gone') return;
      const shake = this.state === 'armed' ? Math.sin(performance.now() / 28) * 1.5 : 0;
      ctx.save();
      ctx.translate(shake, 0);
      super.render(ctx);
      ctx.restore();
    }
  }

  class Spike {
    /** @param {Rect & {count?:number}} r */
    constructor(r) {
      this.x = r.x;
      this.y = r.y;
      this.w = r.w;
      this.h = r.h;
      this.count = r.count ?? Math.max(1, Math.floor(r.w / 26));
    }

    get rect() {
      return { x: this.x, y: this.y, w: this.w, h: this.h };
    }

    render(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 77, 109, 0.95)';
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      const step = this.w / this.count;
      for (let i = 0; i < this.count; i++) {
        const x0 = this.x + i * step;
        ctx.beginPath();
        ctx.moveTo(x0, this.y + this.h);
        ctx.lineTo(x0 + step * 0.5, this.y);
        ctx.lineTo(x0 + step, this.y + this.h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  const closestPointOnSegment = (ax, ay, bx, by, px, py) => {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const abLen2 = abx * abx + aby * aby;
    if (abLen2 <= 0.00001) return { x: ax, y: ay, t: 0 };
    const t = clamp((apx * abx + apy * aby) / abLen2, 0, 1);
    return { x: ax + abx * t, y: ay + aby * t, t };
  };

  const pointRectDistanceSquared = (px, py, r) => {
    const cx = clamp(px, r.x, r.x + r.w);
    const cy = clamp(py, r.y, r.y + r.h);
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy;
  };

  const segmentRectDistanceSquared = (ax, ay, bx, by, r) => {
    // Sample closest points using rectangle corners + segment endpoints.
    // This is fast and conservative enough for hazard hit detection.
    const corners = [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x, y: r.y + r.h },
      { x: r.x + r.w, y: r.y + r.h },
    ];

    let best = Math.min(pointRectDistanceSquared(ax, ay, r), pointRectDistanceSquared(bx, by, r));
    for (const c of corners) {
      const p = closestPointOnSegment(ax, ay, bx, by, c.x, c.y);
      const dx = c.x - p.x;
      const dy = c.y - p.y;
      best = Math.min(best, dx * dx + dy * dy);
    }

    const samples = [
      { x: r.x + r.w * 0.5, y: r.y },
      { x: r.x + r.w * 0.5, y: r.y + r.h },
      { x: r.x, y: r.y + r.h * 0.5 },
      { x: r.x + r.w, y: r.y + r.h * 0.5 },
    ];

    for (const s of samples) {
      const p = closestPointOnSegment(ax, ay, bx, by, s.x, s.y);
      const dx = s.x - p.x;
      const dy = s.y - p.y;
      best = Math.min(best, dx * dx + dy * dy);
    }

    return best;
  };

  class Rotator {
    /** @param {{x:number,y:number,length:number,thickness:number,speed:number,angle?:number}} opts */
    constructor(opts) {
      this.x = opts.x;
      this.y = opts.y;
      this.length = opts.length;
      this.thickness = opts.thickness;
      this.speed = opts.speed;
      this.angle = opts.angle ?? 0;
    }

    update(dt) {
      this.angle += this.speed * dt;
    }

    getCapsule() {
      const half = this.length / 2;
      const ca = Math.cos(this.angle);
      const sa = Math.sin(this.angle);
      const ax = this.x - ca * half;
      const ay = this.y - sa * half;
      const bx = this.x + ca * half;
      const by = this.y + sa * half;
      return { ax, ay, bx, by, r: this.thickness / 2 };
    }

    hitsRect(r) {
      const cap = this.getCapsule();
      const d2 = segmentRectDistanceSquared(cap.ax, cap.ay, cap.bx, cap.by, r);
      return d2 <= cap.r * cap.r;
    }

    render(ctx) {
      const cap = this.getCapsule();
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(190, 120, 255, 0.95)';
      ctx.lineWidth = this.thickness;
      ctx.beginPath();
      ctx.moveTo(cap.ax, cap.ay);
      ctx.lineTo(cap.bx, cap.by);
      ctx.stroke();

      ctx.fillStyle = 'rgba(30, 20, 40, 0.65)';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.thickness * 0.62, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  class Checkpoint {
    /** @param {{id:number,x:number,y:number,w?:number,h?:number,spawnX?:number,spawnY?:number}} opts */
    constructor(opts) {
      this.id = opts.id;
      this.x = opts.x;
      this.y = opts.y;
      this.w = opts.w ?? 44;
      this.h = opts.h ?? 80;
      this.spawnX = opts.spawnX ?? opts.x + 6;
      this.spawnY = opts.spawnY ?? opts.y - 40;
      this.reached = false;
    }

    get rect() {
      return { x: this.x, y: this.y - this.h, w: this.w, h: this.h };
    }

    render(ctx) {
      const r = this.rect;
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(r.x + 10, r.y + r.h);
      ctx.lineTo(r.x + 10, r.y + 8);
      ctx.stroke();

      ctx.fillStyle = this.reached ? 'rgba(73, 245, 157, 0.95)' : 'rgba(230, 240, 255, 0.88)';
      ctx.beginPath();
      ctx.moveTo(r.x + 10, r.y + 12);
      ctx.lineTo(r.x + r.w, r.y + 20);
      ctx.lineTo(r.x + 10, r.y + 30);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
  }

  class Goal {
    /** @param {Rect} r */
    constructor(r) {
      this.x = r.x;
      this.y = r.y;
      this.w = r.w;
      this.h = r.h;
    }

    get rect() {
      return { x: this.x, y: this.y, w: this.w, h: this.h };
    }

    render(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(94, 231, 255, 0.16)';
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.strokeStyle = 'rgba(94, 231, 255, 0.55)';
      ctx.strokeRect(this.x + 0.5, this.y + 0.5, this.w - 1, this.h - 1);
      ctx.fillStyle = 'rgba(94, 231, 255, 0.95)';
      ctx.font = '700 16px ui-sans-serif, system-ui';
      ctx.fillText('GOAL', this.x + 8, this.y + 22);
      ctx.restore();
    }
  }

  class Player {
    constructor() {
      this.w = 34;
      this.h = 46;
      this.x = 0;
      this.y = 0;
      this.vx = 0;
      this.vy = 0;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuf = 0;
      this.standingOn = null;

      this.face = 1;
      this.spawnGlow = 0;
    }

    get rect() {
      return { x: this.x, y: this.y, w: this.w, h: this.h };
    }

    spawnAt(x, y) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuf = 0;
      this.standingOn = null;
      this.spawnGlow = 1;
    }

    update(dt, input, solids) {
      this.spawnGlow = Math.max(0, this.spawnGlow - dt * 2.1);

      const wantLeft = input.isDown('left');
      const wantRight = input.isDown('right');
      if (wantLeft) this.face = -1;
      if (wantRight) this.face = 1;

      const accel = this.grounded ? CONFIG.groundAccel : CONFIG.airAccel;
      if (wantLeft && !wantRight) this.vx -= accel * dt;
      if (wantRight && !wantLeft) this.vx += accel * dt;

      if (!wantLeft && !wantRight) {
        const sign = Math.sign(this.vx);
        const decel = CONFIG.friction * dt;
        const nv = Math.abs(this.vx) - decel;
        this.vx = sign * Math.max(0, nv);
      }

      this.vx = clamp(this.vx, -CONFIG.moveSpeed, CONFIG.moveSpeed);

      if (input.wasPressed('jump')) this.jumpBuf = CONFIG.jumpBuffer;
      else this.jumpBuf = Math.max(0, this.jumpBuf - dt);

      this.coyote = this.grounded ? CONFIG.coyoteTime : Math.max(0, this.coyote - dt);

      if (this.jumpBuf > 0 && this.coyote > 0) {
        this.jumpBuf = 0;
        this.coyote = 0;
        this.vy = -CONFIG.jumpVel;
        this.grounded = false;
        this.standingOn = null;
      }

      if (input.wasReleased('jump') && this.vy < 0) {
        this.vy *= CONFIG.jumpCut;
      }

      this.vy += CONFIG.gravity * dt;
      this.vy = Math.min(CONFIG.maxFall, this.vy);

      this._moveAndCollide(dt, solids);
    }

    _moveAndCollide(dt, solids) {
      const eps = 0.0001;

      // Horizontal
      this.x += this.vx * dt;
      for (const s of solids) {
        const r = s.rect;
        if (!rectsOverlap(this.rect, r)) continue;
        if (this.vx > 0) this.x = r.x - this.w - eps;
        else if (this.vx < 0) this.x = r.x + r.w + eps;
        this.vx = 0;
      }

      // Vertical
      this.y += this.vy * dt;
      this.grounded = false;
      this.standingOn = null;

      for (const s of solids) {
        const r = s.rect;
        if (!rectsOverlap(this.rect, r)) continue;

        if (this.vy > 0) {
          this.y = r.y - this.h - eps;
          this.vy = 0;
          this.grounded = true;
          this.standingOn = s;

          if (typeof s.arm === 'function') s.arm();
        } else if (this.vy < 0) {
          this.y = r.y + r.h + eps;
          this.vy = 0;
        }
      }
    }

    render(ctx) {
      const glow = this.spawnGlow;
      if (glow > 0) {
        ctx.save();
        ctx.globalAlpha = glow * 0.4;
        ctx.fillStyle = 'rgba(94, 231, 255, 1)';
        ctx.beginPath();
        ctx.ellipse(this.x + this.w / 2, this.y + this.h / 2, 34, 26, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.fillStyle = 'rgba(233, 238, 252, 0.95)';
      ctx.fillRect(this.x, this.y, this.w, this.h);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(this.x + 6, this.y + 10, 8, 8);
      ctx.fillRect(this.x + this.w - 14, this.y + 10, 8, 8);

      // Face indicator
      ctx.fillStyle = 'rgba(73, 245, 157, 0.9)';
      if (this.face > 0) ctx.fillRect(this.x + this.w - 6, this.y + this.h - 12, 4, 8);
      else ctx.fillRect(this.x + 2, this.y + this.h - 12, 4, 8);

      ctx.restore();
    }
  }

  class Level {
    /** @param {{id:number,name:string,bounds:Rect,start:{x:number,y:number},checkpoints:Checkpoint[],goal:Goal,platforms:(Platform|MovingPlatform)[],spikes:Spike[],falling:FallingBlock[],rotators:Rotator[]}} data */
    constructor(data) {
      this.id = data.id;
      this.name = data.name;
      this.bounds = data.bounds;
      this.start = data.start;
      this.checkpoints = data.checkpoints;
      this.goal = data.goal;
      this.platforms = data.platforms;
      this.spikes = data.spikes;
      this.falling = data.falling;
      this.rotators = data.rotators;
    }

    resetDynamics() {
      for (const f of this.falling) f.reset();
      for (const c of this.checkpoints) c.reached = false;
    }

    preUpdate() {
      for (const p of this.platforms) p.preUpdate();
      for (const f of this.falling) f.preUpdate();
    }

    update(dt) {
      for (const p of this.platforms) p.update(dt);
      for (const f of this.falling) f.update(dt);
      for (const r of this.rotators) r.update(dt);
    }

    getSolids() {
      const solids = [];
      for (const p of this.platforms) solids.push(p);
      for (const f of this.falling) {
        if (f.solid) solids.push(f);
      }
      return solids;
    }

    render(ctx) {
      // Background level gradient overlay
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(this.bounds.x, this.bounds.y, this.bounds.w, this.bounds.h);
      ctx.restore();

      for (const p of this.platforms) p.render(ctx);
      for (const f of this.falling) f.render(ctx);
      for (const s of this.spikes) s.render(ctx);
      for (const r of this.rotators) r.render(ctx);
      for (const c of this.checkpoints) c.render(ctx);
      this.goal.render(ctx);
    }
  }

  const createLevels = () => {
    /** @type {Level[]} */
    const levels = [];

    // Level 1
    {
      const bounds = { x: 0, y: 0, w: 2600, h: 900 };
      const groundY = 760;
      const platforms = [
        new Platform({ x: 0, y: groundY, w: 900, h: 140 }),
        new Platform({ x: 980, y: groundY, w: 520, h: 140 }),
        new Platform({ x: 1600, y: groundY, w: 1000, h: 140 }),

        new Platform({ x: 520, y: 640, w: 120, h: 16 }),
        new Platform({ x: 680, y: 595, w: 120, h: 16 }),

        new Platform({ x: 1120, y: 610, w: 120, h: 16 }),
        new Platform({ x: 1270, y: 570, w: 90, h: 16 }),

        new Platform({ x: 1750, y: 615, w: 140, h: 16 }),
        new Platform({ x: 1950, y: 565, w: 90, h: 16 }),
      ];

      const moving = [
        new MovingPlatform({ x: 1400, y: 640, w: 100, h: 16, toX: 1520, toY: 640, speed: 120 }),
      ];

      const spikes = [
        new Spike({ x: 900, y: groundY - 26, w: 80, h: 26 }),
        new Spike({ x: 1500, y: groundY - 26, w: 100, h: 26 }),
      ];

      const falling = [new FallingBlock({ x: 2100, y: 620, w: 90, h: 16, delay: 0.2 })];

      const rotators = [new Rotator({ x: 2320, y: 665, length: 160, thickness: 16, speed: 2.2 })];

      const checkpoints = [
        new Checkpoint({ id: 1, x: 840, y: groundY, spawnX: 820, spawnY: groundY - 60 }),
        new Checkpoint({ id: 2, x: 1550, y: groundY, spawnX: 1530, spawnY: groundY - 60 }),
      ];

      const goal = new Goal({ x: 2480, y: groundY - 140, w: 90, h: 140 });

      levels.push(
        new Level({
          id: 1,
          name: 'Level 1 — Warmup Run',
          bounds,
          start: { x: 80, y: groundY - 70 },
          checkpoints,
          goal,
          platforms: [...platforms, ...moving],
          spikes,
          falling,
          rotators,
        })
      );
    }

    // Level 2
    {
      const bounds = { x: 0, y: 0, w: 3100, h: 1000 };
      const groundY = 820;

      const platforms = [
        new Platform({ x: 0, y: groundY, w: 760, h: 200 }),
        new Platform({ x: 920, y: groundY, w: 360, h: 200 }),
        new Platform({ x: 1460, y: groundY, w: 740, h: 200 }),
        new Platform({ x: 2380, y: groundY, w: 720, h: 200 }),

        new Platform({ x: 540, y: 690, w: 70, h: 14 }),
        new Platform({ x: 650, y: 650, w: 60, h: 14 }),
        new Platform({ x: 770, y: 610, w: 50, h: 14 }),

        new Platform({ x: 1320, y: 700, w: 80, h: 14 }),
        new Platform({ x: 1500, y: 635, w: 80, h: 14 }),
        new Platform({ x: 1680, y: 575, w: 80, h: 14 }),
      ];

      const moving = [
        new MovingPlatform({ x: 1030, y: 660, w: 120, h: 16, toX: 1130, toY: 560, speed: 170 }),
        new MovingPlatform({ x: 1940, y: 650, w: 110, h: 16, toX: 2140, toY: 650, speed: 160 }),
      ];

      const spikes = [
        new Spike({ x: 760, y: groundY - 26, w: 160, h: 26 }),
        new Spike({ x: 1280, y: groundY - 26, w: 180, h: 26 }),
        new Spike({ x: 2200, y: groundY - 26, w: 180, h: 26 }),
      ];

      const falling = [
        new FallingBlock({ x: 2260, y: 600, w: 90, h: 16, delay: 0.18 }),
        new FallingBlock({ x: 2360, y: 560, w: 90, h: 16, delay: 0.16 }),
        new FallingBlock({ x: 2460, y: 520, w: 90, h: 16, delay: 0.14 }),
      ];

      const rotators = [
        new Rotator({ x: 1550, y: 740, length: 220, thickness: 16, speed: -2.6 }),
        new Rotator({ x: 2720, y: 690, length: 180, thickness: 14, speed: 3.1, angle: 1.1 }),
      ];

      const checkpoints = [
        new Checkpoint({ id: 1, x: 660, y: groundY, spawnX: 620, spawnY: groundY - 60 }),
        new Checkpoint({ id: 2, x: 2140, y: groundY, spawnX: 2110, spawnY: groundY - 60 }),
      ];

      const goal = new Goal({ x: 2980, y: groundY - 160, w: 90, h: 160 });

      levels.push(
        new Level({
          id: 2,
          name: 'Level 2 — Moving Trouble',
          bounds,
          start: { x: 60, y: groundY - 70 },
          checkpoints,
          goal,
          platforms: [...platforms, ...moving],
          spikes,
          falling,
          rotators,
        })
      );
    }

    // Level 3 (Vertical)
    {
      const bounds = { x: 0, y: 0, w: 1600, h: 2400 };
      const baseY = 2240;

      const platforms = [
        new Platform({ x: 0, y: baseY, w: 1600, h: 200 }),

        new Platform({ x: 180, y: 2060, w: 160, h: 16 }),
        new Platform({ x: 430, y: 1960, w: 130, h: 16 }),
        new Platform({ x: 640, y: 1860, w: 120, h: 16 }),
        new Platform({ x: 820, y: 1750, w: 120, h: 16 }),
        new Platform({ x: 1040, y: 1630, w: 140, h: 16 }),

        new Platform({ x: 240, y: 1500, w: 100, h: 16 }),
        new Platform({ x: 420, y: 1420, w: 90, h: 16 }),
        new Platform({ x: 600, y: 1340, w: 90, h: 16 }),
        new Platform({ x: 780, y: 1260, w: 90, h: 16 }),

        new Platform({ x: 1040, y: 1180, w: 120, h: 16 }),
        new Platform({ x: 880, y: 1080, w: 80, h: 16 }),
        new Platform({ x: 720, y: 980, w: 80, h: 16 }),
        new Platform({ x: 560, y: 880, w: 80, h: 16 }),
      ];

      const moving = [
        new MovingPlatform({ x: 280, y: 1700, w: 120, h: 16, toX: 520, toY: 1700, speed: 150 }),
        new MovingPlatform({ x: 1060, y: 980, w: 110, h: 16, toX: 1060, toY: 820, speed: 150 }),
      ];

      const spikes = [
        new Spike({ x: 0, y: baseY - 26, w: 160, h: 26 }),
        new Spike({ x: 1440, y: baseY - 26, w: 160, h: 26 }),
        new Spike({ x: 620, y: 2044, w: 120, h: 18, count: 5 }),
        new Spike({ x: 820, y: 1608, w: 100, h: 18, count: 4 }),
      ];

      const falling = [
        new FallingBlock({ x: 700, y: 1140, w: 90, h: 16, delay: 0.16 }),
        new FallingBlock({ x: 820, y: 1040, w: 90, h: 16, delay: 0.14 }),
      ];

      const rotators = [
        new Rotator({ x: 600, y: 1580, length: 220, thickness: 14, speed: 2.8 }),
        new Rotator({ x: 820, y: 940, length: 260, thickness: 16, speed: -2.2, angle: 0.8 }),
      ];

      const checkpoints = [
        new Checkpoint({ id: 1, x: 120, y: baseY, spawnX: 90, spawnY: baseY - 60 }),
        new Checkpoint({ id: 2, x: 1040, y: 1630, spawnX: 1010, spawnY: 1570 }),
        new Checkpoint({ id: 3, x: 520, y: 900, spawnX: 490, spawnY: 840 }),
      ];

      const goal = new Goal({ x: 1280, y: 660, w: 100, h: 160 });

      levels.push(
        new Level({
          id: 3,
          name: 'Level 3 — Tower Climb',
          bounds,
          start: { x: 140, y: baseY - 70 },
          checkpoints,
          goal,
          platforms: [...platforms, ...moving],
          spikes,
          falling,
          rotators,
        })
      );
    }

    // Level 4 (Precision Challenge)
    {
      const bounds = { x: 0, y: 0, w: 2200, h: 1200 };
      const groundY = 1050;

      const platforms = [
        new Platform({ x: 0, y: groundY, w: 600, h: 200 }),
        new Platform({ x: 800, y: groundY, w: 540, h: 200 }),
        new Platform({ x: 1500, y: groundY, w: 700, h: 200 }),

        new Platform({ x: 280, y: 920, w: 60, h: 14 }),
        new Platform({ x: 360, y: 880, w: 60, h: 14 }),
        new Platform({ x: 440, y: 840, w: 50, h: 14 }),
        new Platform({ x: 510, y: 800, w: 50, h: 14 }),

        new Platform({ x: 1080, y: 900, w: 65, h: 14 }),
        new Platform({ x: 1160, y: 855, w: 70, h: 14 }),
        new Platform({ x: 1250, y: 810, w: 65, h: 14 }),
        new Platform({ x: 1340, y: 765, w: 60, h: 14 }),

        new Platform({ x: 1700, y: 880, w: 80, h: 14 }),
        new Platform({ x: 1820, y: 820, w: 75, h: 14 }),
      ];

      const moving = [
        new MovingPlatform({ x: 600, y: 750, w: 100, h: 16, toX: 700, toY: 650, speed: 180 }),
        new MovingPlatform({ x: 1250, y: 600, w: 100, h: 16, toX: 1250, toY: 500, speed: 140 }),
        new MovingPlatform({ x: 1950, y: 700, w: 90, h: 16, toX: 1950, toY: 550, speed: 160 }),
      ];

      const spikes = [
        new Spike({ x: 600, y: groundY - 26, w: 200, h: 26 }),
        new Spike({ x: 1340, y: groundY - 26, w: 160, h: 26 }),
      ];

      const falling = [
        new FallingBlock({ x: 660, y: 820, w: 85, h: 16, delay: 0.15 }),
        new FallingBlock({ x: 1620, y: 700, w: 80, h: 16, delay: 0.17 }),
        new FallingBlock({ x: 1720, y: 660, w: 80, h: 16, delay: 0.19 }),
      ];

      const rotators = [
        new Rotator({ x: 780, y: 900, length: 200, thickness: 14, speed: 2.4 }),
        new Rotator({ x: 1450, y: 850, length: 240, thickness: 15, speed: -2.8, angle: 0.5 }),
      ];

      const checkpoints = [
        new Checkpoint({ id: 1, x: 540, y: groundY, spawnX: 500, spawnY: groundY - 60 }),
        new Checkpoint({ id: 2, x: 1290, y: 760, spawnX: 1250, spawnY: 700 }),
      ];

      const goal = new Goal({ x: 2050, y: groundY - 180, w: 100, h: 180 });

      levels.push(
        new Level({
          id: 4,
          name: 'Level 4 — Precision',
          bounds,
          start: { x: 80, y: groundY - 70 },
          checkpoints,
          goal,
          platforms: [...platforms, ...moving],
          spikes,
          falling,
          rotators,
        })
      );
    }

    // Level 5 (Momentum Challenge)
    {
      const bounds = { x: 0, y: 0, w: 3400, h: 1400 };
      const groundY = 1200;

      const platforms = [
        new Platform({ x: 0, y: groundY, w: 900, h: 200 }),
        new Platform({ x: 1200, y: groundY, w: 800, h: 200 }),
        new Platform({ x: 2300, y: groundY, w: 1100, h: 200 }),

        new Platform({ x: 500, y: 1060, w: 75, h: 14 }),
        new Platform({ x: 620, y: 1010, w: 75, h: 14 }),
        new Platform({ x: 740, y: 960, w: 65, h: 14 }),
        new Platform({ x: 850, y: 910, w: 65, h: 14 }),

        new Platform({ x: 1400, y: 1050, w: 90, h: 14 }),
        new Platform({ x: 1540, y: 980, w: 85, h: 14 }),
        new Platform({ x: 1680, y: 910, w: 80, h: 14 }),

        new Platform({ x: 2600, y: 1050, w: 100, h: 14 }),
        new Platform({ x: 2760, y: 980, w: 95, h: 14 }),
        new Platform({ x: 2920, y: 910, w: 90, h: 14 }),
      ];

      const moving = [
        new MovingPlatform({ x: 850, y: 800, w: 120, h: 16, toX: 950, toY: 750, speed: 200 }),
        new MovingPlatform({ x: 1750, y: 750, w: 110, h: 16, toX: 1750, toY: 600, speed: 180 }),
        new MovingPlatform({ x: 2250, y: 850, w: 130, h: 16, toX: 2400, toY: 850, speed: 190 }),
        new MovingPlatform({ x: 3000, y: 750, w: 100, h: 16, toX: 3100, toY: 700, speed: 170 }),
      ];

      const spikes = [
        new Spike({ x: 900, y: groundY - 26, w: 300, h: 26 }),
        new Spike({ x: 2000, y: groundY - 26, w: 300, h: 26 }),
      ];

      const falling = [
        new FallingBlock({ x: 980, y: 900, w: 80, h: 16, delay: 0.14 }),
        new FallingBlock({ x: 1080, y: 860, w: 80, h: 16, delay: 0.16 }),
        new FallingBlock({ x: 1850, y: 750, w: 85, h: 16, delay: 0.15 }),
        new FallingBlock({ x: 1950, y: 710, w: 85, h: 16, delay: 0.17 }),
        new FallingBlock({ x: 2850, y: 800, w: 80, h: 16, delay: 0.18 }),
      ];

      const rotators = [
        new Rotator({ x: 1050, y: 1050, length: 260, thickness: 16, speed: 2.6 }),
        new Rotator({ x: 1850, y: 980, length: 280, thickness: 16, speed: -2.9, angle: 1.2 }),
        new Rotator({ x: 2950, y: 1050, length: 240, thickness: 15, speed: 2.4, angle: 0.7 }),
      ];

      const checkpoints = [
        new Checkpoint({ id: 1, x: 820, y: groundY, spawnX: 780, spawnY: groundY - 60 }),
        new Checkpoint({ id: 2, x: 1700, y: 910, spawnX: 1660, spawnY: 850 }),
        new Checkpoint({ id: 3, x: 2850, y: groundY, spawnX: 2810, spawnY: groundY - 60 }),
      ];

      const goal = new Goal({ x: 3220, y: groundY - 200, w: 110, h: 200 });

      levels.push(
        new Level({
          id: 5,
          name: 'Level 5 — Momentum Master',
          bounds,
          start: { x: 80, y: groundY - 70 },
          checkpoints,
          goal,
          platforms: [...platforms, ...moving],
          spikes,
          falling,
          rotators,
        })
      );
    }

    return levels;
  };

  class Game {
    /** @param {HTMLCanvasElement} canvas */
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      if (!this.ctx) throw new Error('Canvas rendering context not available');

      this.input = new Input();
      this.camera = new Camera();
      this.levels = createLevels();

      this.state = 'menu';
      this.activeLevelIndex = 0;
      this.level = null;
      this.player = new Player();

      this.lives = CONFIG.defaultLives;
      this.checkpointIndex = -1;
      this.respawn = { x: 0, y: 0 };

      this.timerRunning = false;
      this.levelStartMs = 0;
      this.elapsedSeconds = 0;

      this.unlocked = Math.max(1, storage.get(STORAGE_KEYS.unlocked, 1));
      this.bestTimes = storage.get(STORAGE_KEYS.bestTimes, {});

      this.view = { w: 800, h: 600 };

      this.toast = { text: '', t: 0 };

      this._bindUi();
      this._bindTouch();
      this._bindResize();
      this.resize();

      this.showMenu();

      this.lastMs = performance.now();
      requestAnimationFrame((t) => this._frame(t));
    }

    _bindUi() {
      const $ = (id) => document.getElementById(id);
      this.ui = {
        overlay: $('overlay'),
        menu: $('screen-menu'),
        levels: $('screen-levels'),
        levelGrid: $('level-grid'),
        hud: $('hud'),
        complete: $('screen-complete'),
        gameover: $('screen-gameover'),
        touch: $('touch'),

        hudLevel: $('hud-level'),
        hudTime: $('hud-time'),
        hudLives: $('hud-lives'),
        hudCheckpoint: $('hud-checkpoint'),
        toast: $('toast'),

        completeTime: $('complete-time'),
        completeBest: $('complete-best'),
        completeNote: $('complete-note'),

        btnStart: $('btn-start'),
        btnLevels: $('btn-levels'),
        btnReset: $('btn-reset'),
        btnLevelsBack: $('btn-levels-back'),

        btnNext: $('btn-next'),
        btnRetry: $('btn-retry'),
        btnCompleteLevels: $('btn-complete-levels'),

        btnGoRetry: $('btn-go-retry'),
        btnGoLevels: $('btn-go-levels'),
        btnGoMenu: $('btn-go-menu'),
      };

      this.ui.btnStart.addEventListener('click', () => {
        const idx = Math.min(this.unlocked - 1, this.levels.length - 1);
        this.startLevel(idx);
      });

      this.ui.btnLevels.addEventListener('click', () => this.showLevelSelect());
      this.ui.btnReset.addEventListener('click', () => this.resetProgress());
      this.ui.btnLevelsBack.addEventListener('click', () => this.showMenu());

      this.ui.btnRetry.addEventListener('click', () => this.startLevel(this.activeLevelIndex));
      this.ui.btnCompleteLevels.addEventListener('click', () => this.showLevelSelect());
      this.ui.btnNext.addEventListener('click', () => {
        const next = this.activeLevelIndex + 1;
        if (next < this.levels.length && next + 1 <= this.unlocked) this.startLevel(next);
        else this.showLevelSelect();
      });

      this.ui.btnGoRetry.addEventListener('click', () => this.startLevel(this.activeLevelIndex));
      this.ui.btnGoLevels.addEventListener('click', () => this.showLevelSelect());
      this.ui.btnGoMenu.addEventListener('click', () => this.showMenu());

      this.renderLevelTiles();
    }

    _bindTouch() {
      const touch = document.getElementById('touch');
      if (!touch) return;

      const set = (action, value) => {
        if (!value) {
          this.input.down[action] = false;
          return;
        }
        if (!this.input.down[action]) this.input.pressed[action] = true;
        this.input.down[action] = true;
      };

      const clear = (action) => {
        this.input.down[action] = false;
        this.input.released[action] = true;
      };

      const buttons = touch.querySelectorAll('button[data-action]');
      for (const btn of buttons) {
        const action = btn.getAttribute('data-action');
        if (!action) continue;

        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          btn.setPointerCapture(e.pointerId);
          set(action, true);
        });

        btn.addEventListener('pointerup', (e) => {
          e.preventDefault();
          clear(action);
        });

        btn.addEventListener('pointercancel', () => clear(action));
      }

      const wantsTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (wantsTouch) this.ui.touch.hidden = false;
    }

    _bindResize() {
      window.addEventListener('resize', () => this.resize());
    }

    resize() {
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(240, Math.floor(rect.height));
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.view.w = w;
      this.view.h = h;
    }

    showMenu() {
      this.state = 'menu';
      this.timerRunning = false;
      this._showOnly('menu');
    }

    showLevelSelect() {
      this.state = 'levelSelect';
      this.timerRunning = false;
      this.renderLevelTiles();
      this._showOnly('levels');
    }

    _showOnly(which) {
      const s = this.ui;
      s.menu.hidden = which !== 'menu';
      s.levels.hidden = which !== 'levels';
      s.complete.hidden = which !== 'complete';
      s.gameover.hidden = which !== 'gameover';
      s.hud.hidden = which !== 'hud';

      // Touch controls should only show while playing.
      if (which !== 'hud') s.touch.hidden = true;
      if (which === 'hud' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) s.touch.hidden = false;
    }

    renderLevelTiles() {
      const grid = this.ui.levelGrid;
      grid.innerHTML = '';

      this.levels.forEach((lvl, idx) => {
        const tile = document.createElement('div');
        tile.className = 'level-tile';

        const left = document.createElement('div');
        left.className = 'meta';

        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = lvl.name;

        const best = document.createElement('div');
        best.className = 'best';
        const bestTime = this.bestTimes[String(lvl.id)];
        best.textContent = `Best: ${bestTime == null ? '—' : formatTime(bestTime)}`;

        left.appendChild(name);
        left.appendChild(best);

        const btn = document.createElement('button');
        btn.textContent = idx + 1 <= this.unlocked ? 'Play' : 'Locked';
        btn.disabled = idx + 1 > this.unlocked;
        btn.addEventListener('click', () => this.startLevel(idx));

        tile.appendChild(left);
        tile.appendChild(btn);
        grid.appendChild(tile);
      });
    }

    resetProgress() {
      this.unlocked = 1;
      this.bestTimes = {};
      storage.set(STORAGE_KEYS.unlocked, this.unlocked);
      storage.set(STORAGE_KEYS.bestTimes, this.bestTimes);
      this.toastMsg('Progress reset.');
      this.renderLevelTiles();
    }

    startLevel(index) {
      this.activeLevelIndex = clamp(index, 0, this.levels.length - 1);
      this.level = this.levels[this.activeLevelIndex];
      this.level.resetDynamics();

      this.lives = CONFIG.defaultLives;
      this.checkpointIndex = -1;
      this.respawn.x = this.level.start.x;
      this.respawn.y = this.level.start.y;
      this.player.spawnAt(this.respawn.x, this.respawn.y);

      this.elapsedSeconds = 0;
      this.levelStartMs = performance.now();
      this.timerRunning = true;

      this.toastMsg('Go! Reach checkpoints to save progress.');
      this._showOnly('hud');
      this.state = 'playing';
    }

    toastMsg(text, duration = 1.6) {
      this.toast.text = text;
      this.toast.t = duration;
      this.ui.toast.textContent = text;
      this.ui.toast.classList.add('show');
    }

    _updateToast(dt) {
      this.toast.t = Math.max(0, this.toast.t - dt);
      if (this.toast.t <= 0) this.ui.toast.classList.remove('show');
    }

    _frame(nowMs) {
      const dt = clamp((nowMs - this.lastMs) / 1000, 0, 1 / 20);
      this.lastMs = nowMs;

      this.update(dt);
      this.render();

      this.input.frameReset();
      requestAnimationFrame((t) => this._frame(t));
    }

    update(dt) {
      if (this.state !== 'playing' || !this.level) {
        this._updateToast(dt);
        return;
      }

      if (this.timerRunning) this.elapsedSeconds = (performance.now() - this.levelStartMs) / 1000;

      // Pre-update for platform deltas
      this.level.preUpdate();
      this.level.update(dt);

      // Carry player with platforms after they move.
      if (this.player.standingOn) {
        const on = this.player.standingOn;
        this.player.x += on.delta.x;
        this.player.y += on.delta.y;
      }

      if (this.input.wasPressed('respawn')) {
        this.killPlayer('Respawned.');
        return;
      }

      const solids = this.level.getSolids();
      this.player.update(dt, this.input, solids);

      // Bounds & fall detection
      const outBottom = this.player.y > this.level.bounds.y + this.level.bounds.h + 600;
      const outSides =
        this.player.x < this.level.bounds.x - 200 || this.player.x > this.level.bounds.x + this.level.bounds.w + 200;
      if (outBottom || outSides) {
        this.killPlayer('Fell!');
        return;
      }

      // Hazards
      const pr = this.player.rect;
      for (const s of this.level.spikes) {
        if (rectsOverlap(pr, expandedRect(s.rect, -4))) {
          this.killPlayer('Ouch! Spikes.');
          return;
        }
      }

      for (const r of this.level.rotators) {
        if (r.hitsRect(expandedRect(pr, -3))) {
          this.killPlayer('Smacked!');
          return;
        }
      }

      // Checkpoints
      this.level.checkpoints.forEach((cp, idx) => {
        if (cp.reached) return;
        if (rectsOverlap(pr, cp.rect)) {
          cp.reached = true;
          this.checkpointIndex = idx;
          this.respawn.x = cp.spawnX;
          this.respawn.y = cp.spawnY;
          this.toastMsg(`Checkpoint ${idx + 1} reached!`, 1.7);
          this.camera.shake = Math.max(this.camera.shake, 0.28);
        }
      });

      // Goal
      if (rectsOverlap(pr, this.level.goal.rect)) {
        this.completeLevel();
        return;
      }

      // HUD
      this.ui.hudLevel.textContent = this.level.name;
      this.ui.hudTime.textContent = formatTime(this.elapsedSeconds);
      this.ui.hudLives.textContent = String(this.lives);
      this.ui.hudCheckpoint.textContent = this.checkpointIndex >= 0 ? String(this.checkpointIndex + 1) : '—';

      this.camera.update(dt, this.player.rect, this.level.bounds, this.view);
      this._updateToast(dt);
    }

    killPlayer(reason) {
      if (!this.level) return;
      this.lives -= 1;
      this.camera.shake = Math.max(this.camera.shake, 0.45);

      if (this.lives <= 0) {
        this.timerRunning = false;
        this.state = 'gameover';
        this._showOnly('gameover');
        this.toastMsg('');
        return;
      }

      // Reset falling blocks on each respawn for fairness.
      for (const f of this.level.falling) f.reset();

      this.player.spawnAt(this.respawn.x, this.respawn.y);
      if (reason) this.toastMsg(reason, 1.2);
    }

    completeLevel() {
      const lvl = this.level;
      if (!lvl) return;

      this.timerRunning = false;
      this.state = 'complete';

      const time = this.elapsedSeconds;
      const key = String(lvl.id);
      const prevBest = this.bestTimes[key];
      const isNewBest = prevBest == null || time < prevBest;

      if (isNewBest) {
        this.bestTimes[key] = time;
        storage.set(STORAGE_KEYS.bestTimes, this.bestTimes);
      }

      // Unlock next level
      const nextUnlock = clamp(this.activeLevelIndex + 2, 1, this.levels.length);
      if (nextUnlock > this.unlocked) {
        this.unlocked = nextUnlock;
        storage.set(STORAGE_KEYS.unlocked, this.unlocked);
      }

      this.ui.completeTime.textContent = formatTime(time);
      this.ui.completeBest.textContent = formatTime(this.bestTimes[key]);
      this.ui.completeNote.hidden = !isNewBest;
      this.ui.completeNote.textContent = isNewBest ? 'New best time saved!' : '';

      const nextIdx = this.activeLevelIndex + 1;
      const canNext = nextIdx < this.levels.length && nextIdx + 1 <= this.unlocked;
      this.ui.btnNext.disabled = !canNext;

      this._showOnly('complete');
    }

    render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.view.w, this.view.h);

      // Sky
      const g = ctx.createLinearGradient(0, 0, 0, this.view.h);
      g.addColorStop(0, 'rgba(18, 28, 64, 0.92)');
      g.addColorStop(0.55, 'rgba(10, 12, 18, 0.95)');
      g.addColorStop(1, 'rgba(6, 8, 12, 1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.view.w, this.view.h);

      if (!this.level) return;

      // World
      ctx.save();
      ctx.translate(-this.camera.x, -this.camera.y);
      this.camera.apply(ctx);

      // Parallax silhouettes
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = 'rgba(94, 231, 255, 0.2)';
      for (let i = 0; i < 14; i++) {
        const x = this.level.bounds.x + i * 220;
        const y = this.level.bounds.y + 90 + Math.sin(i * 0.6) * 20;
        ctx.fillRect(x, y, 120, 6);
      }
      ctx.restore();

      this.level.render(ctx);
      this.player.render(ctx);

      // Boundary vignette
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.level.bounds.x + 1, this.level.bounds.y + 1, this.level.bounds.w - 2, this.level.bounds.h - 2);
      ctx.restore();

      ctx.restore();

      // On-screen hint while playing
      if (this.state === 'playing') {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(10, this.view.h - 40, 240, 28);
        ctx.fillStyle = 'rgba(233,238,252,0.9)';
        ctx.font = '12px ui-sans-serif, system-ui';
        ctx.fillText('Tip: R to respawn (costs a life)', 18, this.view.h - 22);
        ctx.restore();
      }
    }
  }

  const boot = () => {
    const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
    if (!canvas) throw new Error('Missing #game canvas');
    new Game(canvas);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
