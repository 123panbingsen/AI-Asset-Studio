# Eclipsed Asset Studio

本地可视化游戏资产管线：**生成 → 抠图 → 超分 → 拆层 → 切图 → Atlas → Cocos 交付**。

- 生成后端：Mock（离线演示）/ 豆包 Seedream（火山方舟）/ 阿里云百炼 DashScope / OpenAI 兼容网关
- 桌面 GUI：Tkinter（无需浏览器），可打包为单文件 `AssetStudio.exe`
- 纯本地后处理：Pillow + numpy，不需要 GPU

## 快速开始（源码）

```powershell
$py = "C:\Users\Administrator\.venvs\asset_studio\Scripts\python.exe"
cd C:\Users\Administrator\EclipsedBlade\tools
& $py -m asset_studio                 # 打开 GUI
& $py -m asset_studio --selftest      # 不开 GUI，跑通整条管线
```

## 配置

GUI 右上角「设置」填写：

| 字段 | 说明 |
|---|---|
| provider | `mock` 离线演示；`doubao` 豆包 Seedream；`dashscope` 阿里云百炼；`openai` 任意 OpenAI 兼容网关 |
| 豆包 API Key / 模型 | 火山方舟 Key；当前可用模型 `doubao-seedream-4-0-20260415`（3.0 已下线、5.0 需开通），也可填接入点 ID `ep-...` |`r`n| DashScope API Key / 模型 | 默认模型 `wanx2.1-t2i-turbo`，也可填 `qwen-image` 等 |
| OpenAI base_url / Key / 模型 | 例如硅基流动 `https://api.siliconflow.cn/v1` + 对应模型名 |
| 输出目录 | 默认 `图片\AssetStudio` |

配置保存在 `%APPDATA%\EclipsedAssetStudio\config.json`，不写项目目录。

## 功能

1. **生成**：提示词 / 负面词 / 尺寸 / 数量 → 结果缩略图
2. **抠图**：纯色/近纯色背景转透明，可选羽化（复杂背景后续接 BiRefNet）
3. **超分 2x**：Lanczos（后续可替换 Real-ESRGAN）
4. **拆图层**：按 alpha 连通域拆成独立透明 PNG
5. **雪碧图切分**：行/列/边距，自动裁透明边
6. **导出 Atlas**：货架打包 + `atlas.json`（含 9-slice insets）

