/**
 * Config —— 运行时游戏配置的类型定义与归一化（英雄/技能/敌兵/关卡/玩法），带兜底默认值。
 */
export interface HeroCfg {
  id: string;
  name: string;
  title: string;
  cls: string;
  power: number;
  stars: number;
  color: string;
  hp: number;
  atk: number;
  speed: number;
}

export interface SkillCfg {
  id: string;
  name: string;
  color: string;
  cd: number;
  mult: number;
  range: number;
  type: 'aoe' | 'ranged' | 'heal';
}

export interface EnemyCfg {
  id: string;
  name: string;
  color: string;
  hp: number;
  atk: number;
  speed: number;
  range: number;
  attackCd: number;
  coins: number;
  exp: number;
  boss: boolean;
}

export interface SpawnCfg {
  enemy: string;
  count: number;
}

export interface StageCfg {
  id: string;
  chapter: number;
  index: number;
  name: string;
  coins: number;
  firstCoins: number;
  gems: number;
  waves: SpawnCfg[][];
}

export interface GameConfig {
  heroes: HeroCfg[];
  skills: SkillCfg[];
  enemies: EnemyCfg[];
  stages: StageCfg[];
}

export interface RateCfg {
  coinsPerMin: number;
  shardsPerMin: number;
  trialChancePerMin: number;
}

export interface PermanentSkillCfg {
  id: string;
  name: string;
  desc: string;
  tag: string;
}

export interface SkillPoolEntryCfg {
  defId: string;
  name: string;
  quality: string;
}

export interface SlotCfg {
  level: number;
  count: number;
}

export interface GameplayConfig {
  attributes: {
    points: number;
    cap: number;
    burst: { str: number; spd: number; int: number };
    respec: { freeUntil: number; perPoint: number };
  };
  permanentSkills: PermanentSkillCfg[];
  skillPool: SkillPoolEntryCfg[];
  slots: SlotCfg[];
  idle: {
    safe: RateCfg;
    adventure: RateCfg;
    offlineCapHours: number;
    eclipse: { startHour: number; endHour: number; resourceMult: number; trialMult: number };
  };
  trial: { firstN: number; pityFails: number; protectMax: number; purifyShards: number };
}

const EMPTY: GameConfig = { heroes: [], skills: [], enemies: [], stages: [] };
let current: GameConfig = EMPTY;

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function arr(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}

function normalizeHero(raw: any): HeroCfg {
  return {
    id: str(raw.id),
    name: str(raw.name),
    title: str(raw.title),
    cls: str(raw.cls),
    power: num(raw.power, 0),
    stars: num(raw.stars, 1),
    color: str(raw.color, '#c9a15a'),
    hp: num(raw.hp, 100),
    atk: num(raw.atk, 10),
    speed: num(raw.speed, 300),
  };
}

function normalizeSkill(raw: any): SkillCfg {
  const type = raw.type === 'ranged' || raw.type === 'heal' ? raw.type : 'aoe';
  return {
    id: str(raw.id),
    name: str(raw.name),
    color: str(raw.color, '#c9a15a'),
    cd: num(raw.cd, 6),
    mult: num(raw.mult, 1.5),
    range: num(raw.range, 150),
    type,
  };
}

function normalizeEnemy(raw: any): EnemyCfg {
  return {
    id: str(raw.id),
    name: str(raw.name),
    color: str(raw.color, '#c0352a'),
    hp: num(raw.hp, 0),
    atk: num(raw.atk, 5),
    speed: num(raw.speed, 120),
    range: num(raw.range, 70),
    attackCd: num(raw.attackCd, 1),
    coins: num(raw.coins, 0),
    exp: num(raw.exp, 0),
    boss: raw.boss === true,
  };
}

