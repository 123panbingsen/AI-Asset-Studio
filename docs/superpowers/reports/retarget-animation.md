# Mixamo 动画 → 关羽模型 重定向报告

日期：2026-10-18

## 输入

| 文件 | 骨骼 | 网格 | 动作帧范围 |
|---|---|---|---|
| Crouch To Stand.fbx | 65 | Beta_Joints + Beta_Surface | 1–78 |
| Dodging Right.fbx | 65 | 同上 | 1–44 |
| Dying.fbx | 65 | 同上 | 1–133 |

均为 Mixamo 风格：带动作骨架 + 素模（无材质）。

## 管线 `tools/blender_retarget.py`

1. 导入动画 FBX，保留 Armature + Action，删除自带 Beta 素模
2. 导入关羽静态模型（PBR 贴图），合并网格
3. 脚底对齐 z=0、水平居中
4. 网格 + 骨架自动权重绑定（`ARMATURE_AUTO`）
5. 指定 Action，等间隔抽帧渲染（正交相机、透明背景、Cycles CPU）

## 结果

![retarget](../art/retarget-all-preview.png)

- **Crouch To Stand**：蹲姿 → 站起，动作完整
- **Dodging Right**：重心右移的闪避
- **Dying**：站立 → 倒地，躺地姿态正确

自动权重对长袍有拉伸，但整体可辨认、可用于占位。

## 已知限制

- 这三段是 **getup / dodge / die**，没有 **idle / walk / attack**
- 目前只渲染正视图；8 方向动作帧需要按方向批量渲染
- 长袍下摆自动权重变形明显，正式版需要手工刷权重或补骨骼

## 下一步

1. 提供 **idle / walk（以及 attack）** 的 Mixamo FBX → 补齐移动动作
2. 我可以把 8 方向 × 多动作批量渲染（渲染量较大，后台跑）
3. 或者先把 dodge/die/getup 接进战斗逻辑（闪避、死亡、复活）
