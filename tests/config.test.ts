import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../assets/scripts/framework/Config';

test('empty raw config yields empty arrays', () => {
  const c = normalizeConfig({} as any);
  assert.deepEqual(c.heroes, []);
  assert.deepEqual(c.skills, []);
  assert.deepEqual(c.enemies, []);
  assert.deepEqual(c.stages, []);
});

test('skill gets default cd when missing', () => {
  const c = normalizeConfig({ skills: [{ id: 's1', name: '斩', damage: 10 }] } as any);
  assert.equal(c.skills[0].cd, 6);
  assert.equal(c.skills[0].mult, 1.5);
  assert.equal(c.skills[0].range, 150);
});

test('hero gets default stats', () => {
  const c = normalizeConfig({ heroes: [{ id: 'h1', name: '将' }] } as any);
  assert.equal(c.heroes[0].hp, 100);
  assert.equal(c.heroes[0].atk, 10);
  assert.equal(c.heroes[0].speed, 300);
});

test('invalid enemy is filtered out', () => {
  const c = normalizeConfig({
    enemies: [
      { id: 'e1', name: '兵', hp: 0 },
      { id: 'e2', name: '将', hp: 50 },
    ],
  } as any);
  assert.equal(c.enemies.length, 1);
  assert.equal(c.enemies[0].id, 'e2');
});

test('skill type defaults to aoe and enemy boss defaults false', () => {
  const c = normalizeConfig({
    skills: [{ id: 's1', name: '斩' }],
    enemies: [{ id: 'e1', name: '兵', hp: 10 }],
  } as any);
  assert.equal(c.skills[0].type, 'aoe');
  assert.equal(c.enemies[0].boss, false);
});

test('stage waves normalize count and drop non-arrays', () => {
  const c = normalizeConfig({
    stages: [{ id: '1-1', waves: [[{ enemy: 'e1', count: 2 }], 'bad'] }],
  } as any);
  assert.equal(c.stages[0].waves.length, 1);
  assert.equal(c.stages[0].waves[0][0].count, 2);
  assert.equal(c.stages[0].firstCoins, 0);
});
