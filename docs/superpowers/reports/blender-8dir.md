# Blender 八方向渲染管线报告

日期：2026-10-18

## 安装

| 项 | 值 |
|---|---|
| 来源 | `blender-4.4.1-windows-x64.zip`（官方便携包，367 MB） |
| 安装路径 | `C:\Users\Administrator\AppData\Local\Programs\Blender\blender-4.4.1-windows-x64` |
| 验证 | `blender.exe -b --version` → Blender 4.4.1 ✅ |
| 渲染引擎 | **Cycles CPU**（本机 EEVEE / Workbench 因无可用 GPU 着色器会崩溃） |

## 脚本 `tools/blender_render_8dir.py`

- 无头运行：`blender.exe --factory-startup -b -P tools/blender_render_8dir.py -- --out <dir> --engine cycles`
- 默认程序化生成一个 chibi 底模（头/发/躯干/四肢/披肩），8 帧行走动画
- 8 个方向：`S, SE, E, NE, N, NW, W, SW`（相机每 45° 正交环绕）
- 透明背景、160×160、三点光
- `--model <glb|fbx>`：导入现成模型做静态 8 角度渲染（后续接真实武将模型）
- 输出：`<out>/walk/<dir>/00..07.png` + `<out>/idle/<dir>/00..03.png`

## 本次产物

- `assets/resources/char/blenderchibi/`：**96 帧**（8 方向 × walk 8 + idle 4）
- 预览：`docs/art/blenderchibi-preview.png`

![preview](blenderchibi-preview.png)

## 已知限制

- 程序化底模是「能用」级别，不是最终美术
- idle 帧暂为静态复制（后续可做呼吸动画）
- 无骨骼绑定，行走为四肢绕关节摆动
- MCP for Blender 的 addon 未落盘（安装器找不到 Blender 目录）；CLI 管线不需要它

## 下一步

1. 提供任意武将的 `.glb/.fbx` 模型 → 跑 `--model` 直接出 8 角度图
2. 或用这个底模继续做：加骨骼、武器、披风、更细的行走/攻击动作
3. 出的帧放 `resources/char/<id>/...` 后，`DirectionSprite` 即可接入战斗
