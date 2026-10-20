import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGameplayConfig, GameplayConfig, setGameplayConfig } from '../assets/scripts/framework/Config';
import { normalizeSave, SAVE_KEY, createSave } from '../assets/scripts/framework/Save';
import type { OwnedSkill, SaveData, StorageLike } from '../assets/scripts/framework/Save';
import { defaultAttributes } from '../assets/scripts/framework/attributes/Attributes';
import type { AttrKey } from '../assets/scripts/framework/attributes/Attributes';
import {
  canProtect,
  purify,
  purifyCost,
  respec,
  toggleProtect,
} from '../assets/scripts/framework/skills/SkillState';

// ---------------------------------------------------------------------------
// 测试夹具
// ---------------------------------------------------------------------------

function skill(id: string, corroded = false): OwnedSkill {
  return { id, defId: `def_${id}`, quality: 'common', level: 1, corroded };
}

/** 以 normalizeSave 的默认档为底，保证新增字段（如 shards）始终存在。 */
function makeSave(over: Partial<SaveData> = {}): SaveData {
  return Object.assign(normalizeSave({ v: 1 }), over);
}

function attrs(over: Partial<Record<AttrKey, number>> = {}): Record<AttrKey, number> {
  return { ...defaultAttributes(), ...over };
}

/** 合法分配：24 + 24 + 12 = 60（默认配置点数）。 */
const VALID_ATTRS = attrs({ str: 24, spd: 24, int: 12 });
/** 非法分配：24 + 24 + 11 = 59，总和不足。 */
const INVALID_ATTRS = attrs({ str: 24, spd: 24, int: 11 });

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

function memStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    read(k: string) { return k in data ? data[k] : null; },
    write(k: string, v: string) { data[k] = v; },
  };
}

// ---------------------------------------------------------------------------
// 保护：上限 / 反选 / 幽灵 id 清理
// ---------------------------------------------------------------------------

test('canProtect requires an existing, unprotected skill below the configured limit', () => {
  const limit = getGameplayConfig().trial.protectMax;
  assert.equal(limit, 2);

  const save = makeSave({ skills: [skill('s1'), skill('s2'), skill('s3')] });
  assert.equal(canProtect(save, 's1'), true);
  assert.equal(canProtect(save, 'nope'), false);

  save.protectedSkills = ['s1'];
  assert.equal(canProtect(save, 's1'), false);
  assert.equal(canProtect(save, 's2'), true);

  save.protectedSkills = ['s1', 's2'];
  assert.equal(canProtect(save, 's3'), false);
  // 已达上限时，已保护的技能依然返回 false（不是“可保护”）。
  assert.equal(canProtect(save, 's1'), false);
});

test('toggleProtect adds up to the limit and reports full beyond it', () => {
  const save = makeSave({ skills: [skill('s1'), skill('s2'), skill('s3')] });

  assert.deepEqual(toggleProtect(save, 's1'), { ok: true });
  assert.deepEqual(toggleProtect(save, 's2'), { ok: true });
  assert.deepEqual(save.protectedSkills, ['s1', 's2']);

  assert.deepEqual(toggleProtect(save, 's3'), { ok: false, reason: 'full' });
  assert.deepEqual(save.protectedSkills, ['s1', 's2']);
});

test('toggleProtect removes an already protected skill', () => {
  const save = makeSave({ skills: [skill('s1'), skill('s2')], protectedSkills: ['s1'] });

  assert.deepEqual(toggleProtect(save, 's1'), { ok: true });
  assert.deepEqual(save.protectedSkills, []);
  assert.equal(canProtect(save, 's1'), true);

  // 反选后重新保护，顺序为追加。
  assert.deepEqual(toggleProtect(save, 's2'), { ok: true });
  assert.deepEqual(save.protectedSkills, ['s2']);
});

test('toggleProtect reports missing skill without adding it', () => {
  const save = makeSave({ skills: [skill('s1')] });
  assert.deepEqual(toggleProtect(save, 'ghost'), { ok: false, reason: 'missing' });
  assert.deepEqual(save.protectedSkills, []);
});

