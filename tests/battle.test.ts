import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, createBattleWaves, step, BODY_RADIUS } from '../assets/scripts/framework/battle/BattleCore';

const player = { id: 'p', hp: 100, maxHp: 100, atk: 10, speed: 300, x: 375, y: 500, cd: 0 };
const enemy = { id: 'e', hp: 30, maxHp: 30, atk: 5, speed: 100, x: 375, y: 800, cd: 0 };

function skills() {
  return [
    { id: 's1', name: '甲', cd: 6, mult: 2, range: 180, cdLeft: 0 },
    { id: 's2', name: '乙', cd: 8, mult: 1.5, range: 150, cdLeft: 0 },
  ];
}

test('player cannot move outside arena', () => {
  let s = createBattle(player, [enemy]);
  s = step(s, 1, { moveX: -1, moveY: 0 });
  assert.ok(s.player.x >= 0, 'x >= 0');
  s = step(s, 10, { moveX: -1, moveY: 0 });
  assert.equal(s.player.x, 0);
});

test('attack respects cooldown', () => {
  let s = createBattle(player, [{ ...enemy, y: 520 }]);
  s = step(s, 0.016, { moveX: 0, moveY: 0, attack: true });
  const hp1 = s.enemies[0].hp;
  s = step(s, 0.1, { moveX: 0, moveY: 0, attack: true });
  assert.equal(s.enemies[0].hp, hp1, 'second attack within cd should not hit');
});

test('attack only hits nearest enemy', () => {
  let s = createBattle(player, [
    { ...enemy, id: 'near', y: 520 },
    { ...enemy, id: 'far', y: 950 },
  ]);
  s = step(s, 0.016, { moveX: 0, moveY: 0, attack: true });
  assert.equal(s.enemies[0].hp, 20);
  assert.equal(s.enemies[1].hp, 30);
});

test('enemy death yields win', () => {
  let s = createBattle(player, [{ ...enemy, hp: 10, y: 520 }]);
  s = step(s, 0.016, { moveX: 0, moveY: 0, attack: true });
  assert.equal(s.result, 'win');
});

test('player death yields lose', () => {
  let s = createBattle({ ...player, hp: 5 }, [{ ...enemy, atk: 999, x: 375, y: 500 }]);
  s = step(s, 0.016, { moveX: 0, moveY: 0 });
  assert.equal(s.result, 'lose');
});

test('finished battle ignores further input', () => {
  let s = createBattle(player, [{ ...enemy, hp: 0 }]);
  s = step(s, 0.016, { moveX: 1, moveY: 1 });
  const x = s.player.x;
  s = step(s, 1, { moveX: 1, moveY: 1, attack: true });
  assert.equal(s.player.x, x);
});

test('skill 0 damages enemies in range and starts its cooldown', () => {
  let s = createBattle(player, [
    { ...enemy, id: 'in', y: 520, hp: 100 },
    { ...enemy, id: 'out', x: 900, y: 520, hp: 100 },
  ], skills());
  s = step(s, 0.016, { moveX: 0, moveY: 0, skill: 0 });
  assert.equal(s.enemies[0].hp, 80, '2x atk in range');
  assert.equal(s.enemies[1].hp, 100, 'out of range untouched');
  assert.equal(s.skills[0].cdLeft, 6);
});

test('skills cool down independently', () => {
  let s = createBattle(player, [{ ...enemy, y: 520, hp: 100 }], skills());
  s = step(s, 0.016, { moveX: 0, moveY: 0, skill: 0 });
  const hpAfterFirst = s.enemies[0].hp;
  s = step(s, 0.1, { moveX: 0, moveY: 0, skill: 1 });
  assert.equal(s.enemies[0].hp, hpAfterFirst - 15, 'second skill 1.5x');
  assert.ok(s.skills[0].cdLeft > 0);
  assert.equal(s.skills[1].cdLeft, 8);
});

test('player and enemy bodies separate on overlap', () => {
  let s = createBattle(player, [{ ...enemy, x: 375, y: 510 }]);
  s = step(s, 0.016, { moveX: 0, moveY: 0 });
  const d = Math.hypot(s.enemies[0].x - s.player.x, s.enemies[0].y - s.player.y);
  assert.ok(d >= BODY_RADIUS * 2 - 1, 'bodies should be separated');
});

test('enemies separate from each other', () => {
  let s = createBattle(player, [
    { ...enemy, id: 'a', x: 600, y: 800 },
    { ...enemy, id: 'b', x: 600, y: 810 },
  ]);
  s = step(s, 0.016, { moveX: 0, moveY: 0 });
  const d = Math.hypot(s.enemies[1].x - s.enemies[0].x, s.enemies[1].y - s.enemies[0].y);
  assert.ok(d >= BODY_RADIUS * 2 - 1, 'enemies should be separated');
});

test('ranged skill hits only nearest target', () => {
  let s = createBattle(player, [
    { ...enemy, id: 'near', y: 520, hp: 100 },
    { ...enemy, id: 'far', y: 900, hp: 100 },
  ], [{ id: 'r', name: '射', cd: 5, mult: 2, range: 300, cdLeft: 0, type: 'ranged' }]);
  s = step(s, 0.016, { moveX: 0, moveY: 0, skill: 0 });
  assert.equal(s.enemies[0].hp, 80);
  assert.equal(s.enemies[1].hp, 100);
});

test('heal skill restores player hp', () => {
  let s = createBattle({ ...player, hp: 40 }, [{ ...enemy, y: 950 }], [
    { id: 'h', name: '疗', cd: 10, mult: 0.3, range: 0, cdLeft: 0, type: 'heal' },
  ]);
  s = step(s, 0.016, { moveX: 0, moveY: 0, skill: 0 });
  assert.equal(s.player.hp, 70);
});

test('boss special damages player in radius', () => {
  const boss = { ...enemy, id: 'boss', hp: 300, atk: 20, x: 375, y: 540, boss: true, specialCd: 0.01 };
  let s = createBattle({ ...player }, [boss]);
  s = step(s, 0.02, { moveX: 0, moveY: 0 });
  assert.ok(s.player.hp < 100, 'boss special should hit');
});

test('waves spawn next group and win only after last wave', () => {
  const wave1 = [{ ...enemy, id: 'w1', hp: 10, y: 520 }];
  const wave2 = [{ ...enemy, id: 'w2', hp: 10, y: 520 }];
  let s = createBattleWaves(player, [wave1, wave2], skills());
  assert.equal(s.enemies[0].id, 'w1');

  s = step(s, 0.016, { moveX: 0, moveY: 0, attack: true });
  assert.equal(s.enemies[0].id, 'w2', 'wave 2 spawned');
  assert.equal(s.result, 'running');

  s = step(s, 0.8, { moveX: 0, moveY: 0 });
  s = step(s, 0.016, { moveX: 0, moveY: 0, attack: true });
  assert.equal(s.result, 'win');
});
