# EclipsedBlade · 完整 UI 框架

Cocos Creator **3.8.8** + TypeScript，**运行时构建 UI**（不依赖手写 prefab/scene，避免版本兼容问题）。
设计分辨率：**750 × 1334 竖屏**（已写入 `settings/v2/packages/project.json`）。

## 一、怎么跑起来

1. 用 Cocos Creator 3.8.8 打开项目 `EclipsedBlade`（首次打开会自动导入新增素材）
2. 打开场景 `assets/scene/Main.scene`（已内置 Canvas + Camera + **App 组件**；旧的 mock 节点已隐藏）
3. 点预览即可
4. 进去后：顶栏「组件库」→「皮肤自检」，检查 8 个皮肤 key 的 9-slice 拉伸与 fallback

> 设计分辨率 750×1334 已写入 `settings/v2/packages/project.json`。

## 二、皮肤系统（P1）

- **切图脚本**：`tools/slice_skin.py`（已生成 199 张切图 + 各图集 `atlas-*.png` 拼版 + `index.json`）
- **8 个核心 key**（`assets/resources/skin/darkgold/manifest.json`）：

| key | 素材 | 9-slice |
|---|---|---|
| panel | p106 | ✓ |
| panel_dark | p107 | ✓ |
| btn_primary | p107（暖色 tint） | ✓ |
| btn_secondary | p118（冷色 tint） | ✓ |
| btn_icon | p016（圆技能钮） | 整图 |
| slot | slot.png（p118 衍生金边） | ✓ |
| frame_gold | p078（金环） | 整图 |
| scrim | backdrop/scrim@2x | 整图 |

- **运行时**：`framework/Skin.ts`（`load / has / sprite / applyTo`），缺 key 或纹理失败自动回退 Graphics
- **自检页**：`pages/SkinProof.ts`（每个 key 渲染 120×44 / 200×72 / 300×104 三档）
- **换肤方式**：新增 `assets/resources/skin/<set>/manifest.json` + 图片，`Skin.load('<set>')` 即可（P2 接入 UI）

## 三、页面与入口

| 入口 | 页面 | 功能 |
|---|---|---|
| 底部 Tab「主城」 | `pages/Lobby.ts` | 英雄展示、出征、快捷武将 |
| 底部 Tab「武将」 | `pages/HeroList.ts` | 8 武将卡片，点卡片进详情 |
| 武将卡片 | `pages/HeroDetail.ts` | 属性条、技能、升级 |
| 底部 Tab「背包」 | `pages/Bag.ts` | 物品网格，点开详情弹窗（使用/关闭） |
| 底部 Tab「商城」 | `pages/Shop.ts` | 商品卡、购买提示 |
| 底部 Tab「任务」 | `pages/Quest.ts` | 任务进度、领取 |
| 大厅「出征」 | `pages/Battle.ts` | 战斗 HUD：摇杆/技能/普攻/血条/小地图 |
| 战斗内「结算」 | `pages/Settle.ts` | 胜负结算弹窗（星级/奖励/返回） |
| 顶栏「设置」 | `pages/Settings.ts` | 设置弹窗（开关可点） |
| 顶栏「组件库」 | `pages/Kit.ts` | 按钮/页签/进度条/徽章/色板/面板 |

## 三、目录结构

```
assets/scripts/
├─ framework/
│  ├─ Theme.ts      颜色 / 字号 / 尺寸常量
│  ├─ UI.ts         建节点、文字、按钮、进度条、网格、异步图片
│  ├─ Types.ts      PageCtx（页面上下文：go / popup / close / toast）
│  ├─ EventBus.ts   事件总线
│  ├─ GameData.ts   模拟数据（玩家/武将/物品/商品/任务/技能）
│  ├─ State.ts      跨页面状态（当前选中武将）
│  └─ App.ts        主组件：顶栏 / 内容区 / 底部 Tab / 弹层 / Toast
├─ pages/           10 个页面
assets/resources/ui/
├─ bg.png / btn1.png / kuang.png / cardbtn.png / renwkuang.png / xiaokuang.png / tu1.png / tu2.png / radbtn.jpg
└─ backdrop/        aetherlab 背景装饰（暗角、卷轴、角饰、分隔线等）
```

## 四、扩展方式

- **换主题**：改 `framework/Theme.ts` 里的色值
- **改数据**：改 `framework/GameData.ts`
- **加页面**：
  1. 新建 `pages/Xxx.ts`，导出 `buildXxx(ctx: PageCtx)`
  2. 在 `App.ts` 的 `pages` 表里注册
  3. 需要 Tab 的话在 `buildTabs()` 的 `defs` 里加一项
- **弹窗**：`ctx.popup(panelNode)`，`ctx.close()` 关闭
- **提示**：`ctx.toast('文字')`
- **图片**：`img('ui/文件名', w, h)`（路径相对 `assets/resources`，不用写扩展名）

## 五、素材来源

- 项目自带 UI 图（bg/btn1/kuang/cardbtn/renwkuang/xiaokuang/tu1/tu2/radbtn）
- `Desktop/素材/aetherlab-backdrops` 的背景装饰
- `Desktop/素材` 里的三国古风/暗金水墨组件图鉴作参考（未切片导入）

## 六、说明

- 目前是**纯前端 UI 框架 + 模拟数据**，没有接战斗逻辑；`GameData` 换成真实配置即可。
- 文本使用系统字体（`Microsoft YaHei`），真机/小游戏如需一致字形，建议后续导入字体资源并替换 `UI.ts` 里的 `fontFamily`。
- 已用 Cocos 自带 TypeScript 做过类型检查（0 错误）。
