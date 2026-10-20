import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_GAMEPLAY,
  getGameplayConfig,
  normalizeGameplay,
  setGameplayConfig,
} from '../assets/scripts/framework/Config';

test('default gameplay has core attribute and idle values', () => {
  assert.equal(DEFAULT_GAMEPLAY.attributes.points, 60);
  assert.equal(DEFAULT_GAMEPLAY.attributes.cap, 24);
  assert.equal(DEFAULT_GAMEPLAY.idle.offlineCapHours, 8);
});

test('gameplay.json loads and matches the built-in defaults', () => {
  const file = join(__dirname, '../../assets/resources/data/gameplay.json');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const loaded = normalizeGameplay(raw);
  assert.deepEqual(loaded, DEFAULT_GAMEPLAY);
  assert.equal(loaded.permanentSkills.length, 3);
  assert.ok(loaded.skillPool.length >= 8);
  assert.deepEqual(
    loaded.slots.map((s) => s.level),
    [1, 5, 10, 20, 30, 50],
  );
});

test('empty raw gameplay yields defaults', () => {
  assert.deepEqual(normalizeGameplay({}), DEFAULT_GAMEPLAY);
});

test('partial gameplay override keeps other defaults', () => {
  const c = normalizeGameplay({ attributes: { points: 80 } });
  assert.equal(c.attributes.points, 80);
  assert.equal(c.attributes.cap, 24);
  assert.equal(c.attributes.respec.freeUntil, 10);
  assert.equal(c.idle.offlineCapHours, 8);
});

test('invalid gameplay types fall back without throwing', () => {
  let c: any;
  assert.doesNotThrow(() => {
    c = normalizeGameplay({ attributes: { points: 'x' }, slots: 'bad', idle: 3, trial: null });
  });
  assert.equal(c.attributes.points, 60);
  assert.deepEqual(c.slots, DEFAULT_GAMEPLAY.slots);
  assert.equal(c.idle.offlineCapHours, 8);
  assert.equal(c.trial.firstN, 3);
});

test('negative numbers fall back to defaults', () => {
  const c = normalizeGameplay({
    attributes: { points: -5 },
    idle: { offlineCapHours: -1, safe: { coinsPerMin: -2 } },
  });
  assert.equal(c.attributes.points, 60);
  assert.equal(c.idle.offlineCapHours, 8);
  assert.equal(c.idle.safe.coinsPerMin, DEFAULT_GAMEPLAY.idle.safe.coinsPerMin);
});

test('slot tiers override defaults, keep new levels sorted, and stay idempotent', () => {
  const c = normalizeGameplay({
    slots: [
      { level: 60, count: 12 },
      { level: 5, count: 9 },
      { level: 7, count: 3 },
      { level: 1.9, count: 2.9 },
      { level: 20, count: 0 },
    ],
  });
  assert.deepEqual(
    c.slots.map((s) => s.level),
    [1, 5, 7, 10, 20, 30, 50, 60],
  );
  const byLevel = (level: number) => c.slots.find((s) => s.level === level);
  assert.deepEqual(byLevel(1), { level: 1, count: 2 });
  assert.deepEqual(byLevel(5), { level: 5, count: 9 });
  assert.deepEqual(byLevel(7), { level: 7, count: 3 });
  assert.deepEqual(byLevel(10), { level: 10, count: 3 });
  assert.deepEqual(byLevel(20), { level: 20, count: 0 });
  assert.deepEqual(byLevel(60), { level: 60, count: 12 });
  assert.deepEqual(normalizeGameplay(c), c);
});

test('fractional quantity fields are floored to integers', () => {
  const c = normalizeGameplay({ idle: { offlineCapHours: 8.7 }, trial: { firstN: 2.9 } });
  assert.equal(c.idle.offlineCapHours, 8);
  assert.equal(c.trial.firstN, 2);
});

test('invalid skill tag and quality fall back to valid enums', () => {
  const c = normalizeGameplay({
    permanentSkills: [{ id: 'x', name: 'x', desc: 'x', tag: 'nope' }],
    skillPool: [{ defId: 'y', name: 'y', quality: 'nope' }],
  });
  assert.equal(c.permanentSkills[0].tag, 'dps');
  assert.equal(c.skillPool[0].quality, 'common');
});

test('default skill tables are complete', () => {
  assert.equal(DEFAULT_GAMEPLAY.permanentSkills.length, 3);
  assert.ok(DEFAULT_GAMEPLAY.skillPool.length >= 8);
  assert.deepEqual(
    DEFAULT_GAMEPLAY.permanentSkills.map((s) => s.id),
    ['eclipsed_blade', 'night_heart', 'light_engine'],
  );
});

test('setGameplayConfig updates global gameplay config', () => {
  const prev = getGameplayConfig();
  const next = normalizeGameplay({ attributes: { points: 80 } });
  setGameplayConfig(next);
  assert.equal(getGameplayConfig().attributes.points, 80);
  setGameplayConfig(prev);
});

test('setGameplayConfig normalizes and clones the incoming object', () => {
  const prev = getGameplayConfig();
  assert.doesNotThrow(() => setGameplayConfig({} as any));
  assert.equal(getGameplayConfig().attributes.points, 60);
  assert.equal(getGameplayConfig().permanentSkills.length, 3);
  const mine = getGameplayConfig();
  mine.idle.offlineCapHours = 99;
  assert.equal(getGameplayConfig().idle.offlineCapHours, 8);
  setGameplayConfig(prev);
});

test('getGameplayConfig result cannot corrupt defaults', () => {
  const cp = getGameplayConfig();
  assert.notEqual(cp, DEFAULT_GAMEPLAY);
  cp.attributes.points = 999;
  cp.permanentSkills[0].name = '已被改写';
  cp.slots[0].count = 99;

  assert.equal(DEFAULT_GAMEPLAY.attributes.points, 60);
  assert.equal(DEFAULT_GAMEPLAY.permanentSkills[0].name, '蚀刃');
  assert.equal(DEFAULT_GAMEPLAY.slots[0].count, 1);

  const fallback = normalizeGameplay({});
  assert.equal(fallback.attributes.points, 60);
  assert.equal(fallback.permanentSkills[0].name, '蚀刃');
  assert.equal(getGameplayConfig().attributes.points, 60);
});
