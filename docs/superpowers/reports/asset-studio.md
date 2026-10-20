# Eclipsed Asset Studio（本地可视化资产管线）

日期：2026-10-19 ｜ 技术栈：Python 3.9 + Tkinter + Pillow + numpy + requests + PyInstaller

## 交付物

- 单文件 exe：`tools/asset_studio/dist/AssetStudio.exe`（约 29 MB，无需安装 Python）
- 桌面独立程序：`C:\Users\Administrator\Desktop\AssetStudio.exe`（双击即用，带专属图标）
- 源码：`tools/asset_studio/`（GUI、provider、图像算法、管线、测试）
- 打包脚本：`tools/build_asset_studio.ps1`
- 说明：`tools/asset_studio/README.md`

![AssetStudio](asset-studio-vscode.png)

## 已实现

| 能力 | 说明 |
|---|---|
| 生成 | Mock（离线演示）/ **豆包 Seedream（火山方舟）** / 阿里云百炼 DashScope / OpenAI 兼容网关 |
| 抠图 | 采样四边背景色 + 容差 + 羽化，纯色/近纯色背景转透明 |
| 超分 2x | Lanczos（后续可替换 Real-ESRGAN） |
| 拆图层 | alpha 连通域 → 独立透明 PNG |
| 雪碧图切分 | 行/列/边距，自动裁透明边 |
| 导出 Atlas | 货架打包 + `atlas.json`（含 9-slice insets） |
| 设置 | API Key / 模型 / 输出目录，保存在 `%APPDATA%\EclipsedAssetStudio\config.json` |


## 默认提示词预设（10 条）

站点的具体 prompt 不随公开资源下发，以下按公开模板名/功能文案改写，覆盖游戏资产常用场景：

| 预设 | 参考的公开模板/功能 |
|---|---|
| 游戏图标 · 暗金古风 | 图标通用生成器 |
| UI 控件整套 | UI 界面控件 |
| 角色三视图 | 角色三视图制作 |
| 八方向角色图 | 八方图生成器 |
| 场景元素拆分 | 场景元素拆分 |
| 技能特效分镜 | 技能特效分镜 |
| 横版关卡地图 | 横板地图生成器 |
| 角色动作雪碧图 | 动作帧生成器 |
| 竖屏界面概念 | 界面概念探索器 |
| 像素风转换 | 像素背景转换器 |

在 GUI「预设」下拉选择即可自动填提示词/负面词/尺寸；主提示词里的 {主体} 可按需替换。
## 使用

```powershell
# 打开 GUI
tools\asset_studio\dist\AssetStudio.exe

# 带示例（Mock 自动生成两张）
tools\asset_studio\dist\AssetStudio.exe --demo

# 无界面自检（生成→抠图→超分→拆层→切图→Atlas）
tools\asset_studio\dist\AssetStudio.exe --selftest --out %TEMP%\asset_studio_test
```

真实生成：右上角「设置」→ provider 选 `dashscope`，填 Key，模型可填 `wanx2.1-t2i-turbo` 或 `qwen-image`。也可选 `openai` 接任意 OpenAI 兼容网关（如硅基流动）。

## 验证

- `python -m unittest asset_studio.tests.test_core -v` → 7/7 通过
- `AssetStudio.exe --selftest` → exit 0，产出 19 个文件（含 atlas.png/json）
- GUI 冒烟与截图通过

## 已知限制 / 下一步

1. 抠图目前是纯色背景算法；复杂背景需接 **BiRefNet / rembg**。
2. 拆层按 alpha 连通域，UI 元素重叠时需 **SAM2** 或手动切分。
3. 超分为 Lanczos；要 4K 质感需接 **Real-ESRGAN**。
4. 未做局部重绘/扩图/改字；可接 **Qwen-Image-Edit / SeedEdit**。
5. 生成暂不支持参考图（img2img）；下一步按 provider 增加。
6. 尚未接 Cocos 工程导入，目前输出 PNG/Atlas/manifest，可手动拷入 `assets/resources`。



## 2026-10-19 更新：豆包 + VS Code 风格 UI

