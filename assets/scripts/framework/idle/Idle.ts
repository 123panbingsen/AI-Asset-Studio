/**
 * Idle —— 挂机与离线结算：速率、日蚀时段、离线上限与收益计算。
 *
 * 所有平衡数值（安全/冒险速率、8 小时离线上限、日蚀时段与倍率）都在调用时
 * 从 `getGameplayConfig().idle` 读取，本模块不硬编码任何数值，也不持有缓存。
 * 纯逻辑模块：不 import `cc`，可在 node 测试环境中直接运行。
 */
import type { SaveData } from '../Save';
import type { IdleMode as SaveIdleMode } from '../Save';
import { getGameplayConfig } from '../Config';

/** 挂机模式：安全（无试炼）/ 冒险（有试炼机会）。与存档层同一类型来源。 */
export type IdleMode = SaveIdleMode;

/** 每分钟挂机产出速率（日蚀倍率已计入）。 */
export interface RateInfo {
  coinsPerMin: number;
  shardsPerMin: number;
  trialChancePerMin: number;
}

/** 一次离线结算的结果。 */
export interface OfflineReport {
  /** 实际离线秒数（向下取整，未受上限裁剪）。 */
  seconds: number;
  /** 参与结算的秒数（受离线上限裁剪）。 */
  cappedSeconds: number;
  /** 是否因为超过离线上限而被裁剪。 */
  capped: boolean;
  coins: number;
  shards: number;
  trials: number;
  /** 结算时刻是否处于日蚀时段。 */
  eclipse: boolean;
}

/**
 * 读取指定模式在（非）日蚀时段的每分钟速率。
 * 日蚀时资源（金币/碎片）乘 `eclipse.resourceMult`，试炼概率乘 `eclipse.trialMult`。
 */
export function idleRates(mode: IdleMode, eclipse: boolean): RateInfo {
  const idle = getGameplayConfig().idle;
  const base = mode === 'adventure' ? idle.adventure : idle.safe;
  const resourceMult = eclipse ? idle.eclipse.resourceMult : 1;
  const trialMult = eclipse ? idle.eclipse.trialMult : 1;
  return {
    coinsPerMin: base.coinsPerMin * resourceMult,
    shardsPerMin: base.shardsPerMin * resourceMult,
    trialChancePerMin: base.trialChancePerMin * trialMult,
  };
}

/**
 * 判断给定时刻（本地时区）是否处于日蚀时段。
 * 窗口为半开区间 `[startHour, endHour)`；`startHour > endHour` 表示跨午夜
 * （如 23 → 6）。`startHour === endHour` 是空区间，永不生效。
 */
export function eclipseActive(nowMs: number): boolean {
  const { startHour, endHour } = getGameplayConfig().idle.eclipse;
  if (startHour === endHour) return false;
  const hour = new Date(nowMs).getHours();
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  // 跨午夜：深夜段或凌晨段都算窗口内
  return hour >= startHour || hour < endHour;
}

function emptyReport(): OfflineReport {
  return {
    seconds: 0,
    cappedSeconds: 0,
    capped: false,
    coins: 0,
    shards: 0,
    trials: 0,
    eclipse: false,
  };
}

/**
 * 依据存档的 `lastSeenAt` 与当前时间结算离线收益。
 *
 * - `lastSeenAt === 0`：首次启动，不结算（返回全零）。
 * - `nowMs <= lastSeenAt`：时钟回拨/异常，不结算。
 * - 否则按 `offlineCapHours` 裁剪秒数，并按 `idleRates` 每分钟产出向下取整。
 *   `cappedSeconds < 60` 时不足一分钟，收益为 0。
 */
export function offlineReport(save: SaveData, nowMs: number): OfflineReport {
  // 0 为“从未游玩”；负值/NaN 同样视为无效，避免算出天文数字收益
  if (!(save.lastSeenAt > 0)) return emptyReport();
  if (!(nowMs > save.lastSeenAt)) return emptyReport();

  const seconds = Math.floor((nowMs - save.lastSeenAt) / 1000);
  const idle = getGameplayConfig().idle;
  const capSeconds = Math.max(0, Math.floor(idle.offlineCapHours * 3600));
  const cappedSeconds = Math.min(seconds, capSeconds);
  const capped = seconds > cappedSeconds;
  const eclipse = eclipseActive(nowMs);
  const rates = idleRates(save.idleMode, eclipse);
  const minutes = cappedSeconds / 60;

  return {
    seconds,
    cappedSeconds,
    capped,
    coins: Math.floor(minutes * rates.coinsPerMin),
    shards: Math.floor(minutes * rates.shardsPerMin),
    trials: Math.floor(minutes * rates.trialChancePerMin),
    eclipse,
  };
}
