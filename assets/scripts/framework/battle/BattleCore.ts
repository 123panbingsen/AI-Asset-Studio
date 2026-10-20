/**
 * BattleCore —— 纯逻辑战斗核心：角色/技能/波次/AI/碰撞分离/伤害结算，不依赖 cc。
 */
export interface Actor {
  id: string;
  hp: number;
  maxHp: number;
  atk: number;
  speed: number;
  x: number;
  y: number;
  cd: number;
  range?: number;
  attackCd?: number;
  boss?: boolean;
  specialCd?: number;
}

export interface SkillRuntime {
  id: string;
  name: string;
  cd: number;
  mult: number;
  range: number;
  cdLeft: number;
  type?: 'aoe' | 'ranged' | 'heal';
}

export type BattleResult = 'running' | 'win' | 'lose';

export interface BattleState {
  player: Actor;
  enemies: Actor[];
  skills: SkillRuntime[];
  pending: Actor[][];
  result: BattleResult;
  arenaW: number;
  arenaH: number;
  waveIndex: number;
  waveTotal: number;
}

export interface BattleInput {
  moveX: number;
  moveY: number;
  attack?: boolean;
  skill?: number;
}

export const ATTACK_CD = 0.8;
export const ATTACK_RANGE = 120;
export const ENEMY_ATTACK_RANGE = 70;
export const ENEMY_ATTACK_CD = 1;
export const BODY_RADIUS = 30;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function dist(a: Actor, b: Actor): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function copyActor(a: Actor): Actor {
  return { ...a };
}

