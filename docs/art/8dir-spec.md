# 角色八视图制作规范

## 1. 先区分两种「八视图」

| 类型 | 用途 | 布局 |
|---|---|---|
| **A. 8 方向转身** | 2.5D / 俯视战斗，角色随移动方向转身 | 列 = 8 方向（每 45°），行 = 动作状态 |
| **B. 8 视角转面参考** | 3D 建模/立绘参考，检查比例与结构 | 列 = 帧，行 = 视角（正/45°/侧/135°/背） |

你给的参考图是 **B 类**：5 行视角 × 8 列动作帧（`front / front-45 / side / back-45 / back`）。
如果游戏里要「角色朝 8 个方向走」，需要的是 **A 类**：8 个方向各 8 帧。

## 2. A 类推荐规格

- 单帧画布：**160×160**（或 256×256），透明背景
- 轴心：**脚底中心**（bottom-center），所有帧同一基线
- 方向顺序（8 列，从屏幕坐标）：
  `S, SE, E, NE, N, NW, W, SW`（或按项目坐标自定，写进 manifest）
- 每方向帧数：idle 4 帧、walk 8 帧、attack 6 帧、hit 2 帧、death 6 帧
- 帧率：idle 4–6 fps，walk 10–12 fps，attack 12–15 fps
- 左右对称的角色可以只画 5 个方向，用水平镜像补另外 3 个（需在 manifest 标记 `mirror`）
- 阴影单独一层，不与角色合图（避免镜像后阴影方向错）

## 3. 图集布局

```
行 = 状态：idle / walk / attack / hit / death
列 = 方向或帧（二选一，必须在 manifest 里写清楚）
```

参考图同款（5 视角 × 8 帧）可直接用 `tools/slice_8dir.py` 切：

```powershell
python tools/slice_8dir.py --sheet ref8.jpg --cols 8 --rows 5 ^
  --out docs/art/ref8-slice --remove-bg --trim --canvas 160x160 ^
  --row-names "front,front-45,side,back-45,back" --contact
```

工具会：
1. 从画布边缘连通区域去背景（保留线稿内部填色）
2. 按空白投影自动分列、行等分
3. 每帧 trim + 统一画布 + 底部居中
4. 输出单帧 PNG + `manifest.json` + `contact.png` 拼版

## 4. 接入 Cocos

单帧放到：

```
assets/resources/char/<角色id>/<状态>/<方向>/<帧号>.png
例：assets/resources/char/guanyu/walk/S/00.png
```

`framework/DirectionSprite.ts` 按移动向量自动选方向、按状态切帧：

```ts
const ds = node.addComponent(DirectionSprite);
await ds.setup('char/guanyu', ['idle', 'walk'], 8);
ds.setMove(input.moveX, input.moveY);  // 每帧调用
ds.setState('walk');
```

## 5. 美术来源（三选一）

1. **3D 模型转 8 视角**：Blender 里绕 Z 轴每 45° 渲染一张（正交相机、统一光照），最稳、最适合多角色
2. **AI 逐角度生成**：每个方向单独出图，再按规范切图（需要图像生成工具）
3. **手绘**：按 8 列模板逐方向画，注意脚底基线与比例一致

> 当前环境没有 Blender / 图像生成工具，所以工具链只负责「切图 + 接入」；出图需要你提供 3D 模型或美术图。

## 6. 验收清单

- [ ] 8 个方向齐全，顺序与 manifest 一致
- [ ] 每帧透明背景、无白边、无相邻角色残留
- [ ] 脚底基线一致，画布尺寸统一
- [ ] 角色比例、配色、光影方向一致
- [ ] 动作帧数与帧率符合上表
- [ ] `contact.png` 拼版检查无穿模、无断肢
