import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSave, OwnedSkill, SaveData } from '../assets/scripts/framework/Save';
import { getGameplayConfig, setGameplayConfig } from '../assets/scripts/framework/Config';
import {
  applyTrialFail,
  applyTrialWin,
  resolveTrial,
  TrialOutcome,
} from '../assets/scripts/framework/trial/Trial';

/** 构造存档：默认值 + 试炼相关字段覆盖。 */
function makeSave(
  p: { attempts?: number; fails?: number; pity?: number; skills?: OwnedSkill[]; protectedSkills?: string[] } = {},
): SaveData {
  const save = normalizeSave({});
  save.trialStats = { attempts: p.attempts ?? 0, fails: p.fails ?? 0, pity: p.pity ?? 0 };
  if (p.skills) save.skills = p.skills;
  if (p.protectedSkills) save.protectedSkills = p.protectedSkills;
  return save;
}

function owned(id: string, defId = 'liuxing', corroded = false): OwnedSkill {
  return { id, defId, quality: 'common', level: 1, corroded };
}

/** 临时改写玩法配置，结束后恢复（防止用例间泄漏）。 */
function withGameplay(patch: {
  trial?: Partial<ReturnType<typeof getGameplayConfig>['trial']>;
  skillPool?: { defId: string; name: string; quality: string }[];
  slots?: { level: number; count: number }[];
}, fn: () => void): void {
  const prev = getGameplayConfig();
  const next = getGameplayConfig();
  if (patch.trial) next.trial = { ...next.trial, ...patch.trial };
  if (patch.skillPool) next.skillPool = patch.skillPool;
  if (patch.slots) next.slots = patch.slots;
  setGameplayConfig(next);
  try {
    fn();
  } finally {
    setGameplayConfig(prev);
  }
}

const COMMONS_AND_RARE = [
  { defId: 'c1', name: 'common 1', quality: 'common' },
  { defId: 'c2', name: 'common 2', quality: 'common' },
  { defId: 'c3', name: 'common 3', quality: 'common' },
  { defId: 'r1', name: 'rare 1', quality: 'rare' },
];

/** 三个不同品质的 defId，用于验证 applyTrialWin 从 skillPool 推导品质。 */
const THREE_TIER = [
  { defId: 'c1', name: 'rare 1', quality: 'rare' },
  { defId: 'c2', name: 'common 2', quality: 'common' },
  { defId: 'c3', name: 'epic 3', quality: 'epic' },
];

const COMMONS_AND_EPIC = [
  { defId: 'c1', name: 'common 1', quality: 'common' },
  { defId: 'c2', name: 'common 2', quality: 'common' },
  { defId: 'c3', name: 'common 3', quality: 'common' },
  { defId: 'e1', name: 'epic 1', quality: 'epic' },
];

function hasQuality(out: TrialOutcome, qualities: string[]): boolean {
  return out.offers.some((o) => qualities.indexOf(o.quality) >= 0);
}

function assertThreeDistinctOffers(out: TrialOutcome, pool: { defId: string }[]): void {
  assert.equal(out.offers.length, 3);
  assert.equal(new Set(out.offers.map((o) => o.defId)).size, 3);
  for (const offer of out.offers) {
    assert.ok(pool.some((p) => p.defId === offer.defId), 'offer must come from the configured pool');
  }
}

test('first three attempts always win and offer a rare-or-better skill', () => {
  withGameplay({ skillPool: COMMONS_AND_RARE, trial: { firstN: 3 } }, () => {
    for (const attempts of [0, 1, 2]) {
      for (const rngValue of [0, 0.99]) {
        const save = makeSave({ attempts });
        const out = resolveTrial(save, () => rngValue);
        assert.equal(out.win, true, `attempt ${attempts} must be protected`);
        assert.equal(out.pityConsumed, false);
        assert.equal(out.corrodedSkillId, null);
        assertThreeDistinctOffers(out, COMMONS_AND_RARE);
        assert.ok(hasQuality(out, ['rare', 'epic', 'legend']), 'newbie win must offer rare or better');
        // resolveTrial 只读：不推进存档计数。
        assert.equal(save.trialStats.attempts, attempts);
        assert.equal(save.trialStats.fails, 0);
      }
    }
  });
});

test('normal trials are decided by rng at the 50% threshold', () => {
  const save = makeSave({ attempts: 3 });
  assert.equal(resolveTrial(save, () => 0.49).win, true);
  assert.equal(resolveTrial(save, () => 0.5).win, false);
  const work = resolveTrial(save, () => 0.49);
  assert.equal(work.pityConsumed, false);
  assert.equal(work.corrodedSkillId, null);
  assertThreeDistinctOffers(work, getGameplayConfig().skillPool);
  const loss = resolveTrial(save, () => 0.9);
  assertThreeDistinctOffers(loss, getGameplayConfig().skillPool);
});

