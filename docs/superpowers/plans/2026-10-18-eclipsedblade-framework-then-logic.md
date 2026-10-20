# EclipsedBlade 框架 + 玩法 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先在 Cocos 3.8.8 项目 `EclipsedBlade` 上把 10 屏 UI 框架做成**素材皮肤驱动、可换肤、可导航**的完整框架；再在其上实现动作战斗与关卡/存档逻辑，形成可玩垂直切片。

**Architecture:** 单场景 `Main.scene`（Canvas + Camera + App 组件），UI 运行时构建；`framework/` 提供皮肤、主题、数据、存档与纯逻辑模块；`pages/` 提供 10 个页面；纯逻辑（战斗/进度/背包/存档）不 import `cc`，用 Node 测试；UI 层只做绑定与渲染。

**Tech Stack:** Cocos Creator 3.8.8（TypeScript）、Node（测试运行器 + Cocos 自带 tsc）、Python（素材切图/校验）。

**Spec:** 用户需求（本计划即规格）：先完成框架，再写逻辑；竖屏 750×1334；必须使用 `Desktop\素材`；样式后期需可改（manifest 换肤）。

## Global Constraints

- 设计分辨率固定 **750×1334 竖屏**（fitHeight）。
- UI 所有面板/按钮/槽位必须走 `Skin` key；缺 key 或纹理失败时回退 Graphics，不报错。
- 纯逻辑模块 **禁止 import `cc`**（否则无法跑 Node 测试）。
- 不新增外部下载；素材仅来自 `C:\Users\Administrator\Desktop\素材`。
- 每个任务完成前必须给出**当次运行证据**（tsc 输出 / 测试输出 / 预览清单 + 编辑器日志）。
- 手工改 `.scene/.meta` 必须在 Cocos Creator 关闭时进行；改完必须验证 JSON 与 uuid 一致。
- 提交信息格式：`feat(scope): ...` / `test(scope): ...`。

## Review Focus

- 皮肤缺 key / 纹理 404 → 必须回退 Graphics，不能黑屏或抛错。
- 存档 JSON 损坏 / 版本不符 → 必须重置并提示，不能崩溃。
- 战斗边界：0 敌人、同帧多次伤害、敌人死亡后仍被攻击、玩家死亡后仍可操作。
- 多指触控：摇杆与技能按钮同时按下不串。
- 手写场景/meta 与编辑器缓存冲突（此前已两次踩坑）。
- 换肤后布局不塌（9-slice 边框小于尺寸、insets 覆盖）。

---

## Phase A：完成框架

### Task A1: 基线验证（预览可用性证据）

**Files:**
- Read: `assets/scene/Main.scene`、`assets/scripts/framework/App.ts`
- Output: `docs/superpowers/reports/baseline.md`

**Interfaces:**
- Consumes: 当前 `Main.scene`（Canvas + Camera + App 组件）、`Skin.load('darkgold')`。
- Produces: 基线报告（含日志证据），供后续任务回归对比。

- [ ] **Step 1: 静态一致性检查**

Run:
```powershell
python - <<'PY'
import json
d=json.load(open(r'C:\Users\Administrator\EclipsedBlade\assets\scene\Main.scene',encoding='utf-8'))
cam=[o for o in d if o.get('__type__')=='cc.Node' and o.get('_name')=='Camera']
print('camera_active=', cam[0].get('_active'))
comp=[o for o in d if isinstance(o.get('__type__'),str) and not o['__type__'].startswith('cc.')]
print('custom_comp=', [c['__type__'] for c in comp])
PY
```
Expected: `camera_active= True`，`custom_comp= ['aa623sZYY1FibewZggXYRu0']`。

- [ ] **Step 2: 类型检查**

Run:
```powershell
node "C:\ProgramData\cocos\editors\Creator\3.8.8\resources\app.asar.unpacked\node_modules\typescript\lib\tsc.js" -p tsconfig.check.json
```
Expected: exit 0，无输出。

- [ ] **Step 3: 编辑器预览证据**

打开 `Main.scene` → 预览；记录：
- 主城出现背景/金环/槽位/出征按钮；
- 组件库 → 皮肤自检 → 8 key 三档；
- 组件库 → 换肤 → 金红切换；
- `temp/logs/project.log` 无 `MissingScript` / `PromiseRejectionEvent` / `无法查到当前场景 JSON`。

