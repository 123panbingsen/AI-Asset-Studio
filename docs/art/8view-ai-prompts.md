# 八视角 AI/手绘出图提示词包

目标：为每个武将从 **8 个角度** 各出一张全身图，最后拼成「八视图」参考图。

## 1. 出图流程（推荐）

AI 一次生成 8 个角度通常会导致比例/服装漂移。推荐：

1. **先出正面**（front），确定比例、配色、服装细节
2. 以正面图为 **参考图 / 固定 seed**，逐个生成其余 7 个角度
3. 每张图单独保存为 `<角色id>/<view>.png`
4. 用 `tools/build_8view_sheet.py` 拼版检查
5. 需要动作帧时，再用同一角色做 idle/walk 8 帧

## 2. 全局风格前缀（固定不变）

**中文：**
> 全身角色设定图，三国题材，暗金水墨古风，厚涂质感，清晰轮廓，干净纯色背景，正交视角，无透视变形，人物居中，脚底对齐画面底部，无文字，无阴影投射到背景，高清，2K

**English:**
> full body character reference, Three Kingdoms ancient China, dark gold ink wash style, painterly, clean silhouette, plain solid background, orthographic view, no perspective distortion, centered, feet aligned to bottom, no text, no cast shadow on background, high detail, 2k

## 3. 视角 token（替换到提示词末尾）

| view | 中文 | English |
|---|---|---|
| front | 正面朝向镜头 | front view, facing camera |
| front-45 | 前 45° 侧身 | three-quarter front view, 45 degrees |
| side | 右侧面 | right side profile view |
| back-45 | 后 45° 侧身 | three-quarter back view, 135 degrees |
| back | 正背面 | back view, facing away |
| back-135 | 后 135°（左后侧） | rear three-quarter left view, 135 degrees |
| left | 左侧面 | left side profile view |
| front-135 | 前 135°（左前侧） | three-quarter front left view, 135 degrees |

## 4. 反向提示词（negative）

> 文字、水印、logo、多余肢体、手部畸形、武器穿模、透视变形、俯视、仰视、复杂背景、投影、多个角色、裁切脚部、比例漂移、低清晰度

English:
> text, watermark, logo, extra limbs, deformed hands, weapon clipping, perspective distortion, top-down, low angle, busy background, cast shadow, multiple characters, cropped feet, inconsistent proportions, low resolution

## 5. 每位武将的描述（接在风格前缀后）

| 角色 | 描述 |
|---|---|
| 关羽 | 红脸长髯，绿袍金甲，手持青龙偃月刀，威武 |
| 赵云 | 白袍银甲，少年英气，长枪，披风 |
| 诸葛亮 | 白袍羽扇，文士气质，束发冠 |
| 张飞 | 黑脸虬髯，黑铁甲，丈八蛇矛，魁梧 |
| 黄忠 | 老将白发，暗金甲，长弓，沉稳 |
| 马超 | 白袍银铠，锦马超气质，长枪，英武 |
| 庞统 | 文士长袍，相貌奇特，羽扇，谋士感 |
| 姜维 | 青年将领，银甲蓝袍，长枪，锐气 |

示例（关羽正面）：

> 全身角色设定图，三国题材，暗金水墨古风，厚涂质感，清晰轮廓，干净纯色背景，正交视角，无透视变形，人物居中，脚底对齐画面底部，无文字，无阴影投射到背景，高清，2K。关羽，红脸长髯，绿袍金甲，手持青龙偃月刀，威武，正面朝向镜头。

其余 7 张只替换最后的「视角 token」，并附上正面图作为参考图。

## 6. 文件与拼版

```
docs/art/<角色id>/
  front.png
  front-45.png
  side.png
  back-45.png
  back.png
  back-135.png
  left.png
  front-135.png
```

拼版：

```powershell
python tools/build_8view_sheet.py --input docs/art/guanyu --out docs/art/guanyu-8view.png
```

生成模板（手绘）：

```powershell
python tools/build_8view_sheet.py --template docs/art/8view-template.png
```

## 7. 验收清单

- [ ] 8 个角度齐全，服装/武器/配色一致
- [ ] 同一角色比例一致（头身比、身高）
- [ ] 脚底基线一致
- [ ] 纯色背景、无文字、无投影
- [ ] 侧面/背面细节合理（不出现正面元素）
- [ ] 拼版后左右对称合理
