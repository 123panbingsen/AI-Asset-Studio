# 技能工坊核心（Skill Crafting Core）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让玩家能在游戏内创建、校验、预览并保存一个自定义技能蓝图（草稿），为后续测试场/融合/分享打地基。

**Architecture:** 纯逻辑（Blueprint 模型、预算、校验、预览公式）放在 `framework/blueprint/`，不依赖 cc，用 node --test 覆盖；UI 只做展示与交互，写入现有 SaveData 并沿用存档迁移机制。

**Tech Stack:** Cocos Creator 3.8.8、TypeScript（ES2015 lib）、node --test、现有 UI/Save 框架。

**Spec:** 用户 2026-10-19 的「玩家技能开发子系统」15 条设计（本计划只实现第一块：工具层 1/2 与资源循环 0 的地基）。

## Global Constraints

- 设计分辨率 750×1334；正文 ≥24，按钮触控 ≥88。
- 逻辑模块不得 `import 'cc'`；UI 层才允许。
- 存档 key 仍为 `eb.save.v1`，字段只增不改；旧档必须有默认值迁移。
- 预算上限硬约束，不允许 UI 绕过；超预算蓝图禁止保存为正式版。
- 数值公式必须确定性（同输入同输出），预览与战斗共用同一份公式。
- 所有新逻辑函数配 node --test 用例；测试命令：
  `tsc -p tsconfig.tests.json` + `node --test .test-dist/tests/*.test.js`。

## Review Focus

- 超预算 / 负数词条 / 未知模板或词条 id：必须拒绝并给出可读原因，不能崩溃。
- 重复词条：同 id 多次出现应合并层数或拒绝，不能重复计价。
- 旧存档（无 blueprints/fragments 字段）：加载后要有默认空结构，不能丢档。
- 冷却为 0 或负：按最小值 1s 处理，预览不能除零。
- 标签互斥（如「离线收益」与「竞技」）：保存时拒绝并提示。

---

## 文件结构

- `assets/scripts/framework/blueprint/Types.ts` —— 蓝图/词条/触发器的类型与常量。
- `assets/scripts/framework/blueprint/Budget.ts` —— 预算计算与校验。
- `assets/scripts/framework/blueprint/Preview.ts` —— DPS/蚀值/触发频率/试炼胜率影响的确定性公式。
- `assets/scripts/framework/blueprint/Store.ts` —— 草稿创建、查询、状态流转（纯逻辑）。
- `assets/scripts/framework/Save.ts` —— 增加 `blueprints`、`fragments` 字段与默认值。
- `assets/scripts/pages/SkillLab.ts` —— 工坊页 UI。
- `assets/scripts/framework/App.ts` —— 注册 `skilllab` 页面与入口。
- `tests/blueprint.test.ts`、`tests/blueprint-save.test.ts`。

---

### Task 1: 蓝图类型与词条常量

**Files:**
- Create: `assets/scripts/framework/blueprint/Types.ts`
- Test: `tests/blueprint.test.ts`

**Interfaces:**
- Produces:
  - `type BlueprintState = 'draft' | 'testing' | 'live'`
  - `type TriggerId = 'onHit' | 'onCrit' | 'onKill' | 'interval' | 'onLowHp'`
  - `interface EffectTerm { id: string; stacks: number }`
  - `interface BlueprintInput { name: string; templateId: string; trigger: TriggerId; effects: EffectTerm[]; cooldown: number; tags: string[] }`
  - `interface SkillBlueprint extends BlueprintInput { id: string; state: BlueprintState; updatedAt: number }`
  - `TEMPLATES: { id: string; name: string; baseCost: number; tags: string[] }[]`
  - `EFFECTS: { id: string; name: string; costPerStack: number; rare?: boolean }[]`
  - `BUDGET_CAP = 10`

- [ ] **Step 1: 写失败测试**