把截图路径或日志摘录写入 `docs/superpowers/reports/baseline.md`。

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/reports/baseline.md
git commit -m "docs(baseline): record verified preview baseline"
```

### Task A2: 公共组件与皮肤覆盖（框架层）

**Files:**
- Create: `assets/scripts/framework/components.ts`
- Modify: `assets/scripts/framework/App.ts`、`assets/scripts/pages/*.ts`
- Test: 无（视觉层，用 A5 的预览清单验收）

**Interfaces:**
- Consumes: `Skin.sprite/applyTo`、`UI.panel/btn/applySkin/txt`。
- Produces:
  - `topBar(): Node`
  - `tabBar(defs: TabDef[], onSelect: (id: string) => void): Node`
  - `itemSlot(w: number, h: number, key = 'slot'): Node`
  - `progressBar(w, h, ratio, color): Node`
  - `sectionTitle(text: string): Node`

- [ ] **Step 1: 抽公共组件**（App 顶栏/底栏迁出；`components.ts` 不 import pages）
- [ ] **Step 2: 全部页面改用公共组件与皮肤 key**：
  - HeroList / HeroDetail / Bag / Shop / Quest / Battle / Settle / Settings：`panel(...,'panel'/'panel_dark')`、按钮显式传 `skin`
- [ ] **Step 3: 清理**：`grep -rn "rect('panel'" assets/scripts/pages` 应为 0（统一走 panel()）
- [ ] **Step 4: 类型检查** → exit 0
- [ ] **Step 5: Commit** `feat(ui): extract common components and apply skin keys`

### Task A3: 十屏皮肤验收 + 换肤/回退验证

**Files:**
- Modify（按需）: `assets/scripts/pages/*.ts`、`assets/resources/skin/*/manifest.json`
- Output: `docs/superpowers/reports/skin-audit.md`

- [ ] **Step 1: 逐屏预览**：Lobby / HeroList / HeroDetail / Bag / Shop / Quest / Battle / Settle / Settings / Kit，记录每屏使用的 key
- [ ] **Step 2: 回退验证**：临时把 `manifest.json` 某 key 改名为不存在（编辑器外改），预览应回退纯色且无报错；改回
- [ ] **Step 3: 9-slice 边界检查**：`panel` 三档尺寸无流苏重复；`slot` 金边不变形
- [ ] **Step 4: 写 `skin-audit.md`（含问题清单与修复）**
- [ ] **Step 5: Commit** `docs(skin): audit all ten screens`

### Task A4: 数据配置骨架（TDD）

**Files:**
- Create: `assets/resources/data/heroes.json`、`skills.json`、`enemies.json`、`stages.json`
- Create: `assets/scripts/framework/Config.ts`、`tests/config.test.ts`、`tsconfig.tests.json`
- Modify: `GameData.ts` 改为从 Config 读，缺配置时用内置默认

**Interfaces:**
- Produces:
  - `Config.load(json: RawConfigs): ConfigData`（纯函数，便于测试）
  - `Config.get(): ConfigData`
  - 类型：`HeroCfg / SkillCfg / EnemyCfg / StageCfg`

- [ ] **Step 1: 建测试工程**

`tsconfig.tests.json`：
```json
{
  "compilerOptions": {
    "target": "ES2019",
    "module": "commonjs",
    "strict": true,
    "outDir": ".test-dist",
    "rootDir": ".",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["assets/scripts/framework/Config.ts", "assets/scripts/framework/Save.ts", "assets/scripts/framework/Progress.ts", "assets/scripts/framework/Inventory.ts", "assets/scripts/framework/battle/BattleCore.ts", "tests/**/*.ts"]
}
```

Run: `node "C:\ProgramData\cocos\editors\Creator\3.8.8\resources\app.asar.unpacked\node_modules\typescript\lib\tsc.js" -p tsconfig.tests.json`
Expected: 编译通过（尚无测试文件时可空跑）。

- [ ] **Step 2: 写失败测试** `tests/config.test.ts`

```ts
import { normalizeConfig } from '../assets/scripts/framework/Config';

test('missing heroes falls back to empty array', () => {
  const c = normalizeConfig({ skills: [], enemies: [], stages: [] } as any);
  expect(c.heroes).toEqual([]);
});

test('skill without cd gets default 6', () => {
  const c = normalizeConfig({ heroes: [], enemies: [], stages: [], skills: [{ id: 's', name: 'n', damage: 10 }] } as any);
  expect(c.skills[0].cd).toBe(6);
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `node "…/tsc.js" -p tsconfig.tests.json && node --test .test-dist/tests/config.test.js`
Expected: FAIL（`normalizeConfig is not a function`）。

- [ ] **Step 4: 实现 `normalizeConfig`**（默认值 + 类型校验 + 忽略非法项）
- [ ] **Step 5: 跑测试通过**；`tsc -p tsconfig.check.json` 仍 0
- [ ] **Step 6: Commit** `feat(config): normalized data configs with defaults`

### Task A5: 框架验收（十屏 + 换肤 + 回退）

Run 预览清单（同 A3），并确认 `tsc.check` 与 `tests` 全绿；写入 `docs/superpowers/reports/framework-done.md`。

---

## Phase B：写逻辑

### Task B1: 存档（TDD）

**Files:**
- Create: `assets/scripts/framework/Save.ts`、`tests/save.test.ts`
- Modify: `App.ts` 启动读取

**Interfaces:**
```ts
export interface StorageLike { read(k: string): string | null; write(k: string, v: string): void; }
export interface SaveData { v: number; coins: number; gems: number; tickets: number; heroLevels: Record<string, number>; cleared: string[]; updatedAt: number; }
export function createSave(storage: StorageLike, now?: () => number): SaveStore
// SaveStore: get(), update(fn), flush(), reset()
```

- [ ] Step 1 失败测试：默认存档、roundtrip、损坏 JSON → 重置、v0→v1 迁移
- [ ] Step 2 跑失败
- [ ] Step 3 实现（纯函数 + 注入存储，不 import cc）
- [ ] Step 4 跑通过
- [ ] Step 5 App 接 `sys.localStorage` 适配器
- [ ] Step 6 Commit `feat(save): persistent save store with migration`

### Task B2: 战斗核心（TDD）

**Files:**
- Create: `assets/scripts/framework/battle/BattleCore.ts`、`tests/battle.test.ts`

**Interfaces:**
```ts
export interface Actor { id: string; hp: number; maxHp: number; atk: number; speed: number; x: number; y: number; cd: number; }
export function step(state: BattleState, dt: number, input: { moveX: number; moveY: number; attack?: boolean; skill?: boolean }): BattleState
export function checkResult(state: BattleState): 'win' | 'lose' | 'running'
```

- [ ] Step 1 失败测试：移动 clamp、普攻 CD、伤害扣血、敌人死亡→win、玩家死亡→lose、已结束状态不再推进
- [ ] Step 2 跑失败
- [ ] Step 3 实现最小逻辑
- [ ] Step 4 跑通过
- [ ] Step 5 Commit `feat(battle): deterministic battle core`

### Task B3: 战斗 UI 绑定（视觉层）

**Files:**
- Modify: `assets/scripts/pages/Battle.ts`
- Read: `BattleCore` 接口

- [ ] Step 1 摇杆：touch 事件 → 方向向量（锁 touchId）
- [ ] Step 2 每帧 `core.step(dt, input)` → 更新玩家/敌人节点、血条、伤害飘字
- [ ] Step 3 技能按钮 CD 遮罩；普攻按钮
- [ ] Step 4 胜负 → `Settle` 弹窗
- [ ] Step 5 类型检查 + 预览证据
- [ ] Step 6 Commit `feat(battle-ui): joystick, attack, skills bound to core`

### Task B4: 进度与结算（TDD）

**Files:**
- Create: `assets/scripts/framework/Progress.ts`、`assets/scripts/pages/StageSelect.ts`、`tests/progress.test.ts`
- Modify: `Settle.ts` 奖励入账

- [ ] Step 1 失败测试：首关可打、通关解锁下一关、未通关不可选、奖励只发一次
- [ ] Step 2 跑失败
- [ ] Step 3 实现
- [ ] Step 4 跑通过
- [ ] Step 5 StageSelect 页面 + Settle 写存档
- [ ] Step 6 Commit `feat(progress): stage unlock and rewards`

### Task B5: 背包/商店/任务/武将接存档（TDD）

**Files:**
- Create: `assets/scripts/framework/Inventory.ts`、`tests/inventory.test.ts`
- Modify: `Bag.ts`、`Shop.ts`、`Quest.ts`、`HeroDetail.ts`

- [ ] Step 1 失败测试：购买扣费、余额不足拒绝、升级扣费与上限、任务领取幂等
- [ ] Step 2 跑失败
- [ ] Step 3 实现
- [ ] Step 4 跑通过
- [ ] Step 5 页面接 Inventory
- [ ] Step 6 Commit `feat(inventory): purchase/upgrade/claim rules`

### Task B6: 最终验证

- [ ] `tsc -p tsconfig.check.json` → 0
- [ ] `tsc -p tsconfig.tests.json && node --test .test-dist/tests` → 全绿
- [ ] 预览闭环：主城→选关→战斗→结算→回主城，重启后金币/进度保留
- [ ] 换肤切换 + 回退
- [ ] 写 `docs/superpowers/reports/logic-done.md`

---

## 执行方式

- Phase A（A1–A5）：**Lead 顺序执行**；A1 需要一次预览证据（用户操作编辑器）。
- Phase B：**subagent-driven-development**：B1/B2/B4/B5 纯逻辑可并行（互不重叠），B3 依赖 B2；每个任务一个新 subagent + 独立验证。
- 每次手工改场景/meta 前必须确认 Creator 已关闭。

## 测试命令汇总

```powershell
# 类型检查（全量）
node "C:\ProgramData\cocos\editors\Creator\3.8.8\resources\app.asar.unpacked\node_modules\typescript\lib\tsc.js" -p tsconfig.check.json

# 纯逻辑测试
node "C:\ProgramData\cocos\editors\Creator\3.8.8\resources\app.asar.unpacked\node_modules\typescript\lib\tsc.js" -p tsconfig.tests.json
node --test .test-dist/tests
```
