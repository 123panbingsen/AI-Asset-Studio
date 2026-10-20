/**
 * Trial —— 试炼结算：新手保护、连败保底、胜利三选一与失败蚀化。
 *
 * 所有数值都从 `getGameplayConfig().trial` / `skillPool` / `slots` 读取；
 * 随机性只通过注入的 `rng`，本模块不读写存储，只修改调用方传入的存档对象。
 */
import { getGameplayConfig } from '../Config';
import type { SkillPoolEntryCfg } from '../Config';
import type { OwnedSkill, SaveData, SkillQuality } from '../Save';

/** 试炼胜利后供玩家选择的技能（品质已收窄为合法枚举）。 */
export interface SkillOffer {
  defId: string;
  quality: SkillQuality;
}

/** 一次试炼的结算结果；resolveTrial 只计算，不推进存档计数。 */
export interface TrialOutcome {
  win: boolean;
  offers: SkillOffer[];
  corrodedSkillId: string | null;
  pityConsumed: boolean;
}

/** 胜利后的选择：按 skillDefId 替换并拾取，或放弃。 */
export type TrialChoice = { type: 'replace'; skillDefId: string } | { type: 'abandon' };

const QUALITY_RANK: Record<SkillQuality, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legend: 3,
};

/** 把配置字符串收窄为品质枚举；非法值回退 common（配置层已归一化，这里仅防御）。 */
function toQuality(v: string): SkillQuality {
  return v === 'rare' || v === 'epic' || v === 'legend' ? v : 'common';
}

/** 从 [0, n) 取一个确定性的下标；rng 返回 1/负数/NaN 时也不越界。 */
function pickIndex(n: number, rng: () => number): number {
  if (n <= 1) return 0;
  const r = Number(rng());
  if (!Number.isFinite(r)) return 0;
  const idx = Math.floor(r * n);
  return Math.min(n - 1, Math.max(0, idx));
}

/**
 * 抽出至多 3 个 defId 互不相同的 offer；若指定 minQuality，则保证其中至少一个达标。
 *
 * 先按 rng 不放回抽样，再在未命中的情况下补入一个达标项替换末位：
 * 这样既保持 3 个 offer 的稳定数量，也不会与既有 offer 重复。
 */
function rollOffers(rng: () => number, minQuality: SkillQuality | null): SkillOffer[] {
  const pool = getGameplayConfig().skillPool;
  const picked: SkillPoolEntryCfg[] = [];
  const used = new Set<string>();
  const want = Math.min(3, pool.length);

  while (picked.length < want) {
    const available = pool.filter((entry) => !used.has(entry.defId));
    if (available.length === 0) break;
    const entry = available[pickIndex(available.length, rng)];
    used.add(entry.defId);
    picked.push(entry);
  }

  const qualified =
    minQuality === null ||
    picked.some((entry) => QUALITY_RANK[toQuality(entry.quality)] >= QUALITY_RANK[minQuality]);
  if (!qualified) {
    const eligible = pool.filter(
      (entry) => !used.has(entry.defId) && QUALITY_RANK[toQuality(entry.quality)] >= QUALITY_RANK[minQuality],
    );
    if (eligible.length > 0) {
      const upgrade = eligible[pickIndex(eligible.length, rng)];
      used.add(upgrade.defId);
      if (picked.length > 0) picked[picked.length - 1] = upgrade;
      else picked.push(upgrade);
    }
  }

  return picked.map((entry) => ({ defId: entry.defId, quality: toQuality(entry.quality) }));
}

/** 按 defId 从 skillPool 推导品质：忽略首尾空白，未知 defId 回退 common。 */
function qualityFor(defId: string): SkillQuality {
  const id = defId.trim();
  const entry = getGameplayConfig().skillPool.find((e) => e.defId.trim() === id);
  return entry ? toQuality(entry.quality) : 'common';
}

