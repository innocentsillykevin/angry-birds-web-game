/* 游戏规则和物理模拟。浏览器和自动测试共用这一个文件。 */
(function (root) {
  'use strict';
  // 试着改这三个数字：鸟的数量、重力、弹射力度。
  const CONFIG = { birds: 3, gravity: 1, power: 0.19, minDrag: 28, maxDrag: 88, anchor: { x: 228, y: 405 }, width: 1200, height: 660, ground: 570 };
  // 每关的木块为 [中心 x, 中心 y, 宽, 高]，目标为 [x, y]。
  const LEVELS = [
    {
      name: '林间小木塔',
      blocks: [[810,514,20,110],[910,514,20,110],[955,514,20,110],[1055,514,20,110],
        [860,452,140,18],[1005,452,140,18],[875,413,18,60],[990,413,18,60],[932,374,155,18]],
      targets: [[860,545],[1005,545],[932,340]]
    },
    {
      name: '双塔守卫',
      blocks: [[770,514,20,110],[870,514,20,110],[970,514,20,110],[1070,514,20,110],
        [820,452,140,18],[1020,452,140,18]],
      targets: [[820,545],[1020,545],[820,418],[1020,418]]
    },
    {
      name: '森林大堡垒',
      blocks: [[750,514,20,110],[850,514,20,110],[950,514,20,110],[1050,514,20,110],
        [800,452,140,18],[1000,452,140,18],[800,389,20,108],[1000,389,20,108],
        [900,326,240,18]],
      targets: [[800,545],[900,545],[1000,545],[900,418],[900,292]]
    }
  ];

  class Game {
    constructor(Matter) { this.M = Matter; this.levelIndex = 0; this.reset(); }
    get level() { return LEVELS[this.levelIndex]; }
    get hasNextLevel() { return this.levelIndex < LEVELS.length - 1; }
    nextLevel() {
      if (this.phase !== 'won' || !this.hasNextLevel) return false;
      this.levelIndex++; this.reset(); return true;
    }
    restartCampaign() { this.levelIndex = 0; this.reset(); }
    reset() {
      const M = this.M;
      if (this.engine) { M.Events.off(this.engine); M.Engine.clear(this.engine); }
      this.engine = M.Engine.create({ enableSleeping: true });
      this.engine.gravity.y = CONFIG.gravity;
      this.totalShots = CONFIG.birds + this.levelIndex;
      this.targetCount = this.level.targets.length;
      this.phase = 'ready'; this.shots = this.totalShots; this.score = 0;
      this.time = 0; this.flightTime = 0; this.quiet = 0;
      this.effects = []; this.trail = []; this.pending = new Set();
      this.blocks = []; this.targets = []; this.birds = [];
      const ground = M.Bodies.rectangle(600, 610, 2600, 80, { isStatic: true, label: 'ground', friction: 0.8 });
      M.Composite.add(this.engine.world, ground);
      const wood = (x, y, w, h) => {
        const b = M.Bodies.rectangle(x, y, w, h, { label: 'wood', density: 0.0018, friction: 0.65, restitution: 0.03, chamfer: { radius: 2 } });
        b.plugin = { w, h }; this.blocks.push(b); M.Composite.add(this.engine.world, b);
      };
      // 坐标越往右，物体离弹弓越远。
      this.level.blocks.forEach(parts => wood(...parts));
      this.level.targets.forEach(([x, y]) => {
        const pig = M.Bodies.circle(x, y, 24, { label: 'pig', density: 0.0012, friction: 0.7, restitution: 0.05 });
        this.targets.push(pig); M.Composite.add(this.engine.world, pig);
      });
      // 先让木塔站稳，再开始计算碰撞得分。
      for (let i = 0; i < 100; i++) M.Engine.update(this.engine, 1000 / 60);
      this.spawnBird();
      M.Events.on(this.engine, 'collisionStart', event => {
        if (this.phase !== 'flying') return;
        for (const { bodyA: a, bodyB: b } of event.pairs) {
          const speed = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
          for (const [body, other] of [[a, b], [b, a]]) {
            if (body.label === 'pig' && speed > 1.7 && other.label !== 'pig') this.pending.add(body);
            if (body.label === 'wood' && speed > 4.3 && other.label !== 'ground') this.pending.add(body);
          }
        }
      });
    }
    spawnBird() {
      const M = this.M;
      this.bird = M.Bodies.circle(CONFIG.anchor.x, CONFIG.anchor.y, 25, { label: 'bird', density: 0.007, restitution: 0.28, friction: 0.6, frictionAir: 0.0015 });
      M.Body.setStatic(this.bird, true);
      this.birds.push(this.bird); M.Composite.add(this.engine.world, this.bird);
      this.trail = []; this.phase = 'ready'; this.flightTime = 0; this.quiet = 0;
    }
    aim(x, y) {
      if (this.phase !== 'ready') return;
      let dx = x - CONFIG.anchor.x, dy = y - CONFIG.anchor.y;
      const scale = Math.min(1, CONFIG.maxDrag / (Math.hypot(dx, dy) || 1));
      this.M.Body.setPosition(this.bird, { x: CONFIG.anchor.x + dx * scale, y: CONFIG.anchor.y + dy * scale });
    }
    launch() {
      if (this.phase !== 'ready') return false;
      const dx = CONFIG.anchor.x - this.bird.position.x, dy = CONFIG.anchor.y - this.bird.position.y;
      // 放回弹弓附近时取消发射，保持静止和待发射状态。
      if (Math.hypot(dx, dy) < CONFIG.minDrag) { this.aim(CONFIG.anchor.x, CONFIG.anchor.y); return false; }
      this.M.Body.setStatic(this.bird, false);
      this.M.Body.setVelocity(this.bird, { x: dx * CONFIG.power, y: dy * CONFIG.power });
      this.M.Sleeping.set(this.bird, false);
      this.shots--; this.phase = 'flying'; this.flightTime = 0; return true;
    }
    step(delta) {
      const M = this.M;
      this.time += delta;
      M.Engine.update(this.engine, delta);
      this.effects = this.effects.filter(e => this.time - e.time < 1100);
      for (const body of this.pending) {
        const pig = body.label === 'pig';
        this.effects.push({ x: body.position.x, y: body.position.y, time: this.time, pig, points: pig ? 1000 : 100 });
        this.score += pig ? 1000 : 100;
        M.Composite.remove(this.engine.world, body);
        this.targets = this.targets.filter(b => b !== body);
        this.blocks = this.blocks.filter(b => b !== body);
      }
      this.pending.clear();
      if (this.phase !== 'flying') return;
      this.flightTime += delta;
      if (this.trail.length === 0 || Math.hypot(this.bird.position.x - this.trail.at(-1).x, this.bird.position.y - this.trail.at(-1).y) > 17) {
        this.trail.push({ ...this.bird.position }); if (this.trail.length > 90) this.trail.shift();
      }
      for (const pig of this.targets) if (pig.position.y > 700 || pig.position.x > 1280 || pig.position.x < -80) this.pending.add(pig);
      if (!this.targets.length) { this.score += this.shots * 500; this.phase = 'won'; return; }
      const out = this.bird.position.x < -80 || this.bird.position.x > 1350 || this.bird.position.y > 720;
      const moving = [...this.targets, ...this.blocks, ...(out ? [] : [this.bird])].some(b => b.speed > 0.45);
      this.quiet = moving ? 0 : this.quiet + delta;
      if ((this.flightTime > 1600 && this.quiet > 650) || this.flightTime > 10000) {
        if (this.shots > 0) this.spawnBird(); else this.phase = 'lost';
      }
    }
  }
  const api = { Game, CONFIG, LEVELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BirdGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
