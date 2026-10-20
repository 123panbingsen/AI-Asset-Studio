# MVP 垂直切片 · M1 挂机核心闭环 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 跑通「开局三选一/属性 → 安全/冒险挂机与离线报告 → 技能试炼三选一/蚀化/保护/保底 → 技能槽与净化/洗点 → 回挂机」的完整闭环，并持久化。

**Architecture:** 纯逻辑放 `framework/`（属性/挂机/试炼/技能），不依赖 cc，node --test 覆盖；页面层只消费逻辑 API 并写存档。战斗复用现有 `BattleCore` 与 `Battle` 页，试炼作为战斗模式接入。

**Tech Stack:** Cocos Creator 3.8.8、TypeScript、node --test、现有 UI/Save 框架。

**Spec:** `specs/eclipsedblade/gdd.md` v0.4、`prd.md` v0.4（P0-1..P0-9、P0-17、P0-18）、`interaction.md` v0.4。

## Global Constraints

- **玩法数据全部外置**：属性/永久技能/技能池/槽位/挂机/试炼/技能消耗等数值放 `assets/resources/data/*.json`；逻辑模块只通过 `getGameplayConfig()` 读取，不得在逻辑里硬编码魔法数字。
- 逻辑模块不得 `import 'cc'`；页面层才允许。
- 存档 key `eb.save.v1` 只增字段；旧档读取后补默认值，不丢档。
- 离线收益上限 8 小时；安全挂机不触发试炼；冒险挂机可触发。
- 前 3 次试炼必成功或必出稀有；连续失败 3 次触发保底。
- 蚀化不是删除，可免费净化（材料/挂机）；保护位优先不蚀化。
- 属性 60 点、单项上限 24、必须分配完才能确认；10 级前洗点免费。
- 设计分辨率 750×1334；正文 ≥24；触控 ≥88。
- 每任务结束：`tsc` 通过 + 相关测试通过 + 构建 exit 36。

## Review Focus

- 离线时长/时钟回拨：负数或异常时间戳不能产出负收益或崩溃。
- 8 小时上限边界：刚好 8h、超过 8h、0 秒三种情况结算正确。
- 保底计数：连续失败 3 次后下一次必成功/史诗，胜利后计数清零。
- 保护位：满 2 个时替换逻辑、保护中的技能失败不蚀化。
- 槽位解锁等级边界：1/5/10/20/30/50 级切换正确，槽满时不自动丢弃技能。
- 旧档（无新字段）迁移：技能/属性/挂机/试炼字段有默认值，读档不崩。

---

## 文件结构

- `assets/resources/data/gameplay.json` —— 属性/永久技能/技能池/槽位/挂机/试炼/技能消耗配置。
- `assets/scripts/framework/Config.ts` —— 新增 `GameplayConfig` 类型、默认值与 `getGameplayConfig()/setGameplayConfig()`。
- `assets/scripts/framework/ConfigLoad.ts` —— 加载 `data/gameplay.json`，非法/缺字段时回退默认。
- `assets/scripts/framework/attributes/Attributes.ts` —— 六维、上限、爆发力、洗点费用（读配置）。
- `assets/scripts/framework/skills/SkillDefs.ts` —— 永久技能、技能池、品质、槽位等级表。
- `assets/scripts/framework/idle/Idle.ts` —— 挂机速率、日蚀倍率、离线结算与上限。
- `assets/scripts/framework/trial/Trial.ts` —— 试炼结果、新手保护、保底、蚀化应用。
- `assets/scripts/framework/skills/SkillState.ts` —— 保护位、净化、洗点、替换/放弃。
- `assets/scripts/framework/Save.ts` —— 新增字段与迁移。
- `assets/scripts/pages/Onboarding.ts` —— 开局页。
- `assets/scripts/pages/Home.ts` —— 主城挂机页（含离线报告弹窗、蚀化警告条）。
- `assets/scripts/pages/TrialChoose.ts` —— 试炼胜利三选一。
- `assets/scripts/pages/Skills.ts` —— 技能页。
- `assets/scripts/framework/App.ts` —— 注册页面与入口。
- `tests/mvp-core.test.ts`、`tests/mvp-save.test.ts`。

---

### Task 0: 玩法数据配置化

**Files:**
- Create: `assets/resources/data/gameplay.json`
- Modify: `assets/scripts/framework/Config.ts`、`assets/scripts/framework/ConfigLoad.ts`
- Test: `tests/mvp-config.test.ts`

