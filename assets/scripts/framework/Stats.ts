/**
 * Stats —— 英雄等级到战斗属性的换算（纯逻辑）。
 */
export interface HeroBattleStats {
  hp: number;
  atk: number;
}

/** 英雄等级对战斗属性的加成：每级 +12% 生命、+10% 攻击 */
export function heroBattleStats(baseHp: number, baseAtk: number, level: number): HeroBattleStats {
  const lv = Math.max(1, Math.floor(level || 1));
  return {
    hp: Math.round(baseHp * (1 + 0.12 * (lv - 1))),
    atk: Math.round(baseAtk * (1 + 0.1 * (lv - 1))),
  };
}
