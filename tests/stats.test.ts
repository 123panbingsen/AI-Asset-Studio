import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heroBattleStats } from '../assets/scripts/framework/Stats';

test('level 1 keeps base stats', () => {
  const s = heroBattleStats(100, 10, 1);
  assert.equal(s.hp, 100);
  assert.equal(s.atk, 10);
});

test('level scales hp and atk', () => {
  const s = heroBattleStats(100, 10, 6);
  assert.equal(s.hp, 160);
  assert.equal(s.atk, 15);
});

test('invalid level falls back to 1', () => {
  const s = heroBattleStats(100, 10, 0);
  assert.equal(s.hp, 100);
  assert.equal(s.atk, 10);
});
