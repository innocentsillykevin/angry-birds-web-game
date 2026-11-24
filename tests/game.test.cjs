const test = require('node:test');
const assert = require('node:assert/strict');
const Matter = require('../dist/vendor/matter.min.js');
let core = {};
try { core = require('../dist/game-core.js'); } catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

test('game provides a playable simulation', () => {
  assert.equal(typeof core.Game, 'function', 'Game simulation has not been implemented yet');
});

test('three distinct levels stay locked until the current level is won', () => {
  const game = new core.Game(Matter);
  assert.equal(core.LEVELS.length, 3);
  assert.equal(game.levelIndex, 0);
  assert.equal(game.nextLevel(), false);
  const layouts = new Set();
  for (let level = 0; level < 3; level++) {
    assert.equal(game.levelIndex, level);
    assert.equal(game.targetCount, 3 + level);
    assert.equal(game.targets.length, game.targetCount);
    assert.equal(game.totalShots, core.CONFIG.birds + level);
    assert.equal(game.phase, 'ready');
    layouts.add(JSON.stringify(game.targets.map(b => b.position)));
    // Use the real scoring and victory transition after removing the targets.
    game.aim(145, 433);
    game.launch();
    game.targets.forEach(target => game.pending.add(target));
    game.step(1000 / 60);
    assert.equal(game.phase, 'won');
    assert.equal(game.nextLevel(), level < 2);
  }
  assert.equal(layouts.size, 3);
  assert.equal(game.levelIndex, 2);
  assert.equal(game.phase, 'won');
  game.restartCampaign();
  assert.equal(game.levelIndex, 0);
  assert.equal(game.phase, 'ready');
});

test('retry keeps the current level and clears its score and physics state', () => {
  const game = new core.Game(Matter);
  game.phase = 'won';
  game.nextLevel();
  const oldEngine = game.engine;
  for (let shot = 0; shot < game.totalShots; shot++) {
    game.aim(core.CONFIG.anchor.x + 70, core.CONFIG.anchor.y);
    game.launch();
    for (let frame = 0; frame < 720 && game.phase === 'flying'; frame++) game.step(1000 / 60);
  }
  assert.equal(game.phase, 'lost');
  assert.equal(game.nextLevel(), false);
  game.reset();
  assert.equal(game.levelIndex, 1);
  assert.equal(game.targets.length, 4);
  assert.equal(game.shots, 4);
  assert.equal(game.score, 0);
  assert.equal(game.phase, 'ready');
  assert.notEqual(game.engine, oldEngine);
  assert.equal(game.pending.size, 0);
  assert.equal(game.effects.length, 0);
  assert.equal(game.birds.length, 1);
});

test('every level is stable before launch and can be won through actual shots', () => {
  const solutions = [
    [[145,433],[145,433],[155,455]],
    [[146.94663252774612,439.26881412316123],[153,405]],
    [[142.5222582130214,425.91783112558784],[157.41557330618224,457.5531988398905],[161.84109583560124,463.02585113348965]]
  ];
  const game = new core.Game(Matter);
  for (let level = 0; level < 3; level++) {
    for (let frame = 0; frame < 300; frame++) game.step(1000 / 60);
    assert.equal(game.targets.length, game.targetCount);
    assert.equal(game.score, 0);
    assert.ok(game.targets.every(b => b.position.y < core.CONFIG.ground));
    for (const [x, y] of solutions[level]) {
      game.aim(x, y);
      assert.equal(game.launch(), true);
      for (let frame = 0; frame < 720 && game.phase === 'flying'; frame++) game.step(1000 / 60);
    }
    assert.equal(game.phase, 'won', `level ${level + 1} must be beatable`);
    assert.equal(game.targets.length, 0);
    assert.ok(game.score >= game.targetCount * 1000);
    if (level < 2) assert.equal(game.nextLevel(), true);
  }
});

