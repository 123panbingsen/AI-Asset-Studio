/**
 * Save —— 存档结构与存储抽象：默认值、版本迁移、损坏重置、防抖落盘。
 */
export interface StorageLike {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

/** 六维属性键。 */
export type AttrKey = 'str' | 'int' | 'spd' | 'vit' | 'hp' | 'res';

/** 技能品质。 */
export type SkillQuality = 'common' | 'rare' | 'epic' | 'legend';

/** 挂机模式：安全 / 冒险。 */
export type IdleMode = 'safe' | 'adventure';

/** 已拥有技能。 */
export interface OwnedSkill {
  id: string;
  defId: string;
  quality: SkillQuality;
  level: number;
  corroded: boolean;
}

/** 试炼统计：尝试 / 失败 / 保底计数。 */
export interface TrialStats {
  attempts: number;
  fails: number;
  pity: number;
}

export interface SaveData {
  v: number;
  coins: number;
  /** 净化技能消耗的碎片（任务 6）。 */
  shards: number;
  gems: number;
  tickets: number;
  heroLevels: Record<string, number>;
  cleared: string[];
  items: Record<string, number>;
  claimed: string[];
  stars: Record<string, number>;
  updatedAt: number;
  attributes: Record<AttrKey, number>;
  permanentSkill: string | null;
  skills: OwnedSkill[];
  protectedSkills: string[];
  idleMode: IdleMode;
  lastSeenAt: number;
  trialStats: TrialStats;
  storyAct: number;
}

export const SAVE_KEY = 'eb.save.v1';

const DEFAULT: SaveData = {
  v: 1,
  coins: 0,
  shards: 0,
  gems: 0,
  tickets: 0,
  heroLevels: {},
  cleared: [],
  items: {},
  claimed: [],
  stars: {},
  updatedAt: 0,
  attributes: { str: 0, int: 0, spd: 0, vit: 0, hp: 0, res: 0 },
  permanentSkill: null,
  skills: [],
  protectedSkills: [],
  idleMode: 'safe',
  lastSeenAt: 0,
  trialStats: { attempts: 0, fails: 0, pity: 0 },
  storyAct: 1,
};

const ATTR_KEYS: AttrKey[] = ['str', 'int', 'spd', 'vit', 'hp', 'res'];
const QUALITIES: SkillQuality[] = ['common', 'rare', 'epic', 'legend'];

function clone(d: SaveData): SaveData {
  return JSON.parse(JSON.stringify(d)) as SaveData;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** 非负整数：非法值回退，负数归零，小数向下取整。 */
function nonNegInt(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : fallback;
}

/** 至少为 1 的整数（等级/幕数）。 */
function intAtLeastOne(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(1, Math.floor(v)) : 1;
}

/** 清理字符串 id：非字符串、空白串返回 null，并去掉首尾空白。 */
function cleanId(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function normalizeAttributes(raw: unknown): Record<AttrKey, number> {
  const r = isObj(raw) ? raw : {};
  const out = {} as Record<AttrKey, number>;
  for (const k of ATTR_KEYS) out[k] = nonNegInt(r[k], 0);
  return out;
}

/** 技能数组：丢弃结构非法项，按 id 去重（保留首条），品质回退 common。 */
function normalizeSkills(raw: unknown): OwnedSkill[] {
  if (!Array.isArray(raw)) return [];
  const out: OwnedSkill[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isObj(item)) continue;
    const id = cleanId(item.id);
    const defId = cleanId(item.defId);
    if (!id || !defId || seen.has(id)) continue;
    seen.add(id);
    const q = typeof item.quality === 'string' ? item.quality : '';
    out.push({
      id,
      defId,
      quality: QUALITIES.indexOf(q as SkillQuality) >= 0 ? (q as SkillQuality) : 'common',
      level: intAtLeastOne(item.level),
      corroded: item.corroded === true,
    });
  }
  return out;
}

/** 字符串 id 数组：丢弃非字符串/空白项并去重。 */
function normalizeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = cleanId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function normalizeTrialStats(raw: unknown): TrialStats {
  const r = isObj(raw) ? raw : {};
  return {
    attempts: nonNegInt(r.attempts, 0),
    fails: nonNegInt(r.fails, 0),
    pity: nonNegInt(r.pity, 0),
  };
}

/** 把任意原始存档归一化为 SaveData：缺字段补默认、非法值回退，永不抛异常。 */
export function normalizeSave(raw: unknown): SaveData {
  if (!isObj(raw)) return clone(DEFAULT);
  const p = raw;
  const out = clone(DEFAULT);
  const version = num(p.v, 1);

  const levels: Record<string, number> = {};
  if (isObj(p.heroLevels)) {
    for (const k of Object.keys(p.heroLevels)) {
      const lv = num((p.heroLevels as Record<string, unknown>)[k], 0);
      if (lv > 0) levels[k] = Math.floor(lv);
    }
  }
  out.heroLevels = levels;

  if (Array.isArray(p.cleared)) {
    out.cleared = p.cleared.filter((x): x is string => typeof x === 'string');
  }

  const items: Record<string, number> = {};
  if (isObj(p.items)) {
    for (const k of Object.keys(p.items)) {
      const c = num((p.items as Record<string, unknown>)[k], 0);
      if (c > 0) items[k] = Math.floor(c);
    }
  }
  out.items = items;
  out.claimed = Array.isArray(p.claimed)
    ? p.claimed.filter((x): x is string => typeof x === 'string')
    : [];

  const stars: Record<string, number> = {};
  if (isObj(p.stars)) {
    for (const k of Object.keys(p.stars)) {
      const s = num((p.stars as Record<string, unknown>)[k], 0);
      if (s > 0) stars[k] = Math.min(3, Math.floor(s));
    }
  }
  out.stars = stars;

  if (version < 1) {
    // v0 -> v1: 旧字段 coin -> coins
    out.coins = num(p.coin, 0);
    out.gems = num(p.gem, 0);
  } else {
    out.coins = num(p.coins, 0);
    out.gems = num(p.gems, 0);
    out.tickets = num(p.tickets, 0);
  }

  // MVP 新字段：旧档缺省补默认，非法值就地清洗。
  out.shards = nonNegInt(p.shards, 0);
  out.attributes = normalizeAttributes(p.attributes);
  out.permanentSkill = cleanId(p.permanentSkill);
  out.skills = normalizeSkills(p.skills);
  out.protectedSkills = normalizeIds(p.protectedSkills);
  out.idleMode = p.idleMode === 'adventure' ? 'adventure' : 'safe';
  out.lastSeenAt = nonNegInt(p.lastSeenAt, 0);
  out.trialStats = normalizeTrialStats(p.trialStats);
  out.storyAct = intAtLeastOne(p.storyAct);

  out.updatedAt = num(p.updatedAt, 0);
  out.v = 1;
  return out;
}

/** 存档读写：内存缓存 + 防抖写入，读取时做版本迁移与损坏重置。 */
export class SaveStore {
  private data: SaveData;

  constructor(private storage: StorageLike, private now: () => number = Date.now) {
    this.data = this.load();
  }

  private load(): SaveData {
    const raw = this.storage.read(SAVE_KEY);
    if (!raw) return clone(DEFAULT);
    try {
      return normalizeSave(JSON.parse(raw));
    } catch {
      return clone(DEFAULT);
    }
  }

  get(): SaveData {
    return this.data;
  }

  update(mutator: (d: SaveData) => void): SaveData {
    mutator(this.data);
    this.data.updatedAt = this.now();
    this.flush();
    return this.data;
  }

  flush(): void {
    this.storage.write(SAVE_KEY, JSON.stringify(this.data));
  }

  reset(): void {
    this.data = clone(DEFAULT);
    this.flush();
  }
}

/** 用给定存储适配器创建 SaveStore。 */
export function createSave(storage: StorageLike, now: () => number = Date.now): SaveStore {
  return new SaveStore(storage, now);
}