test('toggleProtect prunes ghost ids before applying the limit', () => {
  const save = makeSave({
    skills: [skill('s1'), skill('s2')],
    protectedSkills: ['ghost', 's1'],
  });

  // 若不清洗，长度 2 已达上限会误判 full。
  assert.deepEqual(toggleProtect(save, 's2'), { ok: true });
  assert.deepEqual(save.protectedSkills, ['s1', 's2']);

  // 已保护技能同样会触发清洗：只剩幽灵 id 时移除它并保留空数组。
  const onlyGhost = makeSave({ skills: [skill('s1')], protectedSkills: ['ghost'] });
  assert.deepEqual(toggleProtect(onlyGhost, 's1'), { ok: true });
  assert.deepEqual(onlyGhost.protectedSkills, ['s1']);
});

test('ghost ids are pruned even when the requested skill is missing', () => {
  const save = makeSave({ skills: [skill('s1')], protectedSkills: ['ghost', 's1'] });
  assert.deepEqual(toggleProtect(save, 'nope'), { ok: false, reason: 'missing' });
  assert.deepEqual(save.protectedSkills, ['s1']);
});

test('protect limit follows the gameplay config', () => {
  withGameplay(
    (c) => {
      c.trial.protectMax = 1;
    },
    () => {
      const save = makeSave({ skills: [skill('s1'), skill('s2')] });
      assert.deepEqual(toggleProtect(save, 's1'), { ok: true });
      assert.deepEqual(toggleProtect(save, 's2'), { ok: false, reason: 'full' });
      assert.deepEqual(save.protectedSkills, ['s1']);
    },
  );
});

// ---------------------------------------------------------------------------
// 净化：费用 / 扣碎片 / 拒绝路径不改状态
// ---------------------------------------------------------------------------

test('purifyCost charges the configured shards only for a corroded skill', () => {
  const cost = getGameplayConfig().trial.purifyShards;
  assert.equal(cost, 20);

  const save = makeSave({ skills: [skill('s1', true), skill('s2', false)] });
  assert.deepEqual(purifyCost(save, 's1'), { shards: 20, ok: true });
  assert.deepEqual(purifyCost(save, 's2'), { shards: 0, ok: false, reason: 'not-corroded' });
  assert.deepEqual(purifyCost(save, 'nope'), { shards: 0, ok: false, reason: 'missing' });
});

test('purifyCost follows the gameplay config', () => {
  withGameplay(
    (c) => {
      c.trial.purifyShards = 7;
    },
    () => {
      const save = makeSave({ skills: [skill('s1', true)] });
      assert.deepEqual(purifyCost(save, 's1'), { shards: 7, ok: true });
    },
  );
});

test('purify deducts shards and clears corrosion', () => {
  const save = makeSave({ shards: 25, skills: [skill('s1', true)] });

  assert.deepEqual(purify(save, 's1'), { ok: true });
  assert.equal(save.shards, 5);
  assert.equal(save.skills[0].corroded, false);

  // 已净化：不再扣费。
  assert.deepEqual(purify(save, 's1'), { ok: false, reason: 'not-corroded' });
  assert.equal(save.shards, 5);
});

test('purify with insufficient shards rejects without mutating the save', () => {
  const save = makeSave({ shards: 19, skills: [skill('s1', true)] });

  assert.deepEqual(purify(save, 's1'), { ok: false, reason: 'insufficient' });
  assert.equal(save.shards, 19);
  assert.equal(save.skills[0].corroded, true);
});

test('purify rejects a missing skill without mutating the save', () => {
  const save = makeSave({ shards: 100, skills: [skill('s1', true)] });

  assert.deepEqual(purify(save, 'nope'), { ok: false, reason: 'missing' });
  assert.equal(save.shards, 100);
  assert.equal(save.skills[0].corroded, true);
});

// ---------------------------------------------------------------------------
// 洗点：免费 / 扣金币 / 金币不足 / 分配非法
// ---------------------------------------------------------------------------

test('respec is free at and below freeUntil and still rewrites attributes', () => {
  const { freeUntil } = getGameplayConfig().attributes.respec;
  assert.equal(freeUntil, 10);

  for (const level of [1, 5, 10]) {
    const previous = attrs({ str: 20, spd: 20, int: 20 });
    const save = makeSave({ coins: 123, attributes: previous });
    const r = respec(save, VALID_ATTRS, level);

    assert.equal(r.ok, true);
    assert.equal(r.cost, 0);
    assert.deepEqual(save.attributes, VALID_ATTRS);
    assert.equal(save.coins, 123);
    assert.notEqual(save.attributes, VALID_ATTRS, 'must assign a copy, not the caller object');
  }
});