test('three consecutive fails grant a pity win with an epic-or-better offer', () => {
  withGameplay({ skillPool: COMMONS_AND_EPIC, trial: { firstN: 3, pityFails: 3 } }, () => {
    const save = makeSave({ attempts: 3 });
    applyTrialFail(save);
    applyTrialFail(save);
    applyTrialFail(save);
    assert.deepEqual(save.trialStats, { attempts: 6, fails: 3, pity: 1 });
    // rng 0.99 would lose a normal roll: the win must come from pity.
    const out = resolveTrial(save, () => 0.99);
    assert.equal(out.win, true);
    assert.equal(out.pityConsumed, true);
    assertThreeDistinctOffers(out, COMMONS_AND_EPIC);
    assert.ok(hasQuality(out, ['epic', 'legend']), 'pity win must offer epic or better');

    // rng 只抽到 3 个 common 时，保底必须强行补入一个 epic。
    const forced = resolveTrial(save, () => 0);
    assertThreeDistinctOffers(forced, COMMONS_AND_EPIC);
    assert.ok(hasQuality(forced, ['epic', 'legend']), 'pity must upgrade a common-only roll');
    assert.equal(forced.pityConsumed, true);
  });
});

test('pity threshold and firstN are config driven', () => {
  withGameplay({ skillPool: COMMONS_AND_EPIC, trial: { firstN: 1, pityFails: 2 } }, () => {
    const save = makeSave({ attempts: 1 });
    assert.equal(resolveTrial(save, () => 0.99).win, false, 'firstN=1 means attempt 1 is no longer protected');
    applyTrialFail(save);
    applyTrialFail(save);
    assert.deepEqual(save.trialStats, { attempts: 3, fails: 2, pity: 1 });
    const out = resolveTrial(save, () => 0.99);
    assert.equal(out.win, true);
    assert.equal(out.pityConsumed, true);
    assert.ok(hasQuality(out, ['epic', 'legend']));
  });
});

test('pity flag alone grants an epic-or-better guarantee before fails reaches the threshold', () => {
  withGameplay({ skillPool: COMMONS_AND_EPIC, trial: { firstN: 3, pityFails: 3 } }, () => {
    const save = makeSave({ attempts: 3, fails: 1, pity: 1 });
    // rng 0.99 普通判定必负；pity=1 是已赚到的保底，必须直接兑现。
    const out = resolveTrial(save, () => 0.99);
    assert.equal(out.win, true);
    assert.equal(out.pityConsumed, true);
    assert.equal(out.corrodedSkillId, null);
    assertThreeDistinctOffers(out, COMMONS_AND_EPIC);
    assert.ok(hasQuality(out, ['epic', 'legend']), 'pity flag must offer epic or better');
    // resolveTrial 只读：不消费 pity，也不推进 fails。
    assert.deepEqual(save.trialStats, { attempts: 3, fails: 1, pity: 1 });

    const noPity = makeSave({ attempts: 3, fails: 1, pity: 0 });
    assert.equal(resolveTrial(noPity, () => 0.99).win, false, 'no pity flag means a normal loss');
  });
});

test('fail increments attempts, fails and sets pity at the threshold', () => {
  const save = makeSave();
  assert.deepEqual(applyTrialFail(save), { corrodedSkillId: null });
  assert.deepEqual(save.trialStats, { attempts: 1, fails: 1, pity: 0 });
  applyTrialFail(save);
  assert.deepEqual(save.trialStats, { attempts: 2, fails: 2, pity: 0 });
  applyTrialFail(save);
  assert.deepEqual(save.trialStats, { attempts: 3, fails: 3, pity: 1 });
  applyTrialFail(save);
  assert.deepEqual(save.trialStats, { attempts: 4, fails: 4, pity: 1 });
});

test('protected skill is not corroded when another skill exists', () => {
  const save = makeSave({
    skills: [owned('s1'), owned('s2')],
    protectedSkills: ['s1'],
  });
  const res = applyTrialFail(save);
  assert.equal(res.corrodedSkillId, 's2');
  assert.equal(save.skills[0].corroded, false);
  assert.equal(save.skills[1].corroded, true);
});

test('already corroded skills are skipped and all-protected saves corrode nothing', () => {
  const first = makeSave({
    skills: [owned('s1', 'liuxing', true), owned('s2')],
    protectedSkills: [],
  });
  assert.equal(applyTrialFail(first).corrodedSkillId, 's2');
  assert.equal(first.skills[0].corroded, true);
  assert.equal(first.skills[1].corroded, true);

  const second = makeSave({
    skills: [owned('s1'), owned('s2')],
    protectedSkills: ['s1', 's2'],
  });
  assert.deepEqual(applyTrialFail(second), { corrodedSkillId: null });
  assert.equal(second.skills[0].corroded, false);
  assert.equal(second.skills[1].corroded, false);
});

