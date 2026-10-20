# SpriteAtlasAddon 管线报告（GitHub 方案落地）

日期：2026-10-18

## 调研结果

| 项目 | 结论 |
|---|---|
| [Mattline1/SpriteAtlasAddon](https://github.com/Mattline1/SpriteAtlasAddon) | ✅ 采用：Blender 插件，多角度渲染动画并自动拼 sprite sheet + JSON/XML 导出；MIT，29KB |
| [Maghwyn/blender_directional_spritesheets](https://github.com/Maghwyn/blender_directional_spritesheets) | 方向数可到 4/8/16/32，但需 Rust 编译拼图，未采用 |
| [craigrmccown/iso-render-pipeline](https://github.com/craigrmccown/iso-render-pipeline) | 等距视角专用，未采用 |

## 安装

- 插件路径：`%APPDATA%\Blender Foundation\Blender\4.4\scripts\addons\SpriteAtlasAddon`
- 已用 CLI `addon_utils.enable` 启用并保存偏好
- 无头调用脚本：`tools/render_with_spriteatlas.py`

## 使用

```powershell
blender.exe --factory-startup -b -P tools/render_with_spriteatlas.py -- ^
  --fbx "C:\...\Great Sword Walk.fbx" ^
  --out "docs/art/spriteatlas-walk.png" --rotations 8 --frames 8 --res 160
```

- 自动设置相机/灯光/Cycles CPU
- 限制动作帧范围，抽 8 帧
- 调用 `mk_sprites.render_sprite_animation` 渲染 8 旋转
- 保存 1280×1280 sprite sheet

## 产物

- `docs/art/spriteatlas-idle.png`
- `docs/art/spriteatlas-walk.png`
- `docs/art/spriteatlas-attack.png`
- 切帧脚本：`tools/slice_spriteatlas.py` → `assets/resources/char/mixamo/{idle,walk,attack}/<8方向>/00..07.png`

修复点：Blender 的透明背景是「RGB 黑 + alpha=0」，初版只按白色去背景导致切出来是黑底方块；已改为 `near_white | alpha<10` 的边缘连通遮罩。

## 当前状态

- 插件管线跑通，sheet 与切帧均正常
- 游戏内临时仍使用 `char/model1`（关羽，渲染正常）
- `char/mixamo` 是 Mixamo 素模，动作干净但外观不适合当最终角色

## 结论

**正式生产建议**：用 SpriteAtlasAddon 渲染「带骨骼的武将模型」（Mixamo 骨架 + 动作），不要再对静态雕像做自动权重重定向——之前你截图里变形/歪掉的姿势，根因就是自动权重 + 长袍。