test('dragging has a maximum distance and an actual launch consumes one bird', () => {
  const game = new core.Game(Matter);
  game.aim(-1000, 1000);
  const p = game.bird.position;
  assert.ok(Math.hypot(p.x - core.CONFIG.anchor.x, p.y - core.CONFIG.anchor.y) <= core.CONFIG.maxDrag + 0.01);
  assert.equal(game.launch(), true);
  assert.equal(game.shots, 2);
  assert.equal(game.phase, 'flying');
  assert.ok(game.bird.velocity.x > 0);
  assert.equal(game.launch(), false);
  assert.equal(game.shots, 2);
});

test('a tap without pulling does not waste a bird', () => {
  const game = new core.Game(Matter);
  assert.equal(game.launch(), false);
  assert.equal(game.shots, 3);
});

test('returning a pulled bird near the sling keeps it loaded for another launch', () => {
  for (const [dx, dy] of [[0, 0], [-24, 0], [24, 0], [0, -24], [0, 24], [-12, 24], [12, -24]]) {
    const game = new core.Game(Matter);
    const bird = game.bird;
    game.aim(145, 433);
    game.aim(228 + dx, 405 + dy);

    assert.equal(game.launch(), false, `return offset (${dx}, ${dy}) should cancel the shot`);
    for (let frame = 0; frame < 180; frame++) game.step(1000 / 60);
    assert.equal(game.phase, 'ready');
    assert.equal(game.shots, 3);
    assert.equal(game.bird, bird);
    assert.equal(game.birds.length, 1);
    assert.equal(bird.isStatic, true);
    assert.deepEqual(bird.position, { x: 228, y: 405 });

    game.aim(145, 433);
    assert.equal(game.launch(), true);
    assert.equal(game.bird, bird);
    assert.equal(game.phase, 'flying');
    assert.equal(game.shots, 2);
    assert.ok(game.bird.velocity.x > 0);
  }
});

test('the return zone has a clear edge and still allows a gentle launch outside it', () => {
  const game = new core.Game(Matter);
  game.aim(200.1, 405);
  assert.equal(game.launch(), false);
  assert.equal(game.shots, 3);
  game.aim(200, 405);
  assert.equal(game.launch(), true);
  assert.equal(game.shots, 2);
  assert.ok(game.bird.velocity.x > 0);
});

test('missing all shots ends the round, and reset restores a fresh level', () => {
  const game = new core.Game(Matter);
  for (let shot = 0; shot < 3; shot++) {
    game.aim(core.CONFIG.anchor.x + 70, core.CONFIG.anchor.y);
    assert.equal(game.launch(), true);
    for (let frame = 0; frame < 720 && game.phase === 'flying'; frame++) game.step(1000 / 60);
  }
  assert.equal(game.phase, 'lost');
  assert.equal(game.shots, 0);
  game.reset();
  assert.equal(game.phase, 'ready');
  assert.equal(game.shots, 3);
  assert.equal(game.targets.length, 3);
  assert.equal(game.score, 0);
});

test('a well aimed shot reaches the structure and can defeat targets', () => {
  const game = new core.Game(Matter);
  game.aim(145, 433);
  game.launch();
  for (let frame = 0; frame < 720 && game.phase === 'flying'; frame++) game.step(1000 / 60);
  assert.ok(game.score > 0, 'The starter level must be hittable');
  assert.ok(game.targets.length < 3, 'A successful impact must defeat at least one target');
});

test('defeating the final target wins the round and prevents extra launches', () => {
  const game = new core.Game(Matter);
  for (const [x, y] of [[145, 433], [145, 433], [155, 455]]) {
    game.aim(x, y);
    assert.equal(game.launch(), true);
    for (let frame = 0; frame < 720 && game.phase === 'flying'; frame++) game.step(1000 / 60);
  }
  assert.equal(game.phase, 'won');
  assert.equal(game.targets.length, 0);
  assert.ok(game.score >= 3000);
  assert.equal(game.launch(), false);
  game.reset();
  assert.equal(game.phase, 'ready');
  assert.equal(game.score, 0);
});
