/**
 * SkillDefs —— 技能定义与技能槽：永久技能、技能池、品质与槽位解锁。
 *
 * 所有数据都从 `getGameplayConfig()` 读取，本文件不硬编码任何技能或槽位数值。
 */
import { getGameplayConfig } from '../Config';

/** 技能品质（与 Save.ts 的 SkillQuality 保持一致，改动时需同步）。 */
export type SkillQuality = 'common' | 'rare' | 'epic' | 'legend';

/** 技能池中的技能定义。 */
export interface SkillDef {
  defId: string;
  name: string;
  quality: SkillQuality;
}

const QUALITIES: SkillQuality[] = ['common', 'rare', 'epic', 'legend'];

/** 把配置里的字符串品质收窄为 SkillQuality；非法值回退 common（配置层已归一化，这里仅防御）。 */
function toQuality(v: string): SkillQuality {
  return QUALITIES.indexOf(v as SkillQuality) >= 0 ? (v as SkillQuality) : 'common';
}

/** 永久技能列表：从玩法配置读取，每次返回副本。 */
export function permanentSkills(): { id: string; name: string; desc: string; tag: string }[] {
  return getGameplayConfig().permanentSkills.map((s) => ({
    id: s.id,
    name: s.name,
    desc: s.desc,
    tag: s.tag,
  }));
}

/** 技能池：从玩法配置读取，品质收窄为 SkillQuality，每次返回副本。 */
export function skillPool(): SkillDef[] {
  return getGameplayConfig().skillPool.map((s) => ({
    defId: s.defId,
    name: s.name,
    quality: toQuality(s.quality),
  }));
}

/**
 * 指定等级可用的技能槽数量：取配置 slots 表中 level <= 当前等级的最高档。
 * 低于首档时至少 1 个；非有限或负等级按 1 级处理，保证纯函数不抛异常。
 */
export function slotCount(level: number): number {
  const lv = typeof level === 'number' && Number.isFinite(level) && level >= 1 ? level : 1;
  let bestLevel = -Infinity;
  let count = 1; // 未达到任何档位时的保底
  for (const tier of getGameplayConfig().slots) {
    if (tier.level <= lv && tier.level > bestLevel) {
      bestLevel = tier.level;
      count = tier.count;
    }
  }
  return count;
}

/** 槽位是否已解锁：槽位索引必须是非负整数且小于当前等级槽位数。 */
export function isUnlocked(level: number, slotIndex: number): boolean {
  return Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < slotCount(level);
}
