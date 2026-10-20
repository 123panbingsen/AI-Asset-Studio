# Third-party notices

本项目代码采用 MIT；以下第三方组件/字体/模型权重按各自许可分发或按需下载。

| 组件 | 许可 | 用途 |
|---|---|---|
| Cocos Creator | Cocos 引擎许可 | 游戏引擎 |
| 霞鹜文楷 LXGW WenKai | SIL OFL 1.1 | Asset Studio 界面字体（`tools/asset_studio/fonts/`，含 OFL.txt） |
| Pillow | MIT-CMU | 图像处理 |
| OpenCV | Apache-2.0 | 快速消除 / 图像处理 |
| onnxruntime | MIT | BiRefNet 推理 |
| rembg | MIT | 抠图封装 |
| BiRefNet | MIT | 抠图模型（按需下载） |
| Real-ESRGAN | BSD-3-Clause | 超分（按需下载） |
| LaMa / big-lama | Apache-2.0 | AI 消除模型（按需下载，来源 Sanster/models） |
| IOPaint | Apache-2.0 | LaMa 推理参考实现 |
| rectpack | Apache-2.0 | MaxRects 图集打包 |
| tkinterdnd2 | MIT | 拖拽上传 |
| PyInstaller | GPL-2.0 with exception | exe 打包（构建工具） |

## 模型权重

`big-lama.pt`、BiRefNet ONNX、Real-ESRGAN ncnn 均**不包含在本仓库**，由程序首次使用时下载到用户本地；请遵守上游模型许可。

## 游戏素材

`assets/` 中的美术资源为项目演示素材，不随代码的 MIT 许可授权；公开发布/商用前请替换为你拥有权利的素材。
