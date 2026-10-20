# CLI-Anything 学习报告

日期：2026-10-18
仓库：[HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything)（54k star，Apache-2.0，HKUDS）

## 它是什么

> "Making ALL Software Agent-Native" —— 把任意有源码的软件包装成供 AI Agent 调用的 CLI。

两种用法：

| 用法 | 入口 | 说明 |
|---|---|---|
| **用现成 CLI** | `pip install cli-anything-hub` | CLI-Hub 注册中心：`cli-hub list/search/info/install/launch`，已有 Blender、GIMP、Inkscape、LibreOffice、Godot、ComfyUI、FreeCAD 等 50+ harness |
| **生成新 CLI** | Claude Code / Codex / Cursor 插件 + 7 阶段流程 | `/cli-anything <源码路径>` 自动分析源码 → 设计命令组 → 实现 Click CLI → 测试 → 文档 → 发布 |

## 已安装并跑通

| 项 | 值 |
|---|---|
| venv | `C:\Users\Administrator\.venvs\cli-anything` |
| CLI-Hub | `cli-anything-hub 0.4.1` |
| Blender harness | `cli-anything-blender 1.0.0` |
| 后端 | 本地 Blender 4.4.1（Cycles CPU） |

### Demo 流程

```powershell
cli-anything-blender scene new -n Demo -o demo.json -rx 256 -ry 256 --engine CYCLES --samples 8
cli-anything-blender --project demo.json object add cube
cli-anything-blender --project demo.json object add sphere -l 1.6,0,0
cli-anything-blender --project demo.json camera add -l "0,-6,3" -r "63,0,0" --active
cli-anything-blender --project demo.json light add sun -r "45,0,30" -w 3
cli-anything-blender --project demo.json render execute demo.png --overwrite
# 生成 _render_script.py 后，需要用真实 Blender 执行：
blender --factory-startup -b --python _render_script.py
```

产物：256×256 的 cube + sphere 渲染图。

![demo](cli-anything-blender-demo.png)

### 发现的问题

`render execute` 只生成 bpy 脚本并打印命令，**不会自己调用 Blender**。这与 HARNESS.md 里「CLI 必须调用真实软件」的原则不一致，所以 demo 里我们手动执行了脚本。用的时候要注意这一步。

## 方法论（HARNESS.md）要点

7 个阶段：

1. **源码分析**：找后端引擎、GUI 动作→API 映射、数据模型、已有 CLI、撤销系统
2. **架构设计**：状态化 REPL + 子命令双模式；按领域分命令组；状态如何持久化；`--json` 输出
3. **实现**：数据层 → 探查命令 → 修改命令 → 后端集成（`utils/<software>_backend.py`）→ 渲染/导出 → 会话/撤销 → REPL 皮肤
4. **测试计划**：先写 TEST.md（单测 + E2E 计划）
5. **测试实现**：单测 + 原生格式 E2E + **真实后端 E2E** + CLI 子进程测试；必须验证产物（magic bytes/ZIP/像素/音频 RMS），不能只看退出码
6. **测试文档**：把 pytest 输出与统计追加进 TEST.md
7. **发布**：PyPI 命名空间包 + SKILL.md（Agent 可发现）

关键原则：

- **真实软件是硬依赖**，不许用 Pillow/自写渲染替代 GIMP/Blender
- **渲染鸿沟**：GUI 的效果在渲染时生效，CLI 操作工程文件后必须走真实渲染器
- **输出验证**：退出码 0 不等于成功，要校验格式与内容
- **Agent 原生**：`--json`、`preview`/`status` 自省命令、统一 REPL
- 测试失败而非跳过（后端缺失时）

## 对我们项目的意义

| 场景 | 可直接用 | 价值 |
|---|---|---|
| Blender 渲染 8 方向/动作帧 | `cli-blender` | 比我们手写 bpy 脚本更结构化，但渲染执行需手动补一步 |
| 将来本地 AI 出图 | `cli-comfyui` | ComfyUI REST API 的工作流管理，可接 sprite-gen/本地模型 |
| 图像批处理 | `cli-gimp` / `cli-inkscape` | 抠图、缩放、格式转换 |
| **Cocos Creator 构建/资源管线** | 暂无 harness | 值得按 HARNESS.md 生成一个 `cli-anything-cocos`：构建、资源导入、截图验证、场景切换 |

## 建议下一步

1. **生成 `cli-anything-cocos` harness**：把我们的构建命令、资源目录、截图/验收流程封装成 CLI（7 阶段方法）
2. **探索 `cli-comfyui`**：为将来的本地 AI 出图/精灵生成做准备
3. 把 Blender harness 的「render execute + 手动跑脚本」封装进我们的 `tools/` 流程
