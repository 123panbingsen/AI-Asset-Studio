# Asset Studio

本地 **AI 游戏资产管线**（Windows 绿色版）：生图 → 抠图 → 超分 → 拆层 → 切图 → TexturePacker 图集 → PS 类编辑，全部离线运行。

![Asset Studio](docs/superpowers/reports/asset-studio-dpi.png)

## 下载

**[AssetStudio.exe](dist/AssetStudio.exe)** · 42.4MB · Windows 10/11 x64

SHA256：

```text
E4AC8D4B484E5AEA43CAD5832DDA677C43361874E71A2BD231A3BB75985D5621
```

下载后双击即可，无需安装 Python；首次使用 AI 功能会按需下载模型到 `%APPDATA%\EclipsedAssetStudio`。

## 功能

- **AI 生图**：豆包 Seedream / 阿里百炼 / OpenAI 兼容 / Mock；模型自选、失败自动切换
- **图生图**：参考图拖拽、图推词、扩写
- **抠图**：BiRefNet 透明 PNG；超分：Real-ESRGAN 2x/3x/4x
- **LaMa AI 消除**：拖框消除文字/水印/主体，CPU 约 9 秒；另带 Telea 快速消除
- **PS 类编辑**：旋转、翻转、裁剪、缩放、亮度/对比度/饱和度、自动对比
- **拆图层 / 雪碧图切分 / Atlas 打包**：MaxRects、旋转、POT、trim、extrude、多页
- **导出格式**：Cocos / Phaser / TexturePacker 三种 JSON manifest
- **界面**：玻璃拟态、高 DPI、霞鹜文楷、自定义光标与动效

![LaMa 对比](docs/superpowers/reports/lama-compare.png)

## 使用

1. 双击 `AssetStudio.exe`
2. 右侧「设置」填各平台 API Key（只保存在本机 `%APPDATA%`，不会上传）
3. 输入画面描述 → 生成 → 后处理 → 导出

不填 Key 也可用 Mock 离线演示完整流程。

## MCP Server

源码内置 MCP Server（stdio），可接入 Claude Desktop / Cursor / DSH：

```powershell
python tools\asset_studio\mcp_server.py
```

配置见 [`tools/asset_studio/MCP.md`](tools/asset_studio/MCP.md)。

## 从源码运行

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r tools\asset_studio\requirements.txt
.\.venv\Scripts\python -m asset_studio
```

## 许可

代码 MIT；字体与依赖许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
模型权重（BiRefNet / Real-ESRGAN / LaMa）不随仓库分发，由程序按需下载。