```ts
test('templates and effects expose stable ids', () => {
  assert.ok(TEMPLATES.some((t) => t.id === 'slash'));
  assert.ok(EFFECTS.some((e) => e.id === 'burn'));
  assert.equal(BUDGET_CAP, 10);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node .test-dist/tests/blueprint.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 Types.ts（常量 + 类型）**

模板至少：`slash`（斩击）、`thrust`（突刺）、`aoe`（横扫）、`buff`（增益）。
词条至少：`burn`（灼烧）、`corrode`（蚀化）、`lifesteal`（吸血）、`haste`（急速）、`execute`（斩杀）、`shield`（护盾）。
`rare: true` 的词条成本 ×1.5（在 Budget 中实现）。

- [ ] **Step 4: 跑测试确认通过**
- [ ] **Step 5: Commit** `feat(blueprint): types and word constants`

---

### Task 2: 预算计算

**Files:**
- Create: `assets/scripts/framework/blueprint/Budget.ts`
- Test: `tests/blueprint.test.ts`

**Interfaces:**
- Consumes: Task 1 的类型与 `TEMPLATES/EFFECTS/BUDGET_CAP`
- Produces:
  - `interface BudgetResult { ok: boolean; spent: number; cap: number; over: number; reasons: string[] }`
  - `computeBudget(input: BlueprintInput): BudgetResult`

规则：
- 基础 = 模板 baseCost。
- 每个词条 = costPerStack × stacks；stacks 合并同 id。
- rare 词条成本 ×1.5，向下取整。
- 上限 = `BUDGET_CAP`（后续图鉴加成再加，本计划不做）。
- 未知模板/词条：`ok: false`，reason 写明 id。

- [ ] **Step 1: 写失败测试**

```ts
test('budget sums template and effects', () => {
  const r = computeBudget({ name: 't', templateId: 'slash', trigger: 'onHit', effects: [{ id: 'burn', stacks: 2 }], cooldown: 3, tags: [] });
  assert.equal(r.spent, 3 + 2 * 2);
  assert.equal(r.ok, r.spent <= r.cap);
});