- 新增 doubao provider：火山方舟 /api/v3/images/generations，支持模型名或接入点 p-...。
- 界面重做为 VS Code Light+ 风格：标题栏 / 活动栏 / 侧边栏 / 预览标签页 / 输出面板 / 蓝色状态栏，浅色背景。
- 生成流程保持不变；演示模式强制 Mock，避免本机 Key 状态影响。
- 桌面版已覆盖：C:\Users\Administrator\Desktop\AssetStudio.exe。

## 2026-10-19 修复：设置保存 + 豆包实测

**保存失败原因**：设置窗口内容过高（约 10 个输入框 + 分段标题），640px 高度下「保存」按钮被挤出可视区，用户填完 Key 直接关窗就没有落盘。

**修复**：
- 设置改为两栏布局（780×600），保存按钮固定可见；
- 关闭窗口自动保存（WM_DELETE_WINDOW → save）；
- 新增「测试连接」：豆包会拉 /models 并校验模型是否可用；
- 保存失败弹出错误，不再静默。

**豆包实测**（用户 Key，已写入本机 %APPDATA%\\EclipsedAssetStudio\\config.json）：
- 3.0 / 5.0 不可用（下线 / 未开通），可用模型：doubao-seedream-4-0-20260415；
- 生成样例：![豆包生成](asset-studio-doubao-sample.png)
- 桌面 exe 已热替换；旧文件保留为 AssetStudio-old.exe，关闭旧窗口后重开即可。

## 2026-10-19 修复：豆包尺寸下限

- 报错 size must be at least 921600 pixels：Seedream 4.0 最小 960×960。
- 修复：豆包 provider 与 UI 均对 <1024 自动升到 1024，并在日志提示；配置默认尺寸改为 1024。
- 生成请求增加 watermark: false，避免素材带水印。
- 实测：以 512 请求仍成功产出 1024×1024。

## 2026-10-19 新增：比例选择

- 侧边栏新增「比例」：1:1 / 4:3 / 3:4 / 16:9 / 9:16 / 3:2 / 2:3 / 9:16 高清。
- 豆包按已验证尺寸表出图，UI/Provider 双层兜底。
- 实测 9:16 → 720×1280 成功：![9:16 实测](asset-studio-doubao-916.png)
- 预设自动带比例（竖屏界面 9:16、横版地图 16:9、三视图 16:9）。

## 2026-10-19 新增：模板库

参考魔触公开模板页，内置 29 个模板（角色/场景/UI/图标/运营/编辑），支持分类筛选、一键套用、自动后处理。

![模板库](asset-studio-templates.png)

已自动化：抠图、拆层、网格切图、Atlas；参考图类（风格转换/界面改造/换装/概念迁移/手部修复）标记为需 SeedEdit，待开通后接入。

## 2026-10-19 新增：参考图 / 图生图

![参考图界面](asset-studio-ref.png)

- 支持上传 1–3 张参考图，Seedream 4.0 以 data URL 传入 image。
- 文生图/图生图同一入口：有参考图即走编辑，描述写修改要求。
- 编辑类模板解除限制，改为「需先上传参考图」。
- 实测：金剑 → 红焰剑，构图与背景保持：![图生图实测](asset-studio-i2i.png)

## 2026-10-19 新增：额度页与模型自动切换

![额度页](asset-studio-quota.png)

- 本地账本按天统计 provider/model 调用次数，可设每日上限。
- 自动切换：模型不可用/超额时标记并降级到候选模型；候选来自 /models 与内置列表。
- 实测 fallback：modelA 报 ModelNotOpen 自动切到 modelB 并记录用量。
- 云端剩余额度不公开，UI 中已注明。

## 2026-10-19 AI 增强接入

![AI 引擎状态](asset-studio-ai.png)

- **BiRefNet-general-lite**（rembg/onnxruntime）替代纯色抠图，复杂边缘可用；720×1280 约 13s。
- **Real-ESRGAN ncnn** 2x 超分，1024→2048 约 150s（CPU），替代 Lanczos。
- AI 经本地 venv 子进程调用，exe 仍约 29MB；缺失时自动回退基础算法。
- 拆层前若图片不透明，会先 AI 抠图。
- SAM2 暂未接入：需 torch + 大模型；当前用 BiRefNet + alpha 连通域。

