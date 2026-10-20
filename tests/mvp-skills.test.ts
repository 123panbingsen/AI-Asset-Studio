import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGameplayConfig, GameplayConfig, setGameplayConfig } from '../assets/scripts/framework/Config';
import type { SkillQuality } from '../assets/scripts/framework/skills/SkillDefs';
import {
  isUnlocked,
  permanentSkills,
  skillPool,
  slotCount,
} from '../assets/scripts/framework/skills/SkillDefs';

const QUALITIES: SkillQuality[] = ['common', 'rare', 'epic', 'legend'];

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

/** 按配置表独立计算期望槽位数（不复用被测实现）。 */
function expectedSlotCount(level: number): number {
  const cfg = getGameplayConfig();
  let bestLevel = -Infinity;
  let count = 1; // 低于首档时至少 1 个槽位
  for (const tier of cfg.slots) {
    if (tier.level <= level && tier.level > bestLevel) {
      bestLevel = tier.level;
      count = tier.count;
    }
  }
  return count;
}

test('permanent skills come from config with the three expected ids', () => {
  const list = permanentSkills();
  assert.equal(list.length, 3);
  assert.deepEqual(
    list.map((s) => s.id),
    ['eclipsed_blade', 'night_heart', 'light_engine'],
  );
  assert.deepEqual(
    list.map((s) => s.tag),
    ['dps', 'tank', 'idle'],
  );
  for (const s of list) {
    assert.equal(typeof s.name, 'string');
    assert.ok(s.name.length > 0);
    assert.equal(typeof s.desc, 'string');
    assert.ok(s.desc.length > 0);
  }
});

test('permanent skills return copies and do not expose config state', () => {
  const first = permanentSkills();
  first[0].name = '已被改写';
  first.pop();

  const second = permanentSkills();
  assert.equal(second.length, 3);
  assert.notEqual(second[0].name, '已被改写');
  assert.notEqual(getGameplayConfig().permanentSkills[0].name, '已被改写');
});

test('permanent skills read config overrides', () => {
  withGameplay(
    (c) => {
      c.permanentSkills = [{ id: 'only_one', name: '唯一', desc: '唯一技能', tag: 'tank' }];
    },
    () => {
      const list = permanentSkills();
      assert.equal(list.length, 1);
      assert.deepEqual(list[0], { id: 'only_one', name: '唯一', desc: '唯一技能', tag: 'tank' });
    },
  );
});

test('skill pool has at least eight defs aligned with config', () => {
  const pool = skillPool();
  const cfgPool = getGameplayConfig().skillPool;
  assert.ok(pool.length >= 8);
  assert.deepEqual(
    pool.map((s) => s.defId),
    cfgPool.map((s) => s.defId),
  );
  for (const s of pool) {
    assert.equal(typeof s.defId, 'string');
    assert.ok(s.defId.length > 0);
    assert.ok(QUALITIES.includes(s.quality), `非法品质：${s.quality}`);
    assert.ok(s.name.length > 0);
  }
});

test('skill pool returns copies and does not expose config state', () => {
  const first = skillPool();
  first[0].name = '已被改写';
  first.length = 0;
  const second = skillPool();
  assert.ok(second.length >= 8);
  assert.notEqual(second[0].name, '已被改写');
  assert.notEqual(getGameplayConfig().skillPool[0].name, '已被改写');
});

test('skill pool narrows quality and reads config overrides', () => {
  withGameplay(
    (c) => {
      c.skillPool = [
        { defId: 'a', name: 'A', quality: 'legend' },
        { defId: 'b', name: 'B', quality: 'not-a-quality' },
      ];
    },
    () => {
      const pool = skillPool();
      assert.deepEqual(
        pool.map((s) => s.defId),
        ['a', 'b'],
      );
      assert.equal(pool[0].quality, 'legend');
      assert.equal(pool[1].quality, 'common');
    },
  );
});

test('slot count follows the configured tier ladder', () => {
  const levels = [1, 4, 5, 9, 10, 19, 20, 29, 30, 49, 50];
  const expected = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6];
  assert.deepEqual(levels.map((lv) => slotCount(lv)), expected);

  // 与配置表交叉验证（含首档之前与末档之后）。
  for (const lv of [...levels, 0, 2, 51, 100]) {
    assert.equal(slotCount(lv), expectedSlotCount(lv), `等级 ${lv} 的槽位数与配置不符`);
  }
});

test('slot count treats non-finite or negative levels as level 1', () => {
  for (const bad of [NaN, Infinity, -Infinity, -5, -0.5, undefined as any, '3' as any]) {
    assert.equal(slotCount(bad), 1, `非法等级 ${String(bad)} 应回退为 1 级`);
  }
  assert.equal(slotCount(0), 1);
  assert.equal(slotCount(0.5), 1);
});

test('isUnlocked respects every tier boundary', () => {
  for (const lv of [1, 4, 5, 9, 10, 19, 20, 29, 30, 49, 50]) {
    const n = slotCount(lv);
    for (let i = 0; i < n; i++) assert.equal(isUnlocked(lv, i), true, `等级 ${lv} 槽位 ${i} 应解锁`);
    assert.equal(isUnlocked(lv, n), false, `等级 ${lv} 槽位 ${n} 应锁定`);
    assert.equal(isUnlocked(lv, n + 5), false);
  }

  // 非法槽位索引一律视为未解锁（不存在的槽位）。
  assert.equal(isUnlocked(50, -1), false);
  assert.equal(isUnlocked(50, 1.5), false);
  assert.equal(isUnlocked(50, NaN), false);

  // 非法等级按 1 级处理：仅 0 号槽位解锁。
  assert.equal(isUnlocked(NaN, 0), true);
  assert.equal(isUnlocked(NaN, 1), false);
  assert.equal(isUnlocked(-5, 0), true);
  assert.equal(isUnlocked(-5, 1), false);
});

test('slot count reads overridden config tiers and restores afterwards', () => {
  const prev = getGameplayConfig();
  try {
    const next = getGameplayConfig();
    next.slots = [
      { level: 1, count: 1 },
      { level: 2, count: 2 },
      { level: 5, count: 4 },
      { level: 10, count: 6 },
    ];
    setGameplayConfig(next);

    assert.equal(slotCount(1), 1);
    assert.equal(slotCount(2), 2);
    assert.equal(slotCount(4), 2);
    assert.equal(slotCount(5), 4);
    assert.equal(slotCount(9), 4);
    assert.equal(slotCount(10), 6);
    // 归一化会保留未覆盖的默认档位。
    assert.equal(slotCount(20), 4);
    assert.equal(slotCount(50), 6);
    assert.equal(isUnlocked(5, 3), true);
    assert.equal(isUnlocked(5, 4), false);
  } finally {
    setGameplayConfig(prev);
  }

  // 还原后回到默认档位，确认测试之间没有配置泄漏。
  assert.equal(slotCount(5), 2);
  assert.equal(slotCount(50), 6);
});