test('replace when slots are full replaces instead of growing', () => {
  const save = makeSave({ fails: 2, pity: 1, skills: [owned('old')] });
  applyTrialWin(save, { type: 'replace', skillDefId: 'qinglong' }, () => 0.42);
  assert.equal(save.skills.length, 1);
  assert.equal(save.skills[0].defId, 'qinglong');
  assert.equal(save.skills[0].quality, 'epic');
  assert.equal(save.skills[0].level, 1);
  assert.equal(save.skills[0].corroded, false);
  assert.match(save.skills[0].id, /^sk_\d+_\d+$/);
  assert.notEqual(save.skills[0].id, 'old');
  assert.deepEqual(save.trialStats, { attempts: 1, fails: 0, pity: 0 });
});

test('win adds skills until the configured slot capacity is reached', () => {
  withGameplay({ slots: [{ level: 1, count: 2 }], skillPool: THREE_TIER }, () => {
    const save = makeSave();
    applyTrialWin(save, { type: 'replace', skillDefId: 'c1' }, () => 0.1);
    assert.equal(save.skills.length, 1);
    assert.equal(save.skills[0].quality, 'rare', 'quality must come from the configured skillPool');
    applyTrialWin(save, { type: 'replace', skillDefId: 'c2' }, () => 0.2);
    assert.equal(save.skills.length, 2);
    assert.deepEqual(save.skills.map((s) => s.defId), ['c1', 'c2']);

    applyTrialWin(save, { type: 'replace', skillDefId: 'c3' }, () => 0.3);
    assert.equal(save.skills.length, 2, 'at capacity the win must replace, never grow');
    assert.deepEqual(save.skills.map((s) => s.defId), ['c3', 'c2'], 'first unprotected skill is replaced');
    assert.equal(save.skills[0].quality, 'epic');
    assert.equal(save.trialStats.attempts, 3);
  });
});

test('replace derives quality from the pool, trims the defId and falls back to common', () => {
  withGameplay({ slots: [{ level: 1, count: 2 }] }, () => {
    const save = makeSave();
    applyTrialWin(save, { type: 'replace', skillDefId: '  zhanyue  ' }, () => 0.1);
    assert.equal(save.skills[0].defId, 'zhanyue', 'defId is stored trimmed');
    assert.equal(save.skills[0].quality, 'legend', 'quality is looked up in the default skillPool');

    applyTrialWin(save, { type: 'replace', skillDefId: 'unknown_def' }, () => 0.2);
    assert.equal(save.skills[1].defId, 'unknown_def');
    assert.equal(save.skills[1].quality, 'common', 'unknown defId falls back to common');
  });
});

test('replacement skips protected skills and still replaces when all are protected', () => {
  withGameplay({ slots: [{ level: 1, count: 2 }] }, () => {
    const guarded = makeSave({
      skills: [owned('s1'), owned('s2')],
      protectedSkills: ['s1'],
    });
    applyTrialWin(guarded, { type: 'replace', skillDefId: 'zhanyue' }, () => 0.5);
    assert.equal(guarded.skills.length, 2);
    assert.equal(guarded.skills[0].id, 's1');
    assert.equal(guarded.skills[1].defId, 'zhanyue');
    assert.equal(guarded.skills[1].quality, 'legend');

    const allGuarded = makeSave({
      skills: [owned('s1'), owned('s2')],
      protectedSkills: ['s1', 's2'],
    });
    applyTrialWin(allGuarded, { type: 'replace', skillDefId: 'zhanyue' }, () => 0.5);
    assert.equal(allGuarded.skills.length, 2, 'never drop without replacing');
    assert.equal(allGuarded.skills[0].defId, 'zhanyue');
    assert.equal(allGuarded.skills[1].id, 's2');
  });
});

test('abandon only records the attempt and resets fail counters', () => {
  const save = makeSave({ attempts: 2, fails: 2, pity: 1, skills: [owned('s1')] });
  applyTrialWin(save, { type: 'abandon' }, () => 0.7);
  assert.equal(save.skills.length, 1);
  assert.equal(save.skills[0].id, 's1');
  assert.deepEqual(save.trialStats, { attempts: 3, fails: 0, pity: 0 });
});

test('applied wins never keep stale fail/pity counters', () => {
  const save = makeSave({ attempts: 7, fails: 2, pity: 0 });
  applyTrialWin(save, { type: 'replace', skillDefId: 'pojun' }, () => 0.01);
  assert.deepEqual(save.trialStats, { attempts: 8, fails: 0, pity: 0 });
  assert.equal(save.skills.length, 1);
  assert.equal(save.skills[0].defId, 'pojun');
  assert.equal(save.skills[0].quality, 'rare');
});

test('resolved offers always match the configured pool quality metadata', () => {
  withGameplay({ skillPool: COMMONS_AND_RARE }, () => {
    const save = makeSave({ attempts: 10 });
    const out = resolveTrial(save, () => 0.2);
    const byDef = new Map(COMMONS_AND_RARE.map((p) => [p.defId, p.quality]));
    for (const offer of out.offers) {
      assert.equal(offer.quality, byDef.get(offer.defId));
    }
  });
});