function normalizeStage(raw: any): StageCfg {
  const waves = arr(raw.waves)
    .filter((w: unknown) => Array.isArray(w))
    .map((w: any[]) =>
      w
        .filter((s) => s && typeof s === 'object' && typeof s.enemy === 'string')
        .map((s: any) => ({ enemy: s.enemy as string, count: Math.max(1, Math.floor(num(s.count, 1))) })),
    )
    .filter((w) => w.length > 0);

  const coins = num(raw.coins, 0);
  return {
    id: str(raw.id),
    chapter: num(raw.chapter, 1),
    index: num(raw.index, 1),
    name: str(raw.name),
    coins,
    firstCoins: num(raw.firstCoins, coins * 2),
    gems: num(raw.gems, 0),
    waves,
  };
}

/** 把原始 JSON 归一化为 GameConfig（非法值走默认）。 */
export function normalizeConfig(raw: any): GameConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    heroes: arr(r.heroes)
      .filter((h) => h && typeof h === 'object' && typeof h.id === 'string')
      .map(normalizeHero),
    skills: arr(r.skills)
      .filter((s) => s && typeof s === 'object' && typeof s.id === 'string')
      .map(normalizeSkill),
    enemies: arr(r.enemies)
      .filter((e) => e && typeof e === 'object' && typeof e.id === 'string')
      .map(normalizeEnemy)
      .filter((e) => e.hp > 0),
    stages: arr(r.stages)
      .filter((s) => s && typeof s === 'object' && typeof s.id === 'string')
      .map(normalizeStage),
  };
}

/** 设置全局配置。 */
export function setConfig(cfg: GameConfig): void {
  current = cfg;
}

/** 读取全局配置。 */
export function getConfig(): GameConfig {
  return current;
}

/** 按 id 查英雄配置。 */
export function heroById(id: string): HeroCfg | undefined {
  return current.heroes.find((h) => h.id === id);
}

/** 按 id 查敌兵配置。 */
export function enemyById(id: string): EnemyCfg | undefined {
  return current.enemies.find((e) => e.id === id);
}

/** 读取全部技能配置。 */
export function skillList(): SkillCfg[] {
  return current.skills;
}

/** 按 id 查关卡配置。 */
export function stageCfgById(id: string): StageCfg | undefined {
  return current.stages.find((s) => s.id === id);
}

/** 玩法数值默认值（gameplay.json 缺失/非法时兜底）。 */
export const DEFAULT_GAMEPLAY: GameplayConfig = {
  attributes: {
    points: 60,
    cap: 24,
    burst: { str: 0.4, spd: 0.4, int: 0.2 },
    respec: { freeUntil: 10, perPoint: 10 },
  },
  permanentSkills: [
    { id: 'eclipsed_blade', name: '蚀刃', desc: '力量与速度同调，普攻附带蚀伤，爆发力最高。', tag: 'dps' },
    { id: 'night_heart', name: '夜心', desc: '以生命与抗性为盾，受击减伤并缓慢回复。', tag: 'tank' },
    { id: 'light_engine', name: '光机', desc: '离线收益提升，日蚀时段额外产出资源。', tag: 'idle' },
  ],
  skillPool: [
    { defId: 'qinglong', name: '青龙斩', quality: 'epic' },
    { defId: 'tuodao', name: '拖刀计', quality: 'rare' },
    { defId: 'wusheng', name: '武圣附体', quality: 'legend' },
    { defId: 'pojun', name: '破军', quality: 'rare' },
    { defId: 'liuxing', name: '流星', quality: 'common' },
    { defId: 'tiebi', name: '铁壁', quality: 'common' },
    { defId: 'huichun', name: '回春', quality: 'rare' },
    { defId: 'shixue', name: '蚀血', quality: 'epic' },
    { defId: 'jinghong', name: '惊鸿', quality: 'common' },
    { defId: 'zhanyue', name: '斩月', quality: 'legend' },
  ],
  slots: [
    { level: 1, count: 1 },
    { level: 5, count: 2 },
    { level: 10, count: 3 },
    { level: 20, count: 4 },
    { level: 30, count: 5 },
    { level: 50, count: 6 },
  ],
  idle: {
    safe: { coinsPerMin: 30, shardsPerMin: 1, trialChancePerMin: 0 },
    adventure: { coinsPerMin: 60, shardsPerMin: 2, trialChancePerMin: 0.1 },
    offlineCapHours: 8,
    eclipse: { startHour: 20, endHour: 21, resourceMult: 2, trialMult: 1.5 },
  },
  trial: { firstN: 3, pityFails: 3, protectMax: 2, purifyShards: 20 },
};