## 打包 exe

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\build_asset_studio.ps1
# 产物：tools\asset_studio\dist\AssetStudio.exe
```

## 测试

```powershell
cd tools
& $py -m unittest asset_studio.tests.test_core -v
```

## 后续

- 接 BiRefNet/rembg 提升复杂背景抠图
- 接 Qwen-Image-Edit / SeedEdit 做局部重绘、扩图、改字
- 接 SAM2 做 UI 元素拆分
- 接 Real-ESRGAN 做 4K 超分



## 比例（Seedream 4.0 实测可用）

| 比例 | 尺寸 | 用途 |
|---|---|---|
| 1:1 | 1024×1024 | 图标、头像、道具 |
| 4:3 / 3:4 | 1152×864 / 864×1152 | 横/竖卡片 |
| 16:9 / 9:16 | 1280×720 / 720×1280 | 横版/竖屏界面 |
| 3:2 / 2:3 | 1248×832 / 832×1248 | 场景、立绘 |
| 9:16 高清 | 1440×2560 | 竖屏高清（更慢） |

预设会自动带比例：竖屏界面=9:16、横版地图=16:9、角色三视图=16:9，其余 1:1。

## 模板库（29 个）

左侧活动栏「模板」按分类浏览：全部/角色/场景/UI/图标/运营/编辑。

- 选中模板 → 自动填提示词、比例、尺寸
- 「执行模板」= 生成 + 自动后处理（抠图 / 拆层 / 切图）
- 带 ⚠ 的模板需要图生图/编辑模型（SeedEdit），当前 Key 未开通，会提示而不是硬跑

示例：批量动作图 = 生成 3×3 网格 → 抠图 → 切 9 张；角色资源拆分 = 生成 → 抠图 → 拆层；UI 控件 = 生成 → 抠图 → 拆层。

## 参考图 / 图生图

- 「生成」面板新增「参考图」：上传 1–3 张（PNG/JPG/WebP），按钮变为「图生图生成」。
- 描述写「要改什么」，例如：把剑改成红色火焰缠绕、保持构图。
- 模板库里带 ⚠ 的编辑模板（风格转换/界面改造/换装/概念迁移/手部修复）现在可直接用：先上传参考图再执行。
- 实测 Seedream 4.0 图生图：保留构图，成功把金剑改成红焰剑。

## 额度与自动切换

左侧「额度」页：

- 显示每个 Seedream 模型的**今日本地调用次数 / 自设上限 / 状态**（可用、额度用完、不可用）
- 每日上限默认 0=不限，可修改后应用
- 「模型不可用/超额时自动切换」默认开启：遇到 ModelNotOpen / NotFound / 429 / 配额错误，自动标记并尝试下一个模型
- 「刷新可用模型」拉取 /models；「恢复全部模型」「重置今日计数」用于手动纠偏
- 用量账本：%APPDATA%\\EclipsedAssetStudio\\usage.json

说明：火山方舟不公开剩余额度接口，因此展示的是本地计数与自设上限，不是云端真实余额。

## AI 增强（BiRefNet / Real-ESRGAN）

- 抠图：rembg + **BiRefNet-general-lite**（ONNX，CPU），比纯色背景算法更能处理复杂边缘；模型在 %USERPROFILE%\.u2net\birefnet-general-lite.onnx（约 213MB）。
- 超分：**Real-ESRGAN ncnn**（ealesrgan-x4plus，2x），在 %APPDATA%\EclipsedAssetStudio\ai\realesrgan。
- 拆层：不透明图会先做 AI 抠图，再按 alpha 连通域拆；UI 元素重叠时仍建议人工切分。
- 实现方式：GUI 调本地 venv 的 i_worker.py 子进程，不把 ONNX/Torch 打进 exe；AI 不可用时自动回退基础算法。
- 实测：720×1280 抠图约 13s；1024→2048 超分约 150s（CPU）。
- SAM2 尚未接入（需额外 torch + 大 checkpoint），当前用 BiRefNet + 连通域替代。

## 预览交互（现代软件风格）

- **滚轮缩放**：10%–800%，缩放比例实时显示在右下角。
- **拖拽平移**：左键按住拖动查看大图细节。
- **左键使用**：单击预览即把当前图设为工作图，右上角显示「✓ 已使用」。
- **右键菜单**：抠图 / 超分 / 拆层 / 切图 / Atlas / 复制路径 / 打开目录 / 复位，每项带功能说明。
- **双击复位**：恢复 100% 与居中。
- **选中提示**：预览蓝框、缩略图蓝框 + ✓、顶部文件名与尺寸。
- **名词提示**：AI 抠图、Real-ESRGAN、拆层、Atlas 等按钮悬停有解释。

## 新版「画面描述 / 上传」结构

- 大块拖拽区：点击选择，或把 JPG/PNG/WebP **直接拖进窗口**（最多 3 张）；已有参考图时显示缩略图与数量。
- 画面描述：更长的输入框 + 示例提示；支持「图推词」（从参考图提取构图/色调/透明背景）与「扩写」（自动补充画质约束）。
- 尺寸/数量/比例合并为一行；侧边栏可滚动，不再裁切后处理按钮。

## 视觉风格：Organic 自然暖调

- 米白/暖棕/低饱和配色，暖色状态栏与按钮，贴近暗金古风。
- 拖拽区文案精简为「点击或拖入参考图」，已有参考图时只显示数量与更换提示。
- 侧边栏可滚动，保留后处理/交付全部入口。

## 视觉风格：玻璃拟态 + 私有字体

- 选「玻璃拟态」：冷调浅蓝紫背景、半透明玻璃环光标（预览区滚轮/拖拽时显示中心点与“拖动”提示）。
- 字体：内置 **霞鹜文楷**（OFL-1.1，onts/LXGWWenKai-Regular.ttf），启动时私有注册到 Windows，不安装系统字体；失败回退微软雅黑。
- 字体来源：https://github.com/lxgw/LxgwWenKai ，许可见 onts/OFL.txt。
- exe 体积约 42.5MB（含字体）。

## 动效反馈（参考动画集合分类）

- 入场：结果图 0.93→1.0 缩放淡入（220ms）。
- 加载：生成按钮文字循环“·/··/···”，进度条脉冲。
- 指针：玻璃光标半径呼吸；拖动时显示「拖动」。
- 微交互：右下角 Toast 滑入（成功/错误/提示），左键使用、复制路径、生成完成都会提示。
- 过渡：滚轮缩放改为 120ms easing 平滑过渡。
- 全部用 Tk fter 驱动，无额外依赖。

## 模型自选 / PS 编辑 / TexturePacker

### 模型自选
- 侧边栏「模型」下拉可直接选/输入，按 provider 保存；⟳ 从服务端拉列表（百炼为静态 List，豆包走 /models）。
- 设置页模型字段仍可覆盖。

### PS 类编辑（左侧「✎ 编辑」）
- 左转/右转、水平/垂直翻转、亮度/对比度/饱和度、自动对比、缩放。
- 裁剪模式：预览拖框 → 应用裁剪。
- 消除选区：OpenCV Telea 修复（走 AI 子进程，不把 OpenCV 打进 exe）。
- 还原、保存副本。

### TexturePacker 式图集（导出 Atlas）
- MaxRects（rectpack）、允许旋转、POT、trim、extrude、多页。
- 三种 manifest：Cocos / Phaser / TexturePacker。
- 输出 atlas_N.png + atlas_N.json。

### 开源致谢
- rectpack（Apache-2.0）、Pillow（MIT-CMU）、OpenCV（Apache-2.0）、rembg（MIT）、BiRefNet（MIT）、Real-ESRGAN（BSD-3）、tkinterdnd2（MIT）、霞鹜文楷（OFL-1.1）。

## 高 DPI / 流畅度 / 消除修复

- 启用 Per-Monitor DPI 感知，125%/150% 缩放下文字与预览不再被系统拉伸发虚。
- 预览拖拽/缩放/入场使用 BILINEAR 快速重采样，松手后 LANCZOS 终稿；小图不再默认放大。
- 窗口按屏幕自适应（最大 1500×960），侧边栏随 DPI 加宽；底部输出栏高度收紧，低分辨率屏也完整显示。
- 消除选区改走本地 AI venv 的 inpaint（OpenCV Telea），不再在 exe 内 import cv2。

## AI 消除：LaMa（GitHub 开源）

- 开源项目：IOPaint / big-lama（LaMa, Apache-2.0），模型 ig-lama.pt 来自 Sanster/models 的 release。
- 编辑页「AI 消除（LaMa）」：拖框选中 → 首次自动下载约 196MB 到 APPDATA → CPU 推理约 9 秒。
- 对比：OpenCV Telea 会糊成色块；LaMa 能重建纹理与边缘（见 docs/superpowers/reports/lama-compare.png）。
- torch 与模型只在本地 venv/APPDATA，exe 仍约 42MB。
- 「消除（快速）」保留 Telea，适合小瑕疵。
## MCP Server

把工具能力接入 Claude Desktop / Cursor / DSH：

```powershell
python tools\asset_studio\mcp_server.py
```

工具：list_models、generate_image、matte_image、upscale_image、inpaint_image、edit_image、pack_atlas。
配置示例见 MCP.md。
