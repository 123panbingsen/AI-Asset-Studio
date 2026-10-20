# sprite-gen 学习与接入报告

日期：2026-10-18
仓库：https://github.com/aldegad/sprite-gen （Apache-2.0，2.8k star）

## 安装状态

| 项 | 路径 / 状态 |
|---|---|
| 源码 | `tools/third_party/sprite-gen`（shallow clone） |
| Python 环境 | `C:\Users\Administrator\.venvs\spritegen`（Python 3.14.4 + Pillow 12.3 + NumPy 2.5.4） |
| CLI | `sprite-gen.exe`（`pip install -e .` 可编辑安装，版本 2.44.0） |
| Agent Skill | 已安装到 `C:\Users\Administrator\.agents\skills\sprite-gen`，技能目录已识别 `sprite-gen` |

## 能力地图（已验证）

- `recolor-palette` / `recolor`：从一张 sheet 抽取调色板，按 spec 确定性烘焙多套色板（保留 alpha 与明暗）
- `prepare` / `gen-set` / `extract` / `compose-atlas`：一行行生成动作状态 → 透明帧 → 运行时 atlas + `manifest.json.frame_layout`
- `slice-sheet`：多格 sheet → 逐格站立切图（支持 `--chroma-key none`、baseline、target-height）
- `cutout`：白/象牙/品红/绿背景 → 干净透明 PNG
- `ui-kit`：按固定 UI kit 版式切出九宫格面板/按钮/血条/槽位/摇杆
- `unpack-atlas`、`export-aseprite`、`export-pngs`、`compose-layers`、`background-tile`、`shadow`、`inspect-motion`、`scene-render`
- 生成：`gen`（codex/grok/openai）、`video*`（Grok Imagine）、`pixel-draw`（Claude 订阅）

## 已跑的 demo

1. **调色板烘焙**：对 `spriteatlas-walk.png` 抽 16 色 → 生成 `guanyu / zhaoyun / zhangfei` 三套色板变体
   - 产物：`docs/art/walk-variants/`
   - 预览：`docs/art/recolor-variants-preview.png`
2. **角色生成 run**：`sprite-gen prepare --out-dir runs/guanyu --character-id guanyu --base-image <chibi idle 帧>`
   - 产出 `idle/attack/jump/wave` 四份 prompt + layout guide + `sprite-request.json`

## 阻塞：生成需要凭据

`sprite-gen workflow --kind sprite` 检查结果：

| provider | 状态 |
|---|---|
| codex（ChatGPT 订阅） | **未登录**（`codex login status` 失败） |
| grok | 未安装/无凭据 |
| openai | 无 `OPENAI_API_KEY` |

因此 `gen / gen-set / video*` 目前无法运行；所有**后处理工具**可正常使用。

## 解锁生成的三条路

1. `codex login`（用 ChatGPT 订阅，推荐，无需 API 费用）
2. 提供 `OPENAI_API_KEY`（按调用计费）
3. 安装并登录 grok（`XAI_API_KEY`）

登录后即可走完整流程：`prepare → gen-set → extract → compose-atlas`，产出带 `manifest.json.frame_layout` 的透明 atlas，直接接 Cocos。