/** 深冻结默认值，防止调用方误改全局兜底基线。 */
function deepFreeze<T>(target: T): T {
  if (target && typeof target === 'object') {
    Object.getOwnPropertyNames(target).forEach((k) => {
      const v = (target as any)[k];
      if (v && typeof v === 'object') deepFreeze(v);
    });
    Object.freeze(target);
  }
  return target;
}

deepFreeze(DEFAULT_GAMEPLAY);

/** 深拷贝玩法配置，隔离单例、getter 与默认值。 */
function cloneGameplay(src: GameplayConfig): GameplayConfig {
  return {
    attributes: {
      points: src.attributes.points,
      cap: src.attributes.cap,
      burst: { ...src.attributes.burst },
      respec: { ...src.attributes.respec },
    },
    permanentSkills: src.permanentSkills.map((s) => ({ ...s })),
    skillPool: src.skillPool.map((s) => ({ ...s })),
    slots: src.slots.map((s) => ({ ...s })),
    idle: {
      safe: { ...src.idle.safe },
      adventure: { ...src.idle.adventure },
      offlineCapHours: src.idle.offlineCapHours,
      eclipse: { ...src.idle.eclipse },
    },
    trial: { ...src.trial },
  };
}

let gameplayCurrent: GameplayConfig = cloneGameplay(DEFAULT_GAMEPLAY);

const SKILL_TAGS = ['dps', 'tank', 'idle'];
const QUALITIES = ['common', 'rare', 'epic', 'legend'];