**Interfaces:**
- Produces:
  - `interface GameplayConfig { attributes: { points: number; cap: number; burst: { str: number; spd: number; int: number }; respec: { freeUntil: number; perPoint: number } }; permanentSkills: { id: string; name: string; desc: string; tag: string }[]; skillPool: { defId: string; name: string; quality: string }[]; slots: { level: number; count: number }[]; idle: { safe: RateCfg; adventure: RateCfg; offlineCapHours: number; eclipse: { startHour: number; endHour: number; resourceMult: number; trialMult: number } }; trial: { firstN: number; pityFails: number; protectMax: number; purifyShards: number } }`
  - `getGameplayConfig(): GameplayConfig`
  - `setGameplayConfig(cfg: GameplayConfig): void`
  - `normalizeGameplay(raw: any): GameplayConfig`（缺字段用默认）

- [ ] **Step 1: 写失败测试**（gameplay.json 可加载；缺字段回退默认；非法值不崩溃）
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 写 gameplay.json + GameplayConfig 类型/默认/normalize + ConfigLoad 加载**
- [ ] **Step 4: 跑测试确认通过**
- [ ] **Step 5: Commit** `feat(config): gameplay data separated to json`

---

### Task 1: 存档字段与迁移

**Files:**
- Modify: `assets/scripts/framework/Save.ts`
- Test: `tests/mvp-save.test.ts`

**Interfaces:**
- Consumes: `SaveData`
- Produces（新增字段，均有默认值）：
  - `attributes: Record<AttrKey, number>`（默认全 0）
  - `permanentSkill: string | null`（默认 null）
  - `skills: OwnedSkill[]`（默认 []）
  - `protectedSkills: string[]`（默认 []）
  - `idleMode: 'safe' | 'adventure'`（默认 'safe'）
  - `lastSeenAt: number`（默认 0）
  - `trialStats: { attempts: number; fails: number; pity: number }`（默认 0/0/0）
  - `storyAct: number`（默认 1）
- `OwnedSkill`：`{ id: string; defId: string; quality: 'common'|'rare'|'epic'|'legend'; level: number; corroded: boolean }`

- [ ] **Step 1: 写失败测试**

```ts
test('old save gets new defaults', () => {
  const raw = { v: 1, coins: 5, gems: 0, tickets: 0, heroLevels: {}, cleared: [], items: {}, claimed: [], stars: {}, updatedAt: 1 };
  const save = normalizeSave(raw);
  assert.deepEqual(save.skills, []);
  assert.equal(save.idleMode, 'safe');
  assert.equal(save.trialStats.attempts, 0);
  assert.equal(save.storyAct, 1);
});
```

- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 在默认值与 normalize 中补字段**
- [ ] **Step 4: 跑测试确认通过**
- [ ] **Step 5: Commit** `feat(save): mvp fields and migration`

---

### Task 2: 属性模型

**Files:**
- Create: `assets/scripts/framework/attributes/Attributes.ts`
- Test: `tests/mvp-core.test.ts`

**Interfaces:**
- Produces:
  - 从 `Save.ts` 导入 `AttrKey` 并 re-export（不得重复声明）
  - 从 `getGameplayConfig().attributes` 读取 points/cap（默认 60/24）
  - `defaultAttributes(): Record<AttrKey, number>`
  - `validateAttributes(a): { ok: boolean; errors: string[] }`（和必须=60，单项 0..24）
  - `burstPower(a): number` = `str*0.4 + spd*0.4 + int*0.2`
  - `respecCost(level): number`（读配置 freeUntil/perPoint）

- [ ] **Step 1: 写失败测试**（和=60 通过；59/61 失败；单项 25 失败；爆发力公式；10 级前费用 0）
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现 Attributes.ts**
- [ ] **Step 4: 跑测试确认通过**
- [ ] **Step 5: Commit** `feat(attributes): model and validation`

---

### Task 3: 技能定义与槽位

**Files:**
- Create: `assets/scripts/framework/skills/SkillDefs.ts`
- Test: `tests/mvp-core.test.ts`

**Interfaces:**
- Produces:
  - `PERMANENT_SKILLS: { id: string; name: string; desc: string; tag: 'dps'|'tank'|'idle' }[]`（3 个）
  - `SKILL_POOL` 从 `getGameplayConfig().skillPool` 读取（≥8 个，defId 与 gameplay.json 对齐）
  - `slotCount(level: number): number`（读配置 slots 表，默认 1/5/10/20/30/50 → 1/2/3/4/5/6）
  - `isUnlocked(level: number, slotIndex: number): boolean`

- [ ] **Step 1: 写失败测试**（等级 1/4/5/9/10/50 的槽位数；3 个永久技能存在）
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现 SkillDefs.ts**
- [ ] **Step 4: 跑测试确认通过**
- [ ] **Step 5: Commit** `feat(skills): defs and slots`

---

### Task 4: 挂机与离线结算

**Files:**
- Create: `assets/scripts/framework/idle/Idle.ts`
- Test: `tests/mvp-core.test.ts`