test('respec above freeUntil deducts the configured cost in coins', () => {
  const { freeUntil, perPoint } = getGameplayConfig().attributes.respec;

  const save = makeSave({ coins: 100, attributes: attrs() });
  assert.deepEqual(respec(save, VALID_ATTRS, 11), { ok: true, cost: (11 - freeUntil) * perPoint });
  assert.equal(save.coins, 90);
  assert.deepEqual(save.attributes, VALID_ATTRS);

  const exact = makeSave({ coins: 100 });
  assert.deepEqual(respec(exact, VALID_ATTRS, 20), { ok: true, cost: 100 });
  assert.equal(exact.coins, 0);
});

test('respec cost follows the gameplay config', () => {
  withGameplay(
    (c) => {
      c.attributes.respec = { freeUntil: 5, perPoint: 20 };
    },
    () => {
      const save = makeSave({ coins: 100 });
      assert.deepEqual(respec(save, VALID_ATTRS, 5), { ok: true, cost: 0 });
      assert.equal(save.coins, 100);
      assert.deepEqual(respec(save, VALID_ATTRS, 6), { ok: true, cost: 20 });
      assert.equal(save.coins, 80);
    },
  );
});

test('respec with insufficient coins rejects without mutating the save', () => {
  const previous = attrs({ str: 10, spd: 25, int: 25 });
  const save = makeSave({ coins: 9, attributes: previous });

  assert.deepEqual(respec(save, VALID_ATTRS, 11), { ok: false, cost: 10, reason: 'insufficient' });
  assert.equal(save.coins, 9);
  assert.deepEqual(save.attributes, previous);
});

test('respec with an invalid distribution rejects without charging coins', () => {
  const previous = attrs({ str: 10, spd: 25, int: 25 });
  const save = makeSave({ coins: 100, attributes: previous });

  const r = respec(save, INVALID_ATTRS, 11);
  assert.equal(r.ok, false);
  assert.equal(r.cost, 10);
  assert.equal(r.reason, 'invalid');
  assert.equal(save.coins, 100);
  assert.deepEqual(save.attributes, previous);
});

test('free respec also rejects an invalid distribution', () => {
  const save = makeSave({ coins: 50, attributes: attrs({ str: 1 }) });
  const r = respec(save, INVALID_ATTRS, 5);
  assert.deepEqual(r, { ok: false, cost: 0, reason: 'invalid' });
  assert.equal(save.coins, 50);
  assert.deepEqual(save.attributes, attrs({ str: 1 }));
});

// ---------------------------------------------------------------------------
// 存档迁移：shards 默认 0 / 清洗
// ---------------------------------------------------------------------------

test('legacy save without shards normalizes to 0', () => {
  const legacy = normalizeSave({ v: 1, coins: 5, gems: 6, tickets: 7 });
  assert.equal(legacy.shards, 0);

  const empty = createSave(memStorage()).get();
  assert.equal(empty.shards, 0);
});

test('shards are sanitized to a non-negative integer', () => {
  assert.equal(normalizeSave({ v: 1, shards: 42 }).shards, 42);
  assert.equal(normalizeSave({ v: 1, shards: -3 }).shards, 0);
  assert.equal(normalizeSave({ v: 1, shards: 4.9 }).shards, 4);
  assert.equal(normalizeSave({ v: 1, shards: 'x' }).shards, 0);
  assert.equal(normalizeSave({ v: 1, shards: NaN }).shards, 0);
  assert.equal(normalizeSave({ v: 0, coin: 1 }).shards, 0);
});

test('shards round-trip through storage and default is isolated between stores', () => {
  const st = memStorage();
  const a = createSave(st, () => 1000);
  a.update((d) => { d.shards = 33; });
  assert.equal(createSave(st).get().shards, 33);

  const raw = JSON.parse(st.data[SAVE_KEY]);
  assert.equal(raw.shards, 33);

  // 未写过 shards 的独立存档不应被其他 store 改动。
  assert.equal(createSave(memStorage()).get().shards, 0);
});
