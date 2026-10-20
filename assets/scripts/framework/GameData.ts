/**
 * GameData —— 静态展示数据（玩家信息、货币、商店、任务、背包、武将列表）。
 */
export interface Hero {
  id: string;
  name: string;
  title: string;
  cls: string;
  power: number;
  stars: number;
  color: string;
}

export interface Item {
  id: string;
  name: string;
  quality: string;
  count: number;
  color: string;
  desc: string;
}

export interface Good {
  id: string;
  name: string;
  price: number;
  currency: string;
  color: string;
}

export interface Quest {
  id: string;
  name: string;
  desc: string;
  progress: number;
  target: number;
  reward: string;
  done: boolean;
  coins?: number;
  gems?: number;
}

export const DATA = {
  player: { name: '常山赵子龙', lv: 58, title: '大将军', exp: 0.62 },
  currencies: [
    { name: '金币', value: '12,345', color: '#e0b75a' },
    { name: '勾玉', value: '800', color: '#7fb6c9' },
    { name: '点券', value: '3,210', color: '#c0352a' },
  ],
  heroes: [
    { id: 'guanyu', name: '关羽', title: '武圣', cls: '战士', power: 1280, stars: 5, color: '#c0352a' },
    { id: 'zhaoyun', name: '赵云', title: '常胜将军', cls: '刺客', power: 1180, stars: 4, color: '#7fb6c9' },
    { id: 'zhugeliang', name: '诸葛亮', title: '卧龙', cls: '法师', power: 1120, stars: 5, color: '#8a6ad0' },
    { id: 'zhangfei', name: '张飞', title: '万人敌', cls: '坦克', power: 1050, stars: 3, color: '#c9742a' },
    { id: 'huangzhong', name: '黄忠', title: '老当益壮', cls: '射手', power: 990, stars: 4, color: '#6fbf7f' },
    { id: 'machao', name: '马超', title: '锦马超', cls: '战士', power: 1080, stars: 4, color: '#c9a15a' },
    { id: 'pangtong', name: '庞统', title: '凤雏', cls: '法师', power: 960, stars: 3, color: '#c05a8a' },
    { id: 'jiangwei', name: '姜维', title: '幼麟', cls: '刺客', power: 1020, stars: 4, color: '#5a9ac0' },
  ] as Hero[],
  items: [
    { id: 'i1', name: '青龙偃月刀', quality: '金色', count: 1, color: '#e0b75a', desc: '攻击 +320，暴击 +12%，血气 +800' },
    { id: 'i2', name: '诸葛连弩', quality: '紫色', count: 1, color: '#8a6ad0', desc: '攻击 +260，攻速 +8%' },
    { id: 'i3', name: '玉玺', quality: '蓝色', count: 2, color: '#5a9ac0', desc: '统率 +40' },
    { id: 'i4', name: '赤兔马', quality: '金色', count: 1, color: '#e0b75a', desc: '移速 +15%' },
    { id: 'i5', name: '龙鳞甲', quality: '紫色', count: 1, color: '#8a6ad0', desc: '防御 +180' },
    { id: 'i6', name: '回春丹', quality: '绿色', count: 5, color: '#6fbf7f', desc: '恢复 30% 生命' },
    { id: 'i7', name: '青铜剑', quality: '白色', count: 3, color: '#c8c2b4', desc: '攻击 +60' },
    { id: 'i8', name: '八阵图', quality: '金色', count: 1, color: '#e0b75a', desc: '全属性 +10%' },
  ] as Item[],
  shop: [
    { id: 's1', name: '募兵令', price: 980, currency: '金币', color: '#c9a15a' },
    { id: 's2', name: '体力丹', price: 98, currency: '勾玉', color: '#6fbf7f' },
    { id: 's3', name: '装备匣', price: 88, currency: '勾玉', color: '#7fb6c9' },
    { id: 's4', name: '技能书', price: 120, currency: '点券', color: '#c0352a' },
  ] as Good[],
  quests: [
    { id: 'q1', name: '主线 · 讨伐黄巾', desc: '击败黄巾余党 10 次', progress: 7, target: 10, reward: '金币 ×500', done: false, coins: 500 },
    { id: 'q2', name: '每日 · 演武', desc: '完成 3 场演武', progress: 3, target: 3, reward: '勾玉 ×60', done: true, gems: 60 },
    { id: 'q3', name: '活动 · 过关斩将', desc: '通过第 5 关', progress: 2, target: 5, reward: '点券 ×30', done: false, gems: 30 },
    { id: 'q4', name: '成就 · 五虎上将', desc: '集齐五虎上将', progress: 3, target: 5, reward: '金箱 ×1', done: false, coins: 1000 },
  ] as Quest[],
  skills: [
    { name: '青龙斩', color: '#c0352a', cd: 8 },
    { name: '拖刀计', color: '#7fb6c9', cd: 12 },
    { name: '武圣附体', color: '#e0b75a', cd: 30 },
  ],
};