**Interfaces:**
- Produces:
  - `type IdleMode = 'safe' | 'adventure'`
  - `idleRates(mode: IdleMode, eclipse: boolean): { coinsPerMin: number; shardsPerMin: number; trialChancePerMin: number }`
  - `eclipseActive(nowMs: number): boolean`（每日 20:00–21:00，本地时区）
  - `offlineReport(save: SaveData, nowMs: number): { seconds: number; cappedSeconds: number; capped: boolean; coins: number; shards: number; trials: number; eclipse: boolean }`

规则全部读 `getGameplayConfig().idle`（离线上限、安全/冒险速率、日蚀时段与倍率）；默认 8h、日蚀 ×2、试炼 ×1.5。**lastSeenAt===0 视为首次启动，不结算离线**（Task 1 报告的边界）。

- [ ] **Step 1: 写失败测试**

```ts
test('offline caps at 8 hours', () => {
  const save = { ...baseSave, idleMode: 'adventure', lastSeenAt: 0 } as any;
  const r = offlineReport(save, 20 * 3600 * 1000);
  assert.equal(r.capped, true);
  assert.equal(r.cappedSeconds, 8 * 3600);
});

test('safe mode never triggers trials', () => {
  const r = offlineReport({ ...baseSave, idleMode: 'safe', lastSeenAt: 0 } as any, 3600 * 1000);
  assert.equal(r.trials, 0);
});
```

- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现 Idle.ts**
- [ ] **Step 4: 跑测试确认通过**
- [ ] **Step 5: Commit** `feat(idle): offline simulation`

---

### Task 5: 试炼结算（保护/保底/蚀化）

**Files:**
- Create: `assets/scripts/framework/trial/Trial.ts`
- Test: `tests/mvp-core.test.ts`

**Interfaces:**
- Consumes: `SaveData`、`SkillDefs`
- Produces:
  - `interface TrialOutcome { win: boolean; offers: { defId: string; quality: string }[]; corrodedSkillId: string | null; pityConsumed: boolean }`
  - `resolveTrial(save: SaveData, rng: () => number): TrialOutcome`
  - `applyTrialWin(save, choice: { type: 'replace'; skillDefId: string } | { type: 'abandon' }, rng): void`
  - `applyTrialFail(save): { corrodedSkillId: string | null }`

规则读 `getGameplayConfig().trial`（firstN/pityFails/protectMax）；默认前 3 次保护、3 连败保底、保护最多 2 个。

- [ ] **Step 1: 写失败测试**（前 3 次必成功；3 连败后必成功；保护中的技能不蚀化；槽满替换/放弃）
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现 Trial.ts**
- [ ] **Step 4: 跑测试确认通过**
- [ ] **Step 5: Commit** `feat(trial): outcome, pity, corrosion`

---

### Task 6: 技能管理（保护/净化/洗点）

**Files:**
- Create: `assets/scripts/framework/skills/SkillState.ts`
- Test: `tests/mvp-core.test.ts`

**Interfaces:**
- Produces:
  - `canProtect(save, skillId): boolean`（≤2 个）
  - `toggleProtect(save, skillId): { ok: boolean; reason?: string }`
  - `purifyCost(skill): { shards: number }`（读配置 trial.purifyShards）
  - `purify(save, skillId): { ok: boolean; reason?: string }`（资源不足拒绝）
  - `respec(save, attrs, level): { ok: boolean; cost: number; reason?: string }`（freeUntil 10）

- [ ] **Step 1: 写失败测试**（保护上限、净化扣资源、洗点 10 级前免费、10 级后扣金币）
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现 SkillState.ts**
- [ ] **Step 4: 跑测试确认通过**
- [ ] **Step 5: Commit** `feat(skills): protect, purify, respec`

---

### Task 7: 开局页 Onboarding

**Files:**
- Create: `assets/scripts/pages/Onboarding.ts`
- Modify: `assets/scripts/framework/App.ts`（注册 + 新档入口）
- Test: 手动验收（构建 + 截图）

**Interfaces:**
- Consumes: `PERMANENT_SKILLS`、`validateAttributes`、`saveData/flushSave`、`PageCtx`
- Produces: `buildOnboarding(ctx: PageCtx)`

UI：三选一卡（选中描边）→ 确认 → 六维 +/-（剩余点数、单项上限 24）→ 确认进入 home；点数未分配完禁用确认。

- [ ] **Step 1: 注册页面与调试入口 `?page=onboarding`**
- [ ] **Step 2: 三选一交互 + 写入 save.permanentSkill**
- [ ] **Step 3: 属性分配 + 校验 + 写入 save.attributes**
- [ ] **Step 4: `tsc` + 构建 + 截图**
- [ ] **Step 5: Commit** `feat(ui): onboarding`

---

### Task 8: 主城挂机页 + 离线报告 + 蚀化警告

