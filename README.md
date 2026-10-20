# AI Asset Studio

**AI Asset Studio — local AI game-asset pipeline for Windows** — generate → matte → upscale → split layers → slice → TexturePacker atlas → PS-style editing. Runs fully offline, no Python required.

![Asset Studio](docs/superpowers/reports/asset-studio-dpi.png)

## Download

**[AssetStudio.exe](dist/AssetStudio.exe)** · 42.4 MB · Windows 10/11 x64

- Latest release: https://github.com/123panbingsen/AI-Asset-Studio/releases/latest
- All releases: https://github.com/123panbingsen/AI-Asset-Studio/releases

```text
SHA256 (file checksum, NOT an API key):
BA3D6B9900B776BF1EB5884F2FD047FAC71559644611A2E25D7EA76ED65A50FE
```

Double-click to run. AI models (BiRefNet / Real-ESRGAN / LaMa) are downloaded on demand to `%APPDATA%\EclipsedAssetStudio`. API keys are stored locally only.

## Features

- **AI image generation** — Doubao Seedream / Alibaba DashScope / OpenAI-compatible / Mock; selectable models with automatic fallback.
- **Image-to-image** — drag-and-drop references, prompt extraction, prompt expansion.
- **Matting & upscaling** — BiRefNet transparent PNG; Real-ESRGAN 2x/3x/4x.
- **LaMa AI object removal** — drag a box to erase text/watermarks/objects; ~9s on CPU; Telea quick mode included.
- **PS-style editing** — rotate, flip, crop, resize, brightness/contrast/saturation, auto contrast.
- **Layer split / sprite-sheet slicing / atlas packing** — MaxRects, rotation, POT, trim, extrude, multi-page.
- **Exports** — Cocos, Phaser and TexturePacker JSON manifests.
- **UI** — glassmorphism, high-DPI, LXGW WenKai font, custom cursor and motion feedback.
- **MCP server** — expose all tools to Claude Desktop / Cursor / DSH via stdio.

![LaMa comparison](docs/superpowers/reports/lama-compare.png)

## Quick start

1. Run `AssetStudio.exe`.
2. Open **Settings** and enter provider API keys (saved locally under `%APPDATA%`).
3. Enter a prompt → Generate → Post-process → Export.

No key? Use the built-in **Mock** provider to try the full pipeline offline.

## MCP server

```powershell
python tools\asset_studio\mcp_server.py
```

See [`tools/asset_studio/MCP.md`](tools/asset_studio/MCP.md) for client configuration.

## Run from source

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r tools\asset_studio\requirements.txt
.\.venv\Scripts\python -m asset_studio
```

## License

Code: MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Model weights are **not** bundled; they are downloaded by the app on demand.

---

# AI Asset Studio 中文说明

本地 **AI 游戏资产管线**（Windows 绿色版）：生图 → 抠图 → 超分 → 拆层 → 切图 → TexturePacker 图集 → PS 类编辑，全部本地运行，无需安装 Python。

## 下载

**[AssetStudio.exe](dist/AssetStudio.exe)** · 42.4MB · Windows 10/11 x64

- 最新版本：https://github.com/123panbingsen/AI-Asset-Studio/releases/latest
- 所有版本：https://github.com/123panbingsen/AI-Asset-Studio/releases

文件校验值（SHA256，**不是 API Key**）：

```text
BA3D6B9900B776BF1EB5884F2FD047FAC71559644611A2E25D7EA76ED65A50FE
```

双击运行；AI 模型（BiRefNet / Real-ESRGAN / LaMa）首次使用时按需下载到 `%APPDATA%\EclipsedAssetStudio`，API Key 只保存在本机。

## 功能

- **AI 生图**：豆包 Seedream / 阿里百炼 / OpenAI 兼容 / Mock；模型自选、失败自动切换
- **图生图**：参考图拖拽、图推词、扩写
- **抠图 / 超分**：BiRefNet 透明 PNG；Real-ESRGAN 2x/3x/4x
- **LaMa AI 消除**：拖框消除文字、水印、主体，CPU 约 9 秒；另带 Telea 快速消除
- **PS 类编辑**：旋转、翻转、裁剪、缩放、亮度/对比度/饱和度、自动对比
- **拆层 / 切图 / Atlas**：MaxRects、旋转、POT、trim、extrude、多页
- **导出**：Cocos / Phaser / TexturePacker 三种 JSON manifest
- **界面**：玻璃拟态、高 DPI、霞鹜文楷、自定义光标与动效
- **MCP Server**：接入 Claude Desktop / Cursor / DSH

## 快速开始

1. 双击 `AssetStudio.exe`
2. 在「设置」填各平台 API Key（保存在本机 `%APPDATA%`）
3. 输入描述 → 生成 → 后处理 → 导出

没有 Key 也可以用 **Mock** 离线体验完整流程。

## 从源码运行

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r tools\asset_studio\requirements.txt
.\.venv\Scripts\python -m asset_studio
```

## 许可

代码 MIT；字体与依赖许可见 [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
模型权重不随仓库分发，由程序按需下载。

---

## Security / 安全说明

- **This repository contains no API keys.** / **本仓库不包含任何 API Key。**
- The SHA256 value above is a **file checksum** for verifying the downloaded exe, not a credential. / 上面的 SHA256 是 **文件校验值**，不是密钥，不能用于调用接口。
- API keys are stored only on your machine at `%APPDATA%\EclipsedAssetStudio\config.json`, and are never written to the repo or uploaded. / API Key 只保存在本机 `%APPDATA%\EclipsedAssetStudio\config.json`，不会写入仓库或上传。
- If you fork this project, never commit your own `config.json`. / Fork 后请不要提交自己的 `config.json`。