function nearest(enemies: Actor[], from: Actor): Actor | null {
  let best: Actor | null = null;
  let bd = Infinity;
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const d = dist(e, from);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function makeState(
  player: Actor,
  waves: Actor[][],
  skills: SkillRuntime[],
  arenaW: number,
  arenaH: number,
): BattleState {
  const first = waves.length > 0 ? waves[0].map(copyActor) : [];
  return {
    player: copyActor(player),
    enemies: first,
    skills: skills.map((s) => ({ ...s })),
    pending: waves.slice(1).map((w) => w.map(copyActor)),
    result: 'running',
    arenaW,
    arenaH,
    waveIndex: 0,
    waveTotal: Math.max(1, waves.length),
  };
}

/** 创建单场战斗状态（单波敌人）。 */
export function createBattle(
  player: Actor,
  enemies: Actor[],
  skills: SkillRuntime[] = [],
  arenaW = 750,
  arenaH = 1096,
): BattleState {
  return makeState(player, [enemies], skills, arenaW, arenaH);
}

/** 创建多波次战斗状态：首波立即出场，其余进入 pending。 */
export function createBattleWaves(
  player: Actor,
  waves: Actor[][],
  skills: SkillRuntime[] = [],
  arenaW = 750,
  arenaH = 1096,
): BattleState {
  return makeState(player, waves, skills, arenaW, arenaH);
}

/** 推进一帧战斗：技能/输入/敌人 AI/攻击/碰撞分离/胜负判定，返回新状态。 */
export function step(state: BattleState, dt: number, input: BattleInput): BattleState {
  if (state.result !== 'running') return state;

  const s: BattleState = {
    player: copyActor(state.player),
    enemies: state.enemies.map(copyActor),
    skills: state.skills.map((sk) => ({ ...sk })),
    pending: state.pending.map((w) => w.map(copyActor)),
    result: state.result,
    arenaW: state.arenaW,
    arenaH: state.arenaH,
    waveIndex: state.waveIndex,
    waveTotal: state.waveTotal,
  };

  s.player.cd = Math.max(0, s.player.cd - dt);
  for (const sk of s.skills) sk.cdLeft = Math.max(0, sk.cdLeft - dt);
  for (const e of s.enemies) e.cd = Math.max(0, e.cd - dt);

  const len = Math.hypot(input.moveX, input.moveY);
  if (len > 0) {
    const nx = input.moveX / len;
    const ny = input.moveY / len;
    s.player.x = clamp(s.player.x + nx * s.player.speed * dt, 0, s.arenaW);
    s.player.y = clamp(s.player.y + ny * s.player.speed * dt, 0, s.arenaH);
  }

  if (typeof input.skill === 'number') {
    const sk = s.skills[input.skill];
    if (sk && sk.cdLeft <= 0) {
      const kind = sk.type ?? 'aoe';
      if (kind === 'heal') {
        s.player.hp = Math.min(s.player.maxHp, s.player.hp + s.player.maxHp * sk.mult);
      } else if (kind === 'ranged') {
        const target = nearest(s.enemies, s.player);
        if (target && dist(target, s.player) <= sk.range) {
          target.hp = Math.max(0, target.hp - s.player.atk * sk.mult);
        }
      } else {
        for (const e of s.enemies) {
          if (e.hp > 0 && dist(e, s.player) <= sk.range) {
            e.hp = Math.max(0, e.hp - s.player.atk * sk.mult);
          }
        }
      }
      sk.cdLeft = sk.cd;
    }
  }

  if (input.attack && s.player.cd <= 0) {
    const target = nearest(s.enemies, s.player);
    if (target && dist(target, s.player) <= ATTACK_RANGE) {
      target.hp = Math.max(0, target.hp - s.player.atk);
      s.player.cd = ATTACK_CD;
    }
  }

  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    const range = e.range ?? ENEMY_ATTACK_RANGE;
    const d = dist(e, s.player);

    if (e.boss) {
      const sc = (e.specialCd ?? 3) - dt;
      e.specialCd = sc;
      if (sc <= 0) {
        if (d <= 200) s.player.hp = Math.max(0, s.player.hp - e.atk * 1.5);
        e.specialCd = 6;
      }
    }

    const speed = e.boss && d > 180 ? e.speed * 2.2 : e.speed;
    if (d > range) {
      const stepLen = speed * dt;
      const k = stepLen / Math.max(d, 0.0001);
      e.x = clamp(e.x + (s.player.x - e.x) * k, 0, s.arenaW);
      e.y = clamp(e.y + (s.player.y - e.y) * k, 0, s.arenaH);
    } else if (e.cd <= 0) {
      s.player.hp = Math.max(0, s.player.hp - e.atk);
      e.cd = e.attackCd ?? ENEMY_ATTACK_CD;
    }
  }

  if (s.player.hp <= 0) {
    s.result = 'lose';
  } else if (s.enemies.every((e) => e.hp <= 0)) {
    if (s.pending.length > 0) {
      const next = s.pending.shift() as Actor[];
      s.enemies = next.map(copyActor);
      s.waveIndex += 1;
    } else {
      s.result = 'win';
    }
  }

  separateBodies(s);

  return s;
}

/** 简单的圆形推开，避免角色与敌人重叠站位 */
function separateBodies(s: BattleState): void {
  const min = BODY_RADIUS * 2;
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    const dx = e.x - s.player.x;
    const dy = e.y - s.player.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.0001 && d < min) {
      const push = min - d;
      e.x = clamp(e.x + (dx / d) * push, 0, s.arenaW);
      e.y = clamp(e.y + (dy / d) * push, 0, s.arenaH);
    } else if (d <= 0.0001) {
      e.x = clamp(s.player.x + min, 0, s.arenaW);
    }
  }

  // 敌人之间也互相推开，避免叠在一起
  for (let i = 0; i < s.enemies.length; i++) {
    const a = s.enemies[i];
    if (a.hp <= 0) continue;
    for (let j = i + 1; j < s.enemies.length; j++) {
      const b = s.enemies[j];
      if (b.hp <= 0) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.0001 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x = clamp(a.x - nx * push, 0, s.arenaW);
        a.y = clamp(a.y - ny * push, 0, s.arenaH);
        b.x = clamp(b.x + nx * push, 0, s.arenaW);
        b.y = clamp(b.y + ny * push, 0, s.arenaH);
      }
    }
  }
}

/** 读取战斗结果。 */
export function resultOf(state: BattleState): BattleResult {
  return state.result;
}
