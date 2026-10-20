# Asset Studio MCP Server

把 Asset Studio 的能力通过 **MCP（Model Context Protocol）stdio** 暴露给 AI 客户端：
Claude Desktop、Cursor、DSH 等可以直接调用生图、抠图、超分、消除、编辑、Atlas 打包。

## 启动

使用和桌面程序相同的 Python 环境（已装 Pillow / OpenCV / onnxruntime / torch 等）：

```powershell
C:\Users\Administrator\.venvs\asset_studio\Scripts\python.exe `
  C:\Users\Administrator\EclipsedBlade\tools\asset_studio\mcp_server.py
```

自检（不进入 stdio 循环，打印工具列表）：

```powershell
...\python.exe ...\mcp_server.py --selftest
```

服务通过 **stdin/stdout** 收发 JSON-RPC，日志写 stderr；API Key 读取本机 `%APPDATA%\EclipsedAssetStudio\config.json`，不需要在 MCP 配置里写 Key。

## 工具

| 工具 | 作用 |
|---|---|
| `list_models` | 当前/指定 provider 的可用模型 |
| `generate_image` | 文生图/图生图（豆包、百炼、OpenAI 兼容、Mock） |
| `matte_image` | BiRefNet 抠图 / 色差抠图 |
| `upscale_image` | Real-ESRGAN 2x/3x/4x / Lanczos |
| `inpaint_image` | LaMa（高质量，首次下载 196MB）/ Telea 快修 |
| `edit_image` | 旋转、翻转、裁剪、缩放、调色、自动对比 |
| `pack_atlas` | MaxRects 图集，Cocos/Phaser/TexturePacker manifest |

## Claude Desktop

编辑 `%APPDATA%\Claude\claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "asset-studio": {
      "command": "C:\\Users\\Administrator\\.venvs\\asset_studio\\Scripts\\python.exe",
      "args": [
        "C:\\Users\\Administrator\\EclipsedBlade\\tools\\asset_studio\\mcp_server.py"
      ]
    }
  }
}
```

重启 Claude Desktop，输入框旁应出现 MCP 工具。

## Cursor

项目根目录 `.cursor/mcp.json` 或全局 `%USERPROFILE%\.cursor\mcp.json`：

```json
{
  "mcpServers": {
    "asset-studio": {
      "command": "C:\\Users\\Administrator\\.venvs\\asset_studio\\Scripts\\python.exe",
      "args": [
        "C:\\Users\\Administrator\\EclipsedBlade\\tools\\asset_studio\\mcp_server.py"
      ]
    }
  }
}
```

在 Cursor Settings → MCP 中确认 `asset-studio` 为绿色/已连接。

## DSH / 其他 MCP 客户端

凡是支持 **stdio MCP Server** 的客户端，填：

- command：`C:\Users\Administrator\.venvs\asset_studio\Scripts\python.exe`
- args：`["C:\Users\Administrator\EclipsedBlade\tools\asset_studio\mcp_server.py"]`
- transport：`stdio`
- 无需 env（Key 从本机配置读取）

## 示例调用

```json
{"name":"generate_image","arguments":{"prompt":"暗金古风技能图标，剑与月","size":1024,"count":2,"ratio":"1:1"}}
{"name":"inpaint_image","arguments":{"input":"C:/art/ui.png","box":[520,250,760,620],"engine":"lama"}}
{"name":"pack_atlas","arguments":{"inputs":["a.png","b.png"],"max_size":2048,"format":"cocos"}}
```

## 注意

- 输出写到本机 `Pictures\AssetStudio\session_*`，工具返回绝对路径。
- LaMa 首次调用会下载约 196MB 模型；可设 `download_model=false` 避免自动下载。
- 这是本地 stdio 服务：只监听 stdin/stdout，不开网络端口。
- 公开发布仓库不包含模型权重、API Key、exe。
