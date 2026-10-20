/**
 * State —— 跨页面共享的运行时状态（当前英雄、战斗关卡、选关章节、试炼）。
 */
import { DATA, Hero } from './GameData';

export const State = {
  hero: DATA.heroes[0] as Hero,
  battleStageId: '1-1',
  stageChapter: 1,
  /** 是否处于试炼流程：战斗页据此走试炼胜负分支，而非普通结算。 */
  trialActive: false,
  /** 试炼胜利后的三选一候选，由 Battle 结算写入、TrialChoose 消费后清空。 */
  trialOffers: [] as { defId: string; quality: string }[],
};