![BiRefNet 抠图](matte-birefnet-sword.png)

![Real-ESRGAN 2x](esrgan-sword-2x.png)

## 2026-10-19 预览交互升级

![预览](asset-studio-preview.png)

- 滚轮缩放 10%–800%、拖拽平移、双击复位。
- 左键设为工作图，右键功能菜单（带说明），选中蓝框 + ✓。
- 底部操作提示条，按钮悬停解释特殊名词（BiRefNet/Real-ESRGAN/Atlas/9-slice）。

## 2026-10-19 新版上传/描述结构

![新结构](asset-studio-upzone.png)

- 大块拖拽上传区（tkinterdnd2），支持从资源管理器直接拖图。
- 画面描述长输入框 + 示例；新增「图推词」「扩写」开关。
- 侧边栏改为可滚动，后处理按钮不再被裁切。

## 2026-10-19 视觉风格切换

选择 **Organic 自然暖调**：米白背景、暖棕强调色、深棕状态栏；拖拽区仅保留「点击或拖入参考图」。

![Organic 风格](asset-studio-organic.png)

## 2026-10-19 玻璃拟态 + 字体适配

![玻璃拟态](asset-studio-glass.png)

- 采用 Glassmorphism：浅蓝紫背景、白色面板、紫罗兰强调色、深色状态栏。
- 预览区自定义玻璃环光标：半透明环 + 中心点，拖动时显示「拖动」标签。
- 私有加载 OFL 字体「霞鹜文楷」（	ools/asset_studio/fonts/，含 OFL.txt），exe 内打包、APPDATA 缓存、启动注册，不污染系统字体。
- 拖拽区文案精简为「点击或拖入参考图」。

## 2026-10-19 动效反馈

![动效](asset-studio-motion.png)

按「入场 / 加载 / 指针 / 微交互 / 过渡」加了一组轻量动效：结果缩放入场、按钮呼吸点、玻璃光标脉冲、右下角 Toast、缩放平滑过渡。节奏控制在 120–220ms，避免干扰。

## 2026-10-19 修复：切换到阿里百炼失败

原因：DashScopeProvider.generate 签名缺少 atio/refs 参数，切到阿里后调用直接 TypeError（不是 Key 问题）。

修复：补齐参数与比例尺寸映射；参考图场景提示「百炼暂不支持参考图，按文生图执行」。

已用实际百炼 Key 实测生成 1024×1024 成功：

![百炼实测](ali-test.png)

## 2026-10-20 模型自选 / PS 编辑 / TexturePacker

![模型自选](asset-studio-model.png)

![PS 编辑](asset-studio-editor.png)

- 模型下拉 + 服务端列表刷新，按 provider 持久化。
- 编辑页：旋转/翻转/调色/缩放/拖框裁剪/OpenCV 消除/保存副本。
- Atlas：rectpack MaxRects、旋转/POT/trim/extrude/多页、Cocos/Phaser/TexturePacker 三种 JSON。
- 开源依赖：rectpack(Apache-2.0)、Pillow(MIT-CMU)、OpenCV(Apache-2.0)、rembg(MIT)、BiRefNet(MIT)、Real-ESRGAN(BSD-3)、tkinterdnd2(MIT)、霞鹜文楷(OFL)。

## 2026-10-20 DPI 清晰度与流畅度修复

![高 DPI](asset-studio-dpi.png)

- 修复 OpenCV 不可用：消除改走 ai_worker 的 inpaint 子进程，并按 mtime 刷新 worker。
- 启用 Per-Monitor DPI 感知；窗口自适应屏幕，侧边栏按 DPI 加宽，输出栏缩短。
- 拖拽/缩放/入场用快速 BILINEAR，结束再 LANCZOS；小图不默认放大，避免发虚。

## 2026-10-20 AI 消除改用 LaMa

![LaMa 对比](lama-compare.png)

- 之前 OpenCV Telea 对大面积文字/主体只会模糊；现接入开源 LaMa（big-lama JIT）。
- 流程：选区 ROI 裁切 → 512 推理 → 羽化回贴；首次自动下载 196MB 模型。
- CPU 单次约 9 秒；Telea 保留为「快速消除」。
- 依赖 torch 仅在本地 venv，exe 不打包。
