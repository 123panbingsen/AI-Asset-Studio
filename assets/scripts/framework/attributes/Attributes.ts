/**
 * Attributes —— 六维属性模型：默认值、点数校验、爆发力与洗点费用。
 *
 * 所有数值（总点数 / 单项上限 / 爆发权重 / 洗点费率）都从
 * `getGameplayConfig().attributes` 读取，本文件不硬编码任何平衡数值。
 */
import type { AttrKey } from '../Save';
import { getGameplayConfig } from '../Config';

// 从存档层 re-export 属性键类型，避免重复声明导致两处定义漂移。
// 必须写成 `export type`：AttrKey 是纯类型，值级 re-export 会让 Cocos 的
// rollup 在打包时找不到同名运行时导出（MISSING_EXPORT）而构建失败。
export type { AttrKey } from '../Save';

/** 六维属性的固定枚举顺序。 */
const ATTR_KEYS: AttrKey[] = ['str', 'int', 'spd', 'vit', 'hp', 'res'];

/** 全零属性（新档 / 未分配状态）。每次返回新对象，调用方可安全修改。 */
export function defaultAttributes(): Record<AttrKey, number> {
  return { str: 0, int: 0, spd: 0, vit: 0, hp: 0, res: 0 };
}

/** 非有限数（含 undefined / NaN / Infinity）按 0 处理，保证纯函数不抛异常。 */
function finiteOrZero(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** 保留两位小数，规避浮点误差（如 0.1 * 3）。 */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * 校验一组属性点：总和必须等于配置的 points，每项必须是 0..cap 的整数。
 * 缺失键、非数字、NaN/Infinity、负数、小数、超上限都会给出可读中文错误。
 */
export function validateAttributes(a: Record<AttrKey, number>): { ok: boolean; errors: string[] } {
  const cfg = getGameplayConfig().attributes;
  const src = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
  const errors: string[] = [];
  let allNumeric = true;

  for (const k of ATTR_KEYS) {
    const v = src[k];
    if (typeof v !== 'number') {
      errors.push(`属性 ${k} 缺失或不是数字`);
      allNumeric = false;
      continue;
    }
    if (!Number.isFinite(v)) {
      errors.push(`属性 ${k} 不是有效数字（NaN 或 Infinity）`);
      allNumeric = false;
      continue;
    }
    if (!Number.isInteger(v)) errors.push(`属性 ${k} 必须是整数，当前为 ${v}`);
    if (v < 0) errors.push(`属性 ${k} 不能为负数，当前为 ${v}`);
    if (v > cfg.cap) errors.push(`属性 ${k} 不能超过上限 ${cfg.cap}，当前为 ${v}`);
  }

  // 只有六项都是有限数字时总和才有意义；否则由上面的错误说明原因。
  if (allNumeric) {
    const total = ATTR_KEYS.reduce((n, k) => n + (src[k] as number), 0);
    if (total !== cfg.points) {
      errors.push(`属性总和必须为 ${cfg.points}，当前为 ${total}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/** 爆发力 = str * w.str + spd * w.spd + int * w.int（权重取自玩法配置），结果保留两位小数。 */
export function burstPower(a: Record<AttrKey, number>): number {
  const w = getGameplayConfig().attributes.burst;
  const src = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
  return round2(finiteOrZero(src.str) * w.str + finiteOrZero(src.spd) * w.spd + finiteOrZero(src.int) * w.int);
}

/**
 * 洗点费用：等级 <= freeUntil 时免费（返回 0）；
 * 超过免费等级后按 (level - freeUntil) * perPoint 计费，两项均来自玩法配置。
 * 例：freeUntil=10、perPoint=10 时，11 级费用 10、20 级费用 100。
 */
export function respecCost(level: number): number {
  const { freeUntil, perPoint } = getGameplayConfig().attributes.respec;
  const lv = finiteOrZero(level);
  if (lv <= freeUntil) return 0;
  return round2((lv - freeUntil) * perPoint);
}
