# sprite-gen 同类项目调研

日期：2026-10-18

## 对比

| 项目 | Star | 许可 | 形态 | 核心能力 | 生成凭据 | 8 方向 |
|---|---|---|---|---|---|---|
| [aldegad/sprite-gen](https://github.com/aldegad/sprite-gen) | 2.9k | Apache-2.0 | Python CLI + Agent Skill | 一行行生成 → 透明帧 → atlas + manifest；recolor/slice/ui-kit 等工具 | Codex/Grok 登录或 OpenAI key | 方向锚点工作流 |
| [0x0funky/agent-sprite-forge](https://github.com/0x0funky/agent-sprite-forge) | 4.5k | MIT | Python Agent Skills（5 个） | 单张 still → 每个动作一条 i2v 视频 → 抠图/循环/重定时 → Godot/Aseprite/Web 导出；**codeart2d 纯代码画像素（离线）** | Codex/Grok 或 OpenAI/Gemini/xAI/BytePlus/fal key | 靠横版/四方向 sheet |
| [gykim80/perfectpixel-studio](https://github.com/gykim80/perfectpixel-studio) | 593 | MIT | Go + Wails 桌面应用 | 文字 → 角色 → 100+ 动作；**8 方向（5 生成 + 3 镜像）**；YCbCr 抠图、DP 分帧、质心对齐、像素化；导出 sheet+manifest+Aseprite | Gemini（默认）/ OpenRouter / fal / BytePlus | ✅ 原生支持 |
| [dan-hansen/Blender3Dto2DWorkflow](https://github.com/dan-hansen/Blender3Dto2DWorkflow) | 0 | 无 | Blender Python 脚本 | 旋转/渲染已绑定角色到指定动画帧，支持降采样去锯齿 | **无需**（本地 Blender） | ✅ 任意角度 |
| [GAlbanese09/spritebrew](https://github.com/GAlbanese09/spritebrew) | 63 | AGPL-3.0 | Next.js Web | 上传/生成角色 → 动画 → Unity/Godot/GameMaker/RPG Maker 导出 | Retro Diffusion 服务 | 未明确 |
| [blendi-remade/sprite-sheet-creator](https://github.com/blendi-remade/sprite-sheet-creator) | — | — | Web | 可玩的 2D 角色与地图，fal.ai 驱动 | fal.ai key | — |
| [gfargo/pixelkiln](https://github.com/gfargo/pixelkiln) | 3 | MIT | TS CLI | 清单驱动像素生成 + 人工审核 + 打包 | PixelLab API | 未明确 |

## 结论（针对我们当前环境）

- **完全离线可用**：`Blender3Dto2DWorkflow`——我们已有 Blender 4.4 + Mixamo 骨骼动画 FBX，可直接按角度渲染 8 方向帧，零凭据
- **最贴合「8 方向」需求**：`perfectpixel-studio`——原生 8 方向、自带抠图/分帧/对齐/像素化，导出的 manifest 能直接接 Cocos；但需要 Gemini 等 key（Gemini 有免费额度）
- **最接近 sprite-gen 的平替**：`agent-sprite-forge`——管线更完整（视频驱动、引擎导出），但同样要 Codex/Grok/API key；亮点是 `codeart2d` 可**纯代码离线**画像素精灵
- `spritebrew` / `sprite-sheet-creator` / `pixelkiln` 都依赖付费生成服务，且无原生 8 方向

## 建议路线

1. **离线优先**：用 Blender3Dto2DWorkflow 思路 + 我们的 Mixamo 骨骼模型，出 8 方向帧（不需要任何 key）
2. **要 AI 质量**：注册 Gemini 免费 key → 装 perfectpixel-studio，出 8 方向像素角色 + manifest
3. **要完整管线**：等 codex 登录，继续 sprite-gen（或换 agent-sprite-forge，功能更全）
