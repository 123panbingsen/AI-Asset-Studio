/**
 * Progress —— 关卡进度：解锁判定、通关记录与星级（取历史最佳）。
 */
import type { SaveData } from './Save';

export interface StageDef {
  id: string;
  chapter: number;
  index: number;
  name: string;
  coins: number;
  firstCoins: number;
  gems?: number;
}

export interface StageState {
  def: StageDef;
  unlocked: boolean;
  cleared: boolean;
}

export interface StageReward {
  coins: number;
  gems: number;
  first: boolean;
  stars: number;
}

/** 计算关卡状态：解锁、通关、星级。 */
export function stageStates(stages: StageDef[], cleared: string[]): StageState[] {
  const set = new Set(cleared);
  return stages.map((def, i) => ({
    def,
    unlocked: i === 0 || set.has(stages[i - 1].id),
    cleared: set.has(def.id),
  }));
}

/** 判断关卡是否解锁（首关默认解锁，其余需前一关通关）。 */
export function isUnlocked(stages: StageDef[], id: string, cleared: string[]): boolean {
  const index = stages.findIndex((s) => s.id === id);
  if (index < 0) return false;
  return index === 0 || cleared.indexOf(stages[index - 1].id) >= 0;
}

/** 记录通关：刷新首通、累加奖励、保留历史最佳星级。 */
export function applyStageWin(save: SaveData, stage: StageDef, stars = 0): StageReward {
  const first = save.cleared.indexOf(stage.id) < 0;
  const coins = first ? stage.firstCoins : stage.coins;
  const gems = stage.gems ?? 0;

  save.coins += coins;
  save.gems += gems;
  if (first) save.cleared.push(stage.id);

  const clamped = Math.max(0, Math.min(3, Math.floor(stars)));
  if (clamped > 0) {
    save.stars[stage.id] = Math.max(save.stars[stage.id] ?? 0, clamped);
  }

  return { coins, gems, first, stars: clamped };
}
