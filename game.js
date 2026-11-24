/* 画面和操作在这里。物理与游戏规则在 game-core.js。 */
(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  if (!window.Matter || !window.BirdGame) { $('status').textContent = '游戏文件没有加载完整，请保留 vendor 文件夹后重新打开。'; return; }
  const { Game, CONFIG: C, LEVELS } = BirdGame;
  const game = new Game(Matter);
  let dragging = false, sound = false, audio, shownResult = false, last = 0, accumulator = 0;
  let lastScore = 0, lastPhase = 'ready';
  const sky = document.createElement('canvas'); sky.width = C.width; sky.height = C.height;
  const s = sky.getContext('2d');

  function ellipse(context, x, y, rx, ry, fill) {
    context.beginPath(); context.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); context.fillStyle = fill; context.fill();
  }
  function path(context, points, fill, stroke, width = 1) {
    context.beginPath(); points.forEach(([x, y], i) => i ? context.lineTo(x, y) : context.moveTo(x, y));
    if (fill) { context.closePath(); context.fillStyle = fill; context.fill(); }
    if (stroke) { context.strokeStyle = stroke; context.lineWidth = width; context.lineCap = 'round'; context.lineJoin = 'round'; context.stroke(); }
  }
  function cloud(x, y, scale) {
    s.save(); s.translate(x, y); s.scale(scale, scale);
    [[0, 0, 45, 19], [-28, 0, 24, 18], [-11, -17, 25, 24], [18, -12, 31, 27], [44, 1, 24, 16]].forEach(a => ellipse(s, ...a, '#f2faf1'));
    s.restore();
  }
  function tree(x, y, scale) {
    s.save(); s.translate(x, y); s.scale(scale, scale);
    s.fillStyle = '#8e8d59'; s.fillRect(-5, -82, 10, 92);
    ellipse(s, 0, -110, 41, 64, '#74a77d'); ellipse(s, -16, -93, 34, 44, '#83b286');
    path(s, [[0, -30], [0, -132]], null, '#6a936d', 3);
    path(s, [[0, -65], [-20, -88]], null, '#6a936d', 3); s.restore();
  }
  function makeLandscape() {
    s.fillStyle = '#c9e6e8'; s.fillRect(0, 0, 1200, 660);
    ellipse(s, 1042, 135, 46, 46, '#f6efb9'); ellipse(s, 1042, 135, 61, 61, '#f9f0ba32');
    cloud(190, 140, 1.2); cloud(550, 100, .7); cloud(810, 180, 1.05); cloud(1120, 275, .65);
    path(s, [[0, 465], [120, 330], [210, 391], [345, 260], [465, 405], [620, 325], [800, 440], [980, 295], [1200, 460], [1200, 590], [0, 590]], '#acd0bf');
    path(s, [[267, 352], [345, 260], [413, 342], [365, 323], [345, 298], [319, 326]], '#d4e6d3');
    s.beginPath(); s.moveTo(0, 490); s.bezierCurveTo(240, 330, 430, 570, 700, 456); s.bezierCurveTo(930, 370, 1020, 406, 1200, 446); s.lineTo(1200, 600); s.lineTo(0, 600); s.fillStyle = '#97bf91'; s.fill();
    [50, 460, 680, 1130, 1175].forEach((x, i) => tree(x, 557, [.82, .68, .56, 1.1, .8][i]));
    s.beginPath(); s.moveTo(0, 548); s.bezierCurveTo(200, 520, 400, 557, 620, 539); s.bezierCurveTo(900, 500, 1030, 541, 1200, 532); s.lineTo(1200, 590); s.lineTo(0, 590); s.fillStyle = '#85ad6b'; s.fill();
    s.fillStyle = '#dfc28a'; s.fillRect(0, 575, 1200, 85); s.fillStyle = '#719b51'; s.fillRect(0, 570, 1200, 12); s.fillStyle = '#8db45c'; s.fillRect(0, 568, 1200, 5);
    for (let i = 0; i < 65; i++) ellipse(s, (i * 83 + 19) % 1200, 595 + (i * 31) % 61, 2 + i % 3, 1.5, '#c8a76b');
    for (const x of [35, 85, 330, 490, 650, 1120, 1160]) {
      path(s, [[x - 7, 570], [x - 10, 554], [x, 565], [x + 3, 550], [x + 7, 568]], null, '#658c49', 3);
    }
    ellipse(s, 228, 576, 66, 9, '#5a733f33');
    ellipse(s, 938, 576, 169, 8, '#5a733f22');
  }
  makeLandscape();

  function bird(x, y, r, angle = 0, faded = false) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalAlpha = faded ? .45 : 1;
    path(ctx, [[-r + 3, 5], [-r - 15, -3], [-r - 13, 10], [-r + 2, 13]], '#573d35');
    path(ctx, [[-5, -r + 4], [-12, -r - 10], [-1, -r - 6], [5, -r - 13], [10, -r + 5]], '#b32e30');
    ellipse(ctx, 0, 0, r, r * .95, '#d84a3e');
    ellipse(ctx, 2, r * .5, r * .67, r * .42, '#f7d5aa');
    ellipse(ctx, 7, -5, r * .34, r * .36, '#fffbed'); ellipse(ctx, 18, -5, r * .24, r * .31, '#fffbed');
    ellipse(ctx, 11, -4, 2.7, 4, '#303932'); ellipse(ctx, 20, -4, 2.4, 3.5, '#303932');
    path(ctx, [[5, -14], [14, -11]], null, '#50392f', 3.5); path(ctx, [[17, -11], [23, -14]], null, '#50392f', 3);
    path(ctx, [[14, 3], [r + 12, 7], [15, 13]], '#eab348', '#be8031', 1);
    ctx.restore();
  }
  function pig(body) {
    ctx.save(); ctx.translate(body.position.x, body.position.y); ctx.rotate(body.angle);
    ellipse(ctx, -13, -21, 8, 10, '#6b9c50'); ellipse(ctx, 12, -21, 8, 10, '#6b9c50');
    ellipse(ctx, -13, -22, 3, 5, '#acc575'); ellipse(ctx, 12, -22, 3, 5, '#acc575');
    ellipse(ctx, 0, 0, 25, 24, '#90b95c'); ellipse(ctx, -7, -6, 7, 8, '#fffce9'); ellipse(ctx, 11, -6, 7, 8, '#fffce9');
    ellipse(ctx, -5, -5, 2.4, 3.3, '#344932'); ellipse(ctx, 9, -5, 2.4, 3.3, '#344932');
    ellipse(ctx, 2, 8, 14, 10, '#b9d67b'); ellipse(ctx, -3, 8, 2.5, 3.5, '#6c954a'); ellipse(ctx, 7, 8, 2.5, 3.5, '#6c954a');
    ctx.restore();
  }
  function block(body) {
    const { w, h } = body.plugin;
    ctx.save(); ctx.translate(body.position.x, body.position.y); ctx.rotate(body.angle);
    ctx.fillStyle = '#b4763e'; ctx.strokeStyle = '#8c592f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#dcaa63'; ctx.fillRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
    ctx.strokeStyle = '#b97d42'; ctx.lineWidth = 1.5;
    if (h > w) { path(ctx, [[-3, -h / 2 + 9], [-3, h / 2 - 9]], null, '#bd8548', 1); ellipse(ctx, 2, 15, 3, 7, '#c28b4c'); }
    else { path(ctx, [[-w / 2 + 10, 0], [w / 2 - 10, 0]], null, '#bd8548', 1); ellipse(ctx, 20, 0, 7, 3, '#c28b4c'); }
    ctx.restore();
  }
  function sling(front) {
    if (!front) path(ctx, [[228, 564], [228, 461], [210, 412], [208, 394]], null, '#74462c', 17);
    else path(ctx, [[228, 563], [229, 464], [250, 419], [251, 393]], null, '#9a6234', 17);
    if (front) path(ctx, [[233, 551], [234, 466], [253, 420]], null, '#bc8a4c', 4);
  }
  function band(x) {
    const p = game.phase === 'ready' ? game.bird.position : C.anchor;
    path(ctx, [[x, 402], [p.x - 5, p.y + 6]], null, '#594237', 7);
  }
  function trajectory() {
    if (game.phase !== 'ready') return;
    const p = game.bird.position, dx = C.anchor.x - p.x, dy = C.anchor.y - p.y;
    if (Math.hypot(dx, dy) < C.minDrag) return;
    // 与引擎一致：每步先应用空气阻力和重力，再移动。
    let x = p.x, y = p.y, vx = dx * C.power, vy = dy * C.power;
    for (let i = 0; i < 80; i++) {
      vx *= .9985; vy = vy * .9985 + C.gravity * (1000 / 60) ** 2 * .001; x += vx; y += vy;
      if (y > C.ground - 22) break;
      if (i % 4 === 0) ellipse(ctx, x, y, 3.5, 3.5, `rgba(255,255,244,${.9 - i / 100})`);
    }
  }
  function render() {
    ctx.drawImage(sky, 0, 0);
    game.trail.forEach((p, i) => ellipse(ctx, p.x, p.y, 2.3, 2.3, `rgba(255,255,244,${.15 + i / game.trail.length * .5})`));
    trajectory(); sling(false); band(208);
    for (const b of game.blocks) block(b);
    for (const p of game.targets) pig(p);
    for (let i = 0; i < Math.max(0, game.shots - (game.phase === 'ready' ? 1 : 0)); i++) bird(87 + i * 55, 548, 20);
    for (const b of game.birds) if (b.position.x > -70 && b.position.x < 1300 && b.position.y < 720) bird(b.position.x, b.position.y, 25, b.angle);
    band(251); sling(true);
    for (const e of game.effects) {
      const age = (game.time - e.time) / 1100;
      ctx.save(); ctx.globalAlpha = 1 - age;
      for (let i = 0; i < 9; i++) {
        const a = i * Math.PI * 2 / 9, distance = age * 65;
        ellipse(ctx, e.x + Math.cos(a) * distance, e.y + Math.sin(a) * distance + age * age * 40, 3 * (1 - age), 3 * (1 - age), e.pig ? '#9cba56' : '#d99d50');
      }
      ctx.fillStyle = '#32573b'; ctx.font = 'bold 23px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`+${e.points}`, e.x, e.y - 30 - age * 45); ctx.restore();
    }
  }
  function beep(frequency, duration = .12) {
    if (!sound) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const o = audio.createOscillator(), gain = audio.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(frequency, audio.currentTime); o.frequency.exponentialRampToValueAtTime(frequency * .5, audio.currentTime + duration);
      gain.gain.setValueAtTime(.05, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
      o.connect(gain); gain.connect(audio.destination); o.start(); o.stop(audio.currentTime + duration);
    } catch { sound = false; $('sound').textContent = '声音：关'; $('sound').setAttribute('aria-pressed', 'false'); }
  }
  function updateUI() {
    const progress = `第 ${game.levelIndex + 1} / ${LEVELS.length} 关`;
    $('level-progress').textContent = progress;
    $('level-name').textContent = game.level.name;
    $('level-stamp').textContent = `${progress} · ${game.level.name}`;
    document.title = `Angry Birds · ${progress}`;
    $('score').textContent = game.score.toLocaleString('zh-CN');
    $('birds').textContent = `剩余小鸟 ${game.shots} / ${game.totalShots}`;
    $('targets').textContent = `目标 ${game.targetCount - game.targets.length} / ${game.targetCount}`;
    $('aim-hint').style.opacity = game.shots === game.totalShots && game.phase === 'ready' && !dragging ? '1' : '0';
    if (game.score > lastScore) beep(460);
    lastScore = game.score;
    if (game.phase !== lastPhase) {
      if (game.phase === 'flying') $('status').textContent = '小鸟出发！等它落稳，下一只就会准备好。';
      else if (game.phase === 'ready') $('status').textContent = `再来一次！还有 ${game.targets.length} 个目标。试着调整拉伸角度。`;
      lastPhase = game.phase;
    }
    if ((game.phase === 'won' || game.phase === 'lost') && !shownResult) {
      dragging = false; shownResult = true;
      const won = game.phase === 'won';
      const complete = won && !game.hasNextLevel;
      $('result-stars').textContent = won ? '★ ★ ★' : '再试一次';
      $('result-title').textContent = complete ? '恭喜，全部通关！' : won ? `第 ${game.levelIndex + 1} 关通过！` : '就差一点点！';
      const points = `本关 ${game.score.toLocaleString('zh-CN')} 分`;
      $('result-description').textContent = complete ? `${points}。三个关卡全部完成，弹弓高手就是你！` : won ? `${points}，剩余小鸟奖励已计入。下一关：${LEVELS[game.levelIndex + 1].name}。` : `${points}。往左后方拉，试试不同的高度。`;
      $('play-again').textContent = complete ? '从第一关再玩' : won ? '下一关 →' : '重试本关';
      $('status').textContent = complete ? '三个关卡全部通关！可以从第一关重新挑战。' : won ? '过关啦！点击“下一关”继续挑战。' : '这一关结束了，点击“重试本关”再挑战。';
      $('result').hidden = false; $('play-again').focus({ preventScroll: true });
      if (won) beep(880, .4);
    }
  }
  function prepareLevel() {
    dragging = false; shownResult = false; lastScore = 0; lastPhase = 'ready';
    last = 0; accumulator = 0;
    $('result').hidden = true;
    $('status').textContent = `第 ${game.levelIndex + 1} 关：${game.totalShots} 只小鸟，击中全部 ${game.targetCount} 个绿团子就能过关。`;
    canvas.focus({ preventScroll: true }); updateUI(); render();
  }
  function restart() { game.reset(); prepareLevel(); }
  function continueGame() {
    if (game.phase === 'won') {
      if (!game.nextLevel()) game.restartCampaign();
    } else if (game.phase === 'lost') game.reset();
    else return;
    prepareLevel();
  }
  function position(event) {
    const r = canvas.getBoundingClientRect();
    return { x: (event.clientX - r.left) * C.width / r.width, y: (event.clientY - r.top) * C.height / r.height };
  }
  canvas.addEventListener('pointerdown', event => {
    if (game.phase !== 'ready' || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const p = position(event);
    if (Math.hypot(p.x - game.bird.position.x, p.y - game.bird.position.y) > 80) return;
    event.preventDefault(); canvas.focus({ preventScroll: true }); dragging = true;
    canvas.setPointerCapture(event.pointerId); game.aim(p.x, p.y);
  });
  canvas.addEventListener('pointermove', event => { if (dragging) { const p = position(event); game.aim(p.x, p.y); } });
  canvas.addEventListener('pointerup', event => {
    if (!dragging) return;
    const p = position(event); game.aim(p.x, p.y); dragging = false;
    if (game.launch()) beep(340, .2);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  });
  const cancel = () => { if (dragging) { dragging = false; game.aim(C.anchor.x, C.anchor.y); } };
  canvas.addEventListener('pointercancel', cancel); canvas.addEventListener('lostpointercapture', cancel); window.addEventListener('blur', cancel);
  canvas.addEventListener('keydown', event => {
    if (event.key.toLowerCase() === 'r') { event.preventDefault(); restart(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) return;
    event.preventDefault();
    if (game.phase !== 'ready') return;
    if (event.key === ' ') { if (game.launch()) beep(340, .2); return; }
    const p = game.bird.position;
    const delta = { ArrowLeft: [-6, 0], ArrowRight: [6, 0], ArrowUp: [0, -6], ArrowDown: [0, 6] }[event.key];
    game.aim(p.x + delta[0], p.y + delta[1]); $('aim-hint').style.opacity = '0';
  });
  $('restart').addEventListener('click', restart); $('play-again').addEventListener('click', continueGame);
  $('sound').addEventListener('click', () => { sound = !sound; $('sound').textContent = `声音：${sound ? '开' : '关'}`; $('sound').setAttribute('aria-pressed', String(sound)); if (sound) beep(600); });
  $('help').addEventListener('click', () => { const open = $('instructions').hidden; $('instructions').hidden = !open; $('help').setAttribute('aria-expanded', String(open)); });
  document.addEventListener('visibilitychange', () => { last = 0; accumulator = 0; cancel(); });
  function frame(timestamp) {
    if (!last) last = timestamp;
    accumulator += Math.min(timestamp - last, 50); last = timestamp;
    while (accumulator >= 1000 / 60) { game.step(1000 / 60); accumulator -= 1000 / 60; }
    render(); updateUI(); requestAnimationFrame(frame);
  }
  updateUI(); render(); requestAnimationFrame(frame);
})();
