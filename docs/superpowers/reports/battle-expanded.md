# 战斗扩展报告（任务 1–3）

日期：2026-10-18
范围：数据驱动战斗、多敌人/波次/3 技能、伤害飘字与受击反馈、星级结算与失败重试

## 1. 多敌人 + 波次 + 3 技能

**BattleCore**
- `SkillRuntime { id, name, cd, mult, range, cdLeft }`，技能独立冷却
- `createBattleWaves(player, waves, skills)`：波次队列，清空当前波自动刷下一波
- 敌人支持 `range` / `attackCd`（来自 `enemies.json`）
- 输入 `skill?: number` 指定技能索引

**数据源**
- `resources/data/skills.json`：青龙斩/拖刀计/武圣附体
- `resources/data/enemies.json`：黄巾力士/弓手/头目
- `resources/data/stages.json`：每关 `waves` 配置

**测试（9 条战斗用例）**
- 多敌人只打最近
- 技能范围内命中、范围外不伤害
- 技能独立 CD
- 波次推进、最后一波清空才判胜

## 2. 伤害飘字 + 受击闪白

`BattleView.update` 每帧对比前后 HP：
- 敌人掉血 → 在其头顶生成金色数字，上飘 64px + 0.6s 淡出后销毁
- 玩家掉血 → 红色数字
- 敌人未死亡时受击 → `scale 1 → 1.25 → 1` 的 0.2s 闪动

## 3. 星级结算 + 失败重试

- 胜利星级按剩余血量：`≥60% → 3★`，`≥30% → 2★`，否则 `1★`
- `Settle` 支持传入 `starCount`，按数量显示 `★★★`
- 失败弹窗「重新挑战」回调 `ctx.go('battle')`，直接重开战斗；胜利则返回大厅

## 验证

| 项 | 结果 |
|---|---|
| `tsc -p tsconfig.check.json` | 0 错误 |
| 逻辑测试 | **30 pass / 0 fail** |
| Web 构建 | exit 36 |
| 战斗截图 | `reports/battle-expanded.png`（2 敌人 + 3 技能 + 关卡名） |
| 伤害飘字 | 代码完成；因持续 0.6s，静态截图未捕获，建议预览时确认 |
| 星级/重试 | 代码完成；需实际打赢/打输一次确认 |

## 已知问题

- 角色与敌人无碰撞体积，会重叠站位（后续可加简单推挤）
- 敌人血条在重叠时会互相覆盖
- 伤害飘字位置基于敌人节点，未做屏幕边界限制