test('unknown effect id is rejected with reason', () => {
  const r = computeBudget({ name: 't', templateId: 'slash', trigger: 'onHit', effects: [{ id: 'nope', stacks: 1 }], cooldown: 3, tags: [] });
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('nope')));
});
```

- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现 computeBudget**（注意 stacks 合并与负数/0 处理：stacks ≤0 不参与计价，reason 提示）
- [ ] **Step 4: 跑测试确认通过**
- [ ] **Step 5: Commit** `feat(blueprint): budget computation`

---

### Task 3: 校验（标签/冷却/数量上限）

**Files:**
- Modify: `assets/scripts/framework/blueprint/Budget.ts`
- Test: `tests/blueprint.test.ts`

**Interfaces:**
- Produces: `validateBlueprint(input: BlueprintInput): { ok: boolean; errors: string[] }`

规则：
- cooldown 限制在 1–30 秒，越界报错。
- 词条种类 ≤5，总层数 ≤12。
- 标签互斥：`offline` 与 `arena` 不可同时出现。
- 名称为空或 >16 字报错。

- [ ] **Step 1: 写失败测试**（越界冷却、互斥标签、超词条数、空名称各一条）
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现 validateBlueprint**
- [ ] **Step 4: 跑测试确认通过**
- [ ] **Step 5: Commit** `feat(blueprint): validation rules`

---

### Task 4: 数值预览公式

**Files:**
- Create: `assets/scripts/framework/blueprint/Preview.ts`
- Test: `tests/blueprint.test.ts`

**Interfaces:**
- Consumes: Task 1/2
- Produces:
  - `interface PreviewNumbers { dps: number; corrosion: number; triggersPerMin: number; winRateDelta: number; budget: BudgetResult }`
  - `previewBlueprint(input: BlueprintInput): PreviewNumbers`

公式（确定性）：
- 基础伤害 = 模板 baseCost × 10。
- 每层灼烧 +6% 伤害；蚀化层数记入 corrosion；斩杀对低血 +15%。
- triggersPerMin = 60 / max(1, cooldown)。
- winRateDelta = clamp((dps/400 + corrosion/50 - 1) × 2, -20, 20)。

- [ ] **Step 1: 写失败测试**（相同输入两次结果一致；cooldown=0 不除零；包含 budget 结果）
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现 previewBlueprint**
- [ ] **Step 4: 跑测试确认通过**
- [ ] **Step 5: Commit** `feat(blueprint): preview numbers`

---

### Task 5: 存档扩展（blueprints / fragments）

**Files:**
- Modify: `assets/scripts/framework/Save.ts`
- Test: `tests/blueprint-save.test.ts`

**Interfaces:**
- Consumes: `SaveData`
- Produces: `SaveData.blueprints: SkillBlueprint[]`、`SaveData.fragments: Record<string, number>`，默认 `[]` / `{}`；旧档迁移补空值。

- [ ] **Step 1: 写失败测试**（无字段旧档加载后得到空数组；保存/读取往返）
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 在 Normalize/默认值中补字段**
- [ ] **Step 4: 跑测试确认通过**
- [ ] **Step 5: Commit** `feat(save): blueprint fields`

---

### Task 6: 工坊页 SkillLab

**Files:**
- Create: `assets/scripts/pages/SkillLab.ts`
- Modify: `assets/scripts/framework/App.ts`
- Test: 手动验收（构建 + 截图）

**Interfaces:**
- Consumes: 上述逻辑 API、`saveData/flushSave`、`PageCtx`
- Produces: `buildSkillLab(ctx: PageCtx)`

UI（竖屏 750×1334）：
- 顶部标题「技能工坊」+ 预算条（spent/cap，超预算变红）。
- 模板选择：4 个 chip。
- 触发选择：5 个 chip。
- 词条列表：6 个词条，每行 `- stacks +`，显示成本。
- 冷却：`- / +` 步进 1s。
- 预览卡：DPS / 蚀值 / 每分钟触发 / 胜率影响。
- 底部「保存草稿」：校验通过写入 `saveData().blueprints` 并 `flushSave()`，toast 提示；失败 toast 首条错误。
- 调试入口 `?page=skilllab`。

- [ ] **Step 1: 页面骨架（只读展示默认蓝图预览）**
- [ ] **Step 2: 交互（chips、加减、预算/预览联动）**
- [ ] **Step 3: 保存草稿 + 校验反馈**
- [ ] **Step 4: `tsc` + 构建 + 截图验收**
- [ ] **Step 5: Commit** `feat(ui): skill lab page`

---

### Task 7: 入口与全量验收

**Files:**
- Modify: `assets/scripts/framework/App.ts`（pages 注册 + 底栏或入口按钮）
- Modify: `assets/scripts/pages/Lobby.ts`（可选：工坊入口按钮）

- [ ] **Step 1: 注册 `skilllab` 页面与调试入口**
- [ ] **Step 2: 主城加入口按钮（不挤占现有布局）**
- [ ] **Step 3: `tsc` + 全部测试 + 构建 + 截图**
- [ ] **Step 4: Commit** `feat: skill lab entry`

---

## 后续计划（不在本计划内，单独排期）

- Plan B：词条碎片掉落 + 技能测试场（木桩/镜像敌人、每日次数、技能报告）
- Plan C：技能融合/变异（保底）、拆解、图鉴收藏加成
- Plan D：分享码/工坊审核/评级/赛季主题
- Plan E：竞技版合法性、PVP 独立池、风控与商业化

## Self-Review

- Spec 覆盖：本计划覆盖设计第 1 条（蓝图编辑器 2.0 的核心：模板/触发/效果/冷却/标签/预算/预览/三态草稿）与第 2 条的数据地基；其余 13 条明确列为后续计划。
- 类型一致：`BlueprintInput` 在 Task 1 定义，Task 2/3/4 复用；`BudgetResult` 在 Task 2 产出、Task 4 引用。
- Review Focus 的 5 条均已有对应测试任务：超预算（Task 2）、负数/未知 id（Task 2）、重复词条（Task 2 合并）、旧档（Task 5）、冷却边界（Task 3/4）。
- 比例：约 200 行计划对应约 400–500 行实现，任务粒度适中。