**Files:**
- Create: `assets/scripts/pages/Home.ts`
- Modify: `assets/scripts/framework/App.ts`
- Test: 手动验收（构建 + 截图）

**Interfaces:**
- Consumes: `idleRates`、`offlineReport`、`eclipseActive`、`saveData/flushSave`
- Produces: `buildHome(ctx: PageCtx)`

UI：挂机模式切换（安全/冒险，冒险二次确认）、开始/停止、离线报告弹窗（时长/资源/试炼/蚀化/保底，一键领取）、日蚀倒计时、蚀化警告条（有则置顶，点击跳 skills）、主线/竞技/任务入口占位。

- [ ] **Step 1: 挂机模式与开始/停止（计时器更新收益预览）**
- [ ] **Step 2: 离线报告（进入页面时结算并弹窗）**
- [ ] **Step 3: 蚀化警告条 + 日蚀倒计时**
- [ ] **Step 4: `tsc` + 构建 + 截图**
- [ ] **Step 5: Commit** `feat(ui): home idle and offline report`

---

### Task 9: 试炼流程与三选一页

**Files:**
- Create: `assets/scripts/pages/TrialChoose.ts`
- Modify: `assets/scripts/pages/Battle.ts`（试炼模式接入）、`assets/scripts/framework/App.ts`
- Test: 手动验收（构建 + 截图）

**Interfaces:**
- Consumes: `resolveTrial`、`applyTrialWin`、`applyTrialFail`
- Produces: `buildTrialChoose(ctx: PageCtx)`

流程：Home「试炼」→ 进入 Battle（State.trialActive=true，生成试炼敌人）→ 胜利：`go('trial-choose')` 三选一（替换/放弃）；失败：`applyTrialFail` → toast 蚀化 → 回 home（蚀化警告条出现）。

- [ ] **Step 1: Battle 增加试炼模式（State.trialActive + 胜负跳转）**
- [ ] **Step 2: 三选一页（3 张卡、替换/放弃按钮、槽位校验）**
- [ ] **Step 3: 失败蚀化提示与回流**
- [ ] **Step 4: `tsc` + 构建 + 截图（胜利/失败各一张）**
- [ ] **Step 5: Commit** `feat(trial): battle flow and choose page`

---

### Task 10: 技能页

**Files:**
- Create: `assets/scripts/pages/Skills.ts`
- Modify: `assets/scripts/framework/App.ts`
- Test: 手动验收（构建 + 截图）

**Interfaces:**
- Consumes: `slotCount`、`toggleProtect`、`purify`、`respec`
- Produces: `buildSkills(ctx: PageCtx)`

UI：永久槽 + 非永久槽列表（锁定槽显示解锁等级）、技能详情、保护开关、净化（消耗碎片）、洗点（费用/免费提示）、蓝图入口占位。

- [ ] **Step 1: 槽位列表与锁定态**
- [ ] **Step 2: 保护/净化/洗点交互 + 存档**
- [ ] **Step 3: `tsc` + 构建 + 截图**
- [ ] **Step 4: Commit** `feat(ui): skills page`

---

### Task 11: 全量验收

**Files:**
- Modify: `assets/scripts/framework/App.ts`（导航入口）
- Test: 手动验收 + 截图

- [ ] **Step 1: 底部导航改为 5 Tab（主城/技能/宠物/蓝图/商城），任务入口挂主城**
- [ ] **Step 2: 新档全流程走查：onboarding → home → 离线报告 → 试炼胜利 → 三选一 → skills → 洗点/净化 → home**
- [ ] **Step 3: 失败路径走查：冒险挂机 → 试炼失败 → 蚀化警告条 → 净化**
- [ ] **Step 4: 重启验证存档持久化**
- [ ] **Step 5: `tsc` + 全部测试 + 构建 + 截图，更新验收报告**
- [ ] **Step 6: Commit** `feat: mvp m1 vertical slice`

---

## 后续计划（不在本计划内）

- M2：宠物（收留/训练/功能型羁绊）+ NPC 导师 + 简化镜像切磋 + 第一幕主线。
- M3：个人受限蓝图（已有 `2026-10-19-skill-crafting-core.md`，对应 P0-13）。
- M4：P1 真人社交、公开工坊、测试场、塔、世界 Boss、赛季。

## Self-Review

- Spec 覆盖：P0-1..P0-9、P0-17、P0-18 均有任务；P0-10..P0-14 明确划入 M2/M3。
- 类型一致：`SaveData` 新字段在 Task 1 定义，Task 4/5/6 消费；`OwnedSkill` 贯穿 Task 1/5/6。
- Review Focus 六条均有测试：离线边界（Task 4）、保底（Task 5）、保护位（Task 5/6）、槽位边界（Task 3/10）、旧档迁移（Task 1）。
- 每个任务独立可测；UI 任务以构建 + 截图验收。