function nonNeg(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

function intNonNeg(v: unknown, fallback: number): number {
  return Math.floor(nonNeg(v, fallback));
}

function obj(v: unknown): any {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function normalizeRate(raw: unknown, def: RateCfg): RateCfg {
  const r = obj(raw);
  return {
    coinsPerMin: nonNeg(r.coinsPerMin, def.coinsPerMin),
    shardsPerMin: nonNeg(r.shardsPerMin, def.shardsPerMin),
    trialChancePerMin: nonNeg(r.trialChancePerMin, def.trialChancePerMin),
  };
}

function defaultPermanentSkills(): PermanentSkillCfg[] {
  return DEFAULT_GAMEPLAY.permanentSkills.map((s) => ({ ...s }));
}

function normalizePermanentSkills(raw: unknown): PermanentSkillCfg[] {
  if (!Array.isArray(raw)) return defaultPermanentSkills();
  const out = raw
    .filter((s: any) => s && typeof s === 'object' && typeof s.id === 'string' && s.id.length > 0)
    .map((s: any) => ({
      id: s.id as string,
      name: str(s.name),
      desc: str(s.desc),
      tag: SKILL_TAGS.indexOf(str(s.tag)) >= 0 ? (s.tag as string) : 'dps',
    }));
  return out.length > 0 ? out : defaultPermanentSkills();
}

function defaultSkillPool(): SkillPoolEntryCfg[] {
  return DEFAULT_GAMEPLAY.skillPool.map((s) => ({ ...s }));
}

function normalizeSkillPool(raw: unknown): SkillPoolEntryCfg[] {
  if (!Array.isArray(raw)) return defaultSkillPool();
  const out = raw
    .filter((s: any) => s && typeof s === 'object' && typeof s.defId === 'string' && s.defId.length > 0)
    .map((s: any) => ({
      defId: s.defId as string,
      name: str(s.name),
      quality: QUALITIES.indexOf(str(s.quality)) >= 0 ? (s.quality as string) : 'common',
    }));
  return out.length > 0 ? out : defaultSkillPool();
}

/** 槽位表按等级合并：默认等级可覆盖，配置中的新等级按 level 升序追加。 */
function normalizeSlots(raw: unknown): SlotCfg[] {
  const base = DEFAULT_GAMEPLAY.slots.map((s) => ({ ...s }));
  if (!Array.isArray(raw)) return base;
  const counts = new Map<number, number>();
  raw.forEach((s: any) => {
    if (!s || typeof s !== 'object') return;
    const level = nonNeg(s.level, -1);
    const count = nonNeg(s.count, -1);
    if (level > 0 && count >= 0) counts.set(Math.floor(level), Math.floor(count));
  });
  const known = new Set(base.map((s) => s.level));
  const merged = base.map((s) => ({ level: s.level, count: counts.has(s.level) ? (counts.get(s.level) as number) : s.count }));
  const extra = Array.from(counts.keys())
    .filter((level) => !known.has(level))
    .sort((a, b) => a - b)
    .map((level) => ({ level, count: counts.get(level) as number }));
  return [...merged, ...extra].sort((a, b) => a.level - b.level);
}

function normalizeAttributes(raw: unknown, def: GameplayConfig['attributes']): GameplayConfig['attributes'] {
  const r = obj(raw);
  const burst = obj(r.burst);
  const respec = obj(r.respec);
  return {
    points: nonNeg(r.points, def.points),
    cap: nonNeg(r.cap, def.cap),
    burst: {
      str: nonNeg(burst.str, def.burst.str),
      spd: nonNeg(burst.spd, def.burst.spd),
      int: nonNeg(burst.int, def.burst.int),
    },
    respec: {
      freeUntil: intNonNeg(respec.freeUntil, def.respec.freeUntil),
      perPoint: nonNeg(respec.perPoint, def.respec.perPoint),
    },
  };
}

function hour(v: unknown, fallback: number): number {
  const h = intNonNeg(v, fallback);
  return h <= 23 ? h : fallback;
}

function normalizeIdle(raw: unknown, def: GameplayConfig['idle']): GameplayConfig['idle'] {
  const r = obj(raw);
  const eclipse = obj(r.eclipse);
  return {
    safe: normalizeRate(r.safe, def.safe),
    adventure: normalizeRate(r.adventure, def.adventure),
    offlineCapHours: intNonNeg(r.offlineCapHours, def.offlineCapHours),
    eclipse: {
      startHour: hour(eclipse.startHour, def.eclipse.startHour),
      endHour: hour(eclipse.endHour, def.eclipse.endHour),
      resourceMult: nonNeg(eclipse.resourceMult, def.eclipse.resourceMult),
      trialMult: nonNeg(eclipse.trialMult, def.eclipse.trialMult),
    },
  };
}

function normalizeTrial(raw: unknown, def: GameplayConfig['trial']): GameplayConfig['trial'] {
  const r = obj(raw);
  return {
    firstN: intNonNeg(r.firstN, def.firstN),
    pityFails: intNonNeg(r.pityFails, def.pityFails),
    protectMax: intNonNeg(r.protectMax, def.protectMax),
    purifyShards: intNonNeg(r.purifyShards, def.purifyShards),
  };
}

/** 把原始玩法 JSON 归一化：缺字段/非法值回退默认，永不抛异常。 */
export function normalizeGameplay(raw: any): GameplayConfig {
  const r = obj(raw);
  return {
    attributes: normalizeAttributes(r.attributes, DEFAULT_GAMEPLAY.attributes),
    permanentSkills: normalizePermanentSkills(r.permanentSkills),
    skillPool: normalizeSkillPool(r.skillPool),
    slots: normalizeSlots(r.slots),
    idle: normalizeIdle(r.idle, DEFAULT_GAMEPLAY.idle),
    trial: normalizeTrial(r.trial, DEFAULT_GAMEPLAY.trial),
  };
}

/** 设置全局玩法配置：先归一化并克隆，避免外部引用污染全局状态。 */
export function setGameplayConfig(cfg: GameplayConfig): void {
  gameplayCurrent = normalizeGameplay(cfg);
}

/** 读取全局玩法配置：返回克隆，调用方修改不影响全局与默认值。 */
export function getGameplayConfig(): GameplayConfig {
  return cloneGameplay(gameplayCurrent);
}