/**
 * 当前技能容量：取配置 slots 表最低档（基础档）的 count，至少 1。
 *
 * 存档没有玩家总等级字段，试炼结算按基础容量判断是否已满；
 * Task 3 的 `slotCount(level)` 面向界面按等级展示，两者共用同一张配置表。
 */
function slotCapacity(): number {
  const slots = getGameplayConfig().slots;
  let base = Infinity;
  let count = 1;
  for (const tier of slots) {
    if (tier.level < base) {
      base = tier.level;
      count = tier.count;
    }
  }
  return Math.max(1, Math.floor(count));
}

/** 第一个未被保护（id 不在 protectedSkills 中）的技能下标；全部受保护时返回 0。 */
function replaceIndex(save: SaveData): number {
  const idx = save.skills.findIndex((skill) => save.protectedSkills.indexOf(skill.id) < 0);
  return idx >= 0 ? idx : 0;
}

/**
 * 结算一次试炼：只读存档，不推进 attempts/fails，也不消费 pity。
 *
 * 1. `pity > 0`（已赚到的保底）或连败达到 `pityFails` 时必赢，至少提供一个 epic 及以上品质，并置 pityConsumed；
 * 2. 前 `firstN` 次尝试必赢，且至少提供一个 rare 及以上品质；
 * 3. 其余情况以 50% 概率决胜负；任何情况都返回 3 个 defId 互不相同的 offer。
 */
export function resolveTrial(save: SaveData, rng: () => number): TrialOutcome {
  const { firstN, pityFails } = getGameplayConfig().trial;
  const { attempts, fails, pity } = save.trialStats;

  // pity 是已赚到的保证，优先于新手保护兑现
  if (pity > 0 || fails >= pityFails) {
    return { win: true, offers: rollOffers(rng, 'epic'), corrodedSkillId: null, pityConsumed: true };
  }
  if (attempts < firstN) {
    return { win: true, offers: rollOffers(rng, 'rare'), corrodedSkillId: null, pityConsumed: false };
  }

  const win = Number(rng()) < 0.5;
  return { win, offers: rollOffers(rng, null), corrodedSkillId: null, pityConsumed: false };
}

/**
 * 应用胜利结果：推进 attempts，胜利后连败/保底计数清零。
 *
 * replace 时按 `skillDefId` 从配置 skillPool 推导品质并创建 1 级未蚀化技能；
 * 槽位未满则追加，已满则替换第一个未受保护的技能，全部受保护时替换第一个
 * ——任何情况下都不会无替换地丢弃技能。
 */
export function applyTrialWin(save: SaveData, choice: TrialChoice, rng: () => number): void {
  save.trialStats.attempts += 1;
  save.trialStats.fails = 0;
  save.trialStats.pity = 0;

  if (choice.type === 'abandon') return;

  const skill: OwnedSkill = {
    id: 'sk_' + Date.now() + '_' + Math.floor(rng() * 1e6),
    defId: choice.skillDefId.trim(),
    quality: qualityFor(choice.skillDefId),
    level: 1,
    corroded: false,
  };

  if (save.skills.length < slotCapacity()) {
    save.skills.push(skill);
    return;
  }
  save.skills[replaceIndex(save)] = skill;
}

/**
 * 应用失败结果：attempts/fails 各 +1，fails 达到 `pityFails` 时 pity 置 1。
 *
 * 蚀化目标为第一个既未蚀化、又不在 protectedSkills 中的技能；
 * 没有可蚀化目标时返回 null（全部受保护或没有技能）。
 */
export function applyTrialFail(save: SaveData): { corrodedSkillId: string | null } {
  const { pityFails } = getGameplayConfig().trial;
  save.trialStats.attempts += 1;
  save.trialStats.fails += 1;
  save.trialStats.pity = save.trialStats.fails >= pityFails ? 1 : 0;

  const target = save.skills.find(
    (skill) => !skill.corroded && save.protectedSkills.indexOf(skill.id) < 0,
  );
  if (!target) return { corrodedSkillId: null };

  target.corroded = true;
  return { corrodedSkillId: target.id };
}
