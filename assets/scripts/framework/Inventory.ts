/**
 * Inventory —— 资源与养成逻辑：购买、英雄升级、任务领取、道具消耗（纯逻辑，无 cc 依赖）。
 */
import type { SaveData } from './Save';

export type Currency = 'coins' | 'gems' | 'tickets';

export interface GoodCfg {
  id: string;
  price: number;
  currency: Currency;
}

export interface BuyResult {
  ok: boolean;
  reason?: 'insufficient' | 'unknown';
  cost: number;
  currency: Currency;
}

export interface UpgradeResult {
  ok: boolean;
  reason?: 'insufficient' | 'max';
  level: number;
  nextLevel: number;
  cost: number;
}

export interface QuestCfg {
  id: string;
  coins?: number;
  gems?: number;
}

export interface ClaimResult {
  ok: boolean;
  reason?: 'claimed';
  coins: number;
  gems: number;
}

/** 读取道具数量。 */
export function itemCount(save: SaveData, id: string): number {
  return save.items[id] ?? 0;
}

/** 消耗一个道具；数量不足返回 false。 */
export function consumeItem(save: SaveData, id: string): boolean {
  const n = save.items[id] ?? 0;
  if (n <= 0) return false;
  if (n === 1) {
    delete save.items[id];
  } else {
    save.items[id] = n - 1;
  }
  return true;
}

/** 购买商品：扣货币并放入背包。 */
export function buy(save: SaveData, good: GoodCfg): BuyResult {
  const cost = good.price;
  const currency = good.currency;
  if (save[currency] < cost) {
    return { ok: false, reason: 'insufficient', cost, currency };
  }
  save[currency] -= cost;
  save.items[good.id] = (save.items[good.id] ?? 0) + 1;
  return { ok: true, cost, currency };
}

/** 英雄升级费用：100 * 1.5^(level-1)。 */
export function upgradeCost(level: number, base = 100, growth = 1.5): number {
  return Math.floor(base * Math.pow(growth, Math.max(0, level - 1)));
}

/** 英雄升级：扣金币、等级 +1，返回结果。 */
export function upgradeHero(
  save: SaveData,
  heroId: string,
  maxLevel = 60,
  base = 100,
  growth = 1.5,
): UpgradeResult {
  const level = save.heroLevels[heroId] ?? 1;
  if (level >= maxLevel) {
    return { ok: false, reason: 'max', level, nextLevel: level, cost: 0 };
  }
  const cost = upgradeCost(level, base, growth);
  if (save.coins < cost) {
    return { ok: false, reason: 'insufficient', level, nextLevel: level, cost };
  }
  save.coins -= cost;
  save.heroLevels[heroId] = level + 1;
  return { ok: true, level, nextLevel: level + 1, cost };
}

/** 领取任务奖励（幂等）。 */
export function claimQuest(save: SaveData, quest: QuestCfg): ClaimResult {
  if (save.claimed.indexOf(quest.id) >= 0) {
    return { ok: false, reason: 'claimed', coins: 0, gems: 0 };
  }
  const coins = quest.coins ?? 0;
  const gems = quest.gems ?? 0;
  save.coins += coins;
  save.gems += gems;
  save.claimed.push(quest.id);
  return { ok: true, coins, gems };
}
