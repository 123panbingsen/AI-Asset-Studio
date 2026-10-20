/**
 * SkillState —— 技能管理：保护（上限内）、净化（消耗碎片）、洗点（金币 / 免费等级）。
 *
 * 所有平衡数值（保护上限、净化碎片、洗点费率与免费等级）都从
 * `getGameplayConfig()` 读取，本文件不硬编码任何数值；也不 import `cc`，
 * 以便在 node:test 中直接运行。
 */
import type { SaveData } from '../Save';
import { getGameplayConfig } from '../Config';
import { respecCost, validateAttributes } from '../attributes/Attributes';
import type { AttrKey } from '../attributes/Attributes';

/** 技能是否存在。 */
function findSkill(save: SaveData, skillId: string): SaveData['skills'][number] | undefined {
  return save.skills.find((s) => s.id === skillId);
}

/**
 * 清理幽灵保护 id：只保留仍存在于技能列表中的 id，并按首次出现去重。
 * `protectedSkills` 是独立数组，技能被删除/从未落库时可能残留旧 id；
 * 若不清洗，会虚占保护上限并让 UI 显示不存在的技能。
 */
function pruneProtected(save: SaveData): void {
  const owned = new Set(save.skills.map((s) => s.id));
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const id of save.protectedSkills) {
    if (!owned.has(id) || seen.has(id)) continue;
    seen.add(id);
    kept.push(id);
  }
  save.protectedSkills = kept;
}

/**
 * 是否还能保护该技能：技能存在、尚未保护、且当前保护数未达配置上限。
 * 纯查询，不修改存档（幽灵 id 的清理发生在 `toggleProtect`）。
 */
export function canProtect(save: SaveData, skillId: string): boolean {
  const cfg = getGameplayConfig();
  if (!findSkill(save, skillId)) return false;
  if (save.protectedSkills.indexOf(skillId) >= 0) return false;
  return save.protectedSkills.length < cfg.trial.protectMax;
}

/**
 * 切换保护状态：先清理幽灵 id，再按“已保护 → 取消；未保护且未满 → 加保护”处理。
 * 技能不存在返回 `{ ok: false, reason: 'missing' }`；达到上限返回 `{ ok: false, reason: 'full' }`。
 */
export function toggleProtect(save: SaveData, skillId: string): { ok: boolean; reason?: string } {
  pruneProtected(save);

  if (!findSkill(save, skillId)) return { ok: false, reason: 'missing' };

  const at = save.protectedSkills.indexOf(skillId);
  if (at >= 0) {
    save.protectedSkills.splice(at, 1);
    return { ok: true };
  }

  if (!canProtect(save, skillId)) return { ok: false, reason: 'full' };
  save.protectedSkills.push(skillId);
  return { ok: true };
}

/**
 * 查询净化费用：仅“技能存在且已腐蚀”时返回配置的碎片数并 `ok: true`；
 * 否则 `ok: false` 且 `shards: 0`，由调用方按 reason 提示。
 */
export function purifyCost(
  save: SaveData,
  skillId: string,
): { shards: number; ok: boolean; reason?: string } {
  const skill = findSkill(save, skillId);
  if (!skill) return { shards: 0, ok: false, reason: 'missing' };
  if (!skill.corroded) return { shards: 0, ok: false, reason: 'not-corroded' };
  return { shards: getGameplayConfig().trial.purifyShards, ok: true };
}

/**
 * 净化技能：扣除配置数量的碎片并把 `corroded` 置为 false。
 * 技能不存在 / 未腐蚀 / 碎片不足时返回失败，且**不修改存档**。
 */
export function purify(
  save: SaveData,
  skillId: string,
): { ok: boolean; reason?: 'missing' | 'not-corroded' | 'insufficient' } {
  const skill = findSkill(save, skillId);
  if (!skill) return { ok: false, reason: 'missing' };
  if (!skill.corroded) return { ok: false, reason: 'not-corroded' };

  const cost = getGameplayConfig().trial.purifyShards;
  if (save.shards < cost) return { ok: false, reason: 'insufficient' };

  save.shards -= cost;
  skill.corroded = false;
  return { ok: true };
}

/**
 * 洗点：按等级计算金币费用（`level <= freeUntil` 免费），校验新分配后写入存档。
 * 金币不足返回 `insufficient`；分配非法返回 `invalid`。两条失败路径都不扣金币、
 * 不改属性——先校验再扣费，避免“扣了钱却没洗成”。
 */
export function respec(
  save: SaveData,
  attrs: Record<AttrKey, number>,
  level: number,
): { ok: boolean; cost: number; reason?: 'invalid' | 'insufficient' } {
  const cost = respecCost(level);
  if (cost > save.coins) return { ok: false, cost, reason: 'insufficient' };

  const check = validateAttributes(attrs);
  if (!check.ok) return { ok: false, cost, reason: 'invalid' };

  if (cost > 0) save.coins -= cost;
  // 拷贝一份，避免调用方后续修改入参导致存档被意外改动。
  save.attributes = { ...attrs };
  return { ok: true, cost };
}
