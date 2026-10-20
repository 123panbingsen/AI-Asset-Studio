import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGameplayConfig, GameplayConfig, setGameplayConfig } from '../assets/scripts/framework/Config';
import type { AttrKey } from '../assets/scripts/framework/attributes/Attributes';
import {
  burstPower,
  defaultAttributes,
  respecCost,
  validateAttributes,
} from '../assets/scripts/framework/attributes/Attributes';

const KEYS: AttrKey[] = ['str', 'int', 'spd', 'vit', 'hp', 'res'];

function attrs(overrides: Partial<Record<AttrKey, number>> = {}): Record<AttrKey, number> {
  return { ...defaultAttributes(), ...overrides };
}

function sum(a: Record<AttrKey, number>): number {
  return KEYS.reduce((n, k) => n + a[k], 0);
}

/** 临时替换全局玩法配置，测试结束后无条件还原。 */
function withGameplay<T>(mutate: (c: GameplayConfig) => void, fn: () => T): T {
  const prev = getGameplayConfig();
  try {
    const next = getGameplayConfig();
    mutate(next);
    setGameplayConfig(next);
    return fn();
  } finally {
    setGameplayConfig(prev);
  }
}

test('default attributes are six zeros', () => {
  const a = defaultAttributes();
  assert.deepEqual(a, { str: 0, int: 0, spd: 0, vit: 0, hp: 0, res: 0 });
  assert.deepEqual(Object.keys(a).sort(), [...KEYS].sort());
  for (const k of KEYS) assert.equal(a[k], 0);

  // 每次调用返回独立对象，修改不影响下一次结果。
  a.str = 9;
  assert.equal(defaultAttributes().str, 0);
});

test('attributes summing to the configured points pass validation', () => {
  const a = attrs({ str: 24, spd: 24, int: 12 });
  assert.equal(sum(a), 60);
  const r = validateAttributes(a);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test('attributes summing to 59 fail validation', () => {
  const a = attrs({ str: 24, spd: 24, int: 11 });
  assert.equal(sum(a), 59);
  const r = validateAttributes(a);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('总和')), `errors: ${r.errors.join(' | ')}`);
  assert.ok(r.errors.some((e) => e.includes('60')), `errors: ${r.errors.join(' | ')}`);
});

test('attributes summing to 61 fail validation', () => {
  const a = attrs({ str: 24, spd: 24, int: 13 });
  assert.equal(sum(a), 61);
  const r = validateAttributes(a);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('总和')), `errors: ${r.errors.join(' | ')}`);
});

test('single attribute above the cap fails even when the sum is correct', () => {
  const a = attrs({ str: 25, spd: 24, int: 11 });
  assert.equal(sum(a), 60);
  const r = validateAttributes(a);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('str') && e.includes('上限')), `errors: ${r.errors.join(' | ')}`);
});

test('negative attribute values fail validation', () => {
  const a = attrs({ str: -1, spd: 24, int: 24, vit: 13 });
  assert.equal(sum(a), 60);
  const r = validateAttributes(a);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('str') && e.includes('负')), `errors: ${r.errors.join(' | ')}`);
});

test('NaN attribute values fail validation', () => {
  const a = attrs({ str: NaN, spd: 24, int: 24, vit: 12 });
  const r = validateAttributes(a);
  assert.equal(r.ok, false);
  assert.ok(
    r.errors.some((e) => e.includes('str') && (e.includes('NaN') || e.includes('有效数字'))),
    `errors: ${r.errors.join(' | ')}`,
  );
});

test('missing attribute keys fail validation', () => {
  const a = attrs({ str: 24, spd: 24, int: 12 }) as Record<string, number>;
  delete a.res;
  const r = validateAttributes(a as Record<AttrKey, number>);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('res') && (e.includes('缺') || e.includes('数字'))), `errors: ${r.errors.join(' | ')}`);
});

test('fractional attribute values fail validation', () => {
  const a = attrs({ str: 1.5, spd: 24, int: 24, vit: 10.5 });
  assert.equal(sum(a), 60);
  const r = validateAttributes(a);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('str') && e.includes('整数')), `errors: ${r.errors.join(' | ')}`);
});

test('burst power follows the configured weights and rounds to 2 decimals', () => {
  const w = getGameplayConfig().attributes.burst;
  const a = attrs({ str: 24, spd: 24, int: 12 });
  const expected = Math.round((24 * w.str + 24 * w.spd + 12 * w.int) * 100) / 100;

  assert.equal(burstPower(a), expected);
  assert.equal(burstPower(a), 21.6);
});

test('burst power reads weights from gameplay config', () => {
  withGameplay(
    (c) => {
      c.attributes.burst = { str: 0.333, spd: 0.333, int: 0.334 };
    },
    () => {
      const w = getGameplayConfig().attributes.burst;
      const a = attrs({ str: 24, spd: 24, int: 12 });
      const raw = 24 * w.str + 24 * w.spd + 12 * w.int;
      assert.equal(burstPower(a), Math.round(raw * 100) / 100);
      assert.equal(burstPower(a), 19.99);
    },
  );
});

test('respec is free at and below the configured free level', () => {
  const { freeUntil, perPoint } = getGameplayConfig().attributes.respec;
  assert.equal(freeUntil, 10);
  assert.equal(perPoint, 10);

  assert.equal(respecCost(1), 0);
  assert.equal(respecCost(9), 0);
  assert.equal(respecCost(10), 0);
});

test('respec cost is (level - freeUntil) * perPoint above the free level', () => {
  const { freeUntil, perPoint } = getGameplayConfig().attributes.respec;
  for (const level of [11, 12, 20]) {
    assert.equal(respecCost(level), (level - freeUntil) * perPoint);
  }
  assert.equal(respecCost(11), 10);
  assert.equal(respecCost(20), 100);
});

test('respec cost reads freeUntil and perPoint from gameplay config', () => {
  withGameplay(
    (c) => {
      c.attributes.respec = { freeUntil: 5, perPoint: 20 };
    },
    () => {
      assert.equal(respecCost(4), 0);
      assert.equal(respecCost(5), 0);
      assert.equal(respecCost(6), 20);
      assert.equal(respecCost(10), 100);
    },
  );
});

test('validation reads points and cap from gameplay config', () => {
  withGameplay(
    (c) => {
      c.attributes.points = 70;
      c.attributes.cap = 30;
    },
    () => {
      const ok = attrs({ str: 25, spd: 25, int: 20 });
      assert.equal(sum(ok), 70);
      assert.equal(validateAttributes(ok).ok, true);

      // 旧的 60 点方案在 70 点配置下不再通过。
      const old = attrs({ str: 24, spd: 24, int: 12 });
      assert.equal(validateAttributes(old).ok, false);

      // 单项 25 在 cap=30 下合法，但总和仍需 70。
      const cap30 = attrs({ str: 30, spd: 20, int: 20 });
      assert.equal(validateAttributes(cap30).ok, true);

      // 单项 31 超过 cap=30。
      const over = attrs({ str: 31, spd: 19, int: 20 });
      assert.equal(sum(over), 70);
      assert.equal(validateAttributes(over).ok, false);
    },
  );
});

test('config overrides are restored after each test', () => {
  // 前序 config 用例若泄漏，这里会读到非默认值。
  const c = getGameplayConfig();
  assert.equal(c.attributes.points, 60);
  assert.equal(c.attributes.cap, 24);
  assert.deepEqual(c.attributes.burst, { str: 0.4, spd: 0.4, int: 0.2 });
  assert.deepEqual(c.attributes.respec, { freeUntil: 10, perPoint: 10 });
});
