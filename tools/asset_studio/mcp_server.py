"""Asset Studio MCP Server（stdio，JSON-RPC 2.0 / newline-delimited）。

让 Claude Desktop、Cursor、DSH 等 MCP 客户端直接调用：
生图、抠图、超分、LaMa/Telea 消除、PS 类编辑、Atlas 打包、模型列表。

启动：
    python tools/asset_studio/mcp_server.py

MCP 客户端配置见 tools/asset_studio/MCP.md。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict

from PIL import Image

# 允许 `python path/to/mcp_server.py` 直接运行
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from asset_studio import atlas  # noqa: E402
from asset_studio.ai_bridge import ensure_lama, lama_path, run_ai  # noqa: E402
from asset_studio.config import load_config  # noqa: E402
from asset_studio.editor import Editor  # noqa: E402
from asset_studio.pipeline import Pipeline  # noqa: E402
from asset_studio.providers import list_models  # noqa: E402

SERVER_INFO = {"name": "asset-studio", "version": "1.0.0"}


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


TOOLS = [
    {
        "name": "list_models",
        "description": "列出当前生图后端可用模型（不传 provider 用本机配置）。",
        "inputSchema": {
            "type": "object",
            "properties": {"provider": {"type": "string", "enum": ["doubao", "dashscope", "openai", "mock"]}},
        },
    },
    {
        "name": "generate_image",
        "description": "AI 文生图/图生图，保存 PNG 并返回绝对路径。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string"},
                "negative": {"type": "string", "default": ""},
                "size": {"type": "integer", "default": 1024},
                "count": {"type": "integer", "default": 2, "minimum": 1, "maximum": 6},
                "ratio": {"type": "string", "default": "1:1"},
                "refs": {"type": "array", "items": {"type": "string"},
                         "description": "参考图绝对路径（可选）"},
                "provider": {"type": "string", "enum": ["doubao", "dashscope", "openai", "mock"]},
                "model": {"type": "string"},
            },
            "required": ["prompt"],
        },
    },
    {
        "name": "matte_image",
        "description": "抠图输出透明 PNG；engine=ai 用 BiRefNet，basic 用色差。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "input": {"type": "string"},
                "engine": {"type": "string", "enum": ["ai", "basic"], "default": "ai"},
                "model": {"type": "string", "default": "birefnet-general-lite"},
            },
            "required": ["input"],
        },
    },
    {
        "name": "upscale_image",
        "description": "超分放大；engine=ai 用 Real-ESRGAN，basic 用 Lanczos。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "input": {"type": "string"},
                "factor": {"type": "integer", "enum": [2, 3, 4], "default": 2},
                "engine": {"type": "string", "enum": ["ai", "basic"], "default": "ai"},
            },
            "required": ["input"],
        },
    },
    {
        "name": "inpaint_image",
        "description": "消除/修复选区。engine=lama 高质量（首次下载 196MB），telea 快速。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "input": {"type": "string"},
                "box": {"type": "array", "items": {"type": "integer"}, "minItems": 4, "maxItems": 4,
                        "description": "[left, top, right, bottom] 像素坐标"},
                "engine": {"type": "string", "enum": ["lama", "telea"], "default": "lama"},
                "download_model": {"type": "boolean", "default": True},
            },
            "required": ["input", "box"],
        },
    },
    {
        "name": "edit_image",
        "description": "PS 类编辑：rotate/flip/crop/resize/adjust/auto_contrast，按顺序执行并输出 PNG。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "input": {"type": "string"},
                "operations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "op": {"type": "string",
                                   "enum": ["rotate", "flip", "crop", "resize", "adjust", "auto_contrast"]},
                            "clockwise": {"type": "boolean", "default": True},
                            "horizontal": {"type": "boolean", "default": True},
                            "box": {"type": "array", "items": {"type": "integer"}},
                            "scale": {"type": "number"},
                            "brightness": {"type": "number", "default": 1.0},
                            "contrast": {"type": "number", "default": 1.0},
                            "saturation": {"type": "number", "default": 1.0},
                            "sharpen": {"type": "number", "default": 0.0},
                        },
                        "required": ["op"],
                    },
                },
            },
            "required": ["input", "operations"],
        },
    },
    {
        "name": "pack_atlas",
        "description": "TexturePacker 式图集打包（MaxRects，旋转/POT/trim/extrude/多页）。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "inputs": {"type": "array", "items": {"type": "string"}},
                "max_size": {"type": "integer", "default": 2048},
                "padding": {"type": "integer", "default": 4},
                "extrude": {"type": "integer", "default": 0},
                "rotate": {"type": "boolean", "default": True},
                "pot": {"type": "boolean", "default": False},
                "trim": {"type": "boolean", "default": True},
                "format": {"type": "string", "enum": ["cocos", "phaser", "texturepacker"], "default": "cocos"},
                "name": {"type": "string", "default": "atlas"},
            },
            "required": ["inputs"],
        },
    },
]


def _cfg(args: Dict[str, Any]) -> dict:
    cfg = load_config()
    provider = args.get("provider")
    if provider:
        cfg["provider"] = provider
    if args.get("model"):
        cfg[f"{cfg.get('provider', 'mock')}_model"] = args["model"]
    return cfg


def _pipe(args: Dict[str, Any]) -> Pipeline:
    return Pipeline(_cfg(args))


def _ok(data: Any) -> Dict[str, Any]:
    return {"content": [{"type": "text", "text": json.dumps(data, ensure_ascii=False, indent=2)}],
            "isError": False}


def _err(msg: str) -> Dict[str, Any]:
    return {"content": [{"type": "text", "text": msg}], "isError": True}


def call_tool(name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    try:
        if name == "list_models":
            cfg = _cfg(args)
            return _ok({"provider": cfg.get("provider"), "models": list_models(cfg),
                        "current": cfg.get(f"{cfg.get('provider')}_model", "")})

        if name == "generate_image":
            pipe = _pipe(args)
            paths = pipe.generate(args["prompt"], args.get("negative", ""),
                                  int(args.get("size", 1024)), int(args.get("count", 2)),
                                  ratio=args.get("ratio", "1:1"),
                                  refs=[str(Path(p)) for p in args.get("refs", [])],
                                  progress=lambda m: log(m))
            return _ok({"paths": [str(p) for p in paths],
                        "model": pipe.last_model,
                        "provider": pipe.cfg.get("provider")})

        if name == "matte_image":
            pipe = _pipe(args)
            if args.get("engine", "ai") == "ai":
                out = pipe.matte_ai(args["input"], args.get("model", "birefnet-general-lite"))
            else:
                out = pipe.matte(args["input"])
            return _ok({"path": str(out)})

        if name == "upscale_image":
            pipe = _pipe(args)
            if args.get("engine", "ai") == "ai":
                out = pipe.upscale_ai(args["input"], int(args.get("factor", 2)))
            else:
                out = pipe.upscale(args["input"], int(args.get("factor", 2)))
            return _ok({"path": str(out)})

        if name == "inpaint_image":
            src = Path(args["input"])
            box = [int(v) for v in args["box"]]
            sess = _pipe(args).ensure_session()
            dst = sess / (src.stem + f"_inpaint_{box[0]}_{box[1]}.png")
            if args.get("engine", "lama") == "lama":
                if not lama_path().exists():
                    if not args.get("download_model", True):
                        raise RuntimeError("LaMa 模型未下载；可设置 download_model=true 或 engine=telea")
                    ensure_lama(lambda m: log(m))
                run_ai(load_config(), ["inpaint_lama", src, dst, ",".join(map(str, box))])
            else:
                run_ai(load_config(), ["inpaint", src, dst, ",".join(map(str, box))])
            return _ok({"path": str(dst), "engine": args.get("engine", "lama")})

        if name == "edit_image":
            src = Path(args["input"])
            ed = Editor(src)
            for op in args["operations"]:
                kind = op.get("op")
                if kind == "rotate":
                    ed.rotate(bool(op.get("clockwise", True)))
                elif kind == "flip":
                    ed.flip(bool(op.get("horizontal", True)))
                elif kind == "crop":
                    ed.crop(tuple(int(v) for v in op["box"]))
                elif kind == "resize":
                    ed.resize(float(op["scale"]))
                elif kind == "adjust":
                    ed.adjust(float(op.get("brightness", 1.0)), float(op.get("contrast", 1.0)),
                              float(op.get("saturation", 1.0)), float(op.get("sharpen", 0.0)))
                elif kind == "auto_contrast":
                    ed.auto_contrast()
                else:
                    raise RuntimeError("未知操作：" + str(kind))
            sess = _pipe(args).ensure_session()
            dst = sess / (src.stem + "_edited.png")
            ed.save(dst)
            return _ok({"path": str(dst), "size": list(ed.img.size)})

        if name == "pack_atlas":
            paths = [Path(p) for p in args["inputs"]]
            pages = atlas.pack_pages(
                [(p.stem, Image.open(p).convert("RGBA"))
                 for p in paths],
                max_size=int(args.get("max_size", 2048)),
                padding=int(args.get("padding", 4)),
                extrude=int(args.get("extrude", 0)),
                rotate=bool(args.get("rotate", True)),
                pot=bool(args.get("pot", False)),
                trim=bool(args.get("trim", True)),
                fmt=args.get("format", "cocos"))
            folder = _pipe(args).ensure_session() / "atlas"
            res = atlas.export_pages(pages, folder, args.get("name", "atlas"))
            return _ok({"pages": len(pages),
                        "images": [str(r["image"]) for r in res],
                        "manifests": [str(r["json"]) for r in res]})

        return _err("未知工具：" + name)
    except Exception as e:
        log(f"tool {name} failed: {e}")
        return _err(str(e))


def handle(msg: Dict[str, Any]) -> Dict[str, Any] | None:
    method = msg.get("method")
    mid = msg.get("id")
    if method == "initialize":
        return {"jsonrpc": "2.0", "id": mid,
                "result": {"protocolVersion": "2024-11-05",
                           "capabilities": {"tools": {"listChanged": False}},
                           "serverInfo": SERVER_INFO}}
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": mid, "result": {"tools": TOOLS}}
    if method == "tools/call":
        params = msg.get("params") or {}
        result = call_tool(params.get("name", ""), params.get("arguments") or {})
        return {"jsonrpc": "2.0", "id": mid, "result": result}
    if method == "ping":
        return {"jsonrpc": "2.0", "id": mid, "result": {}}
    if method in ("notifications/initialized", "notifications/cancelled"):
        return None
    if mid is None:
        return None
    return {"jsonrpc": "2.0", "id": mid,
            "error": {"code": -32601, "message": f"Method not found: {method}"}}


def main() -> int:
    if "--selftest" in sys.argv:
        print(json.dumps({"server": SERVER_INFO,
                          "tools": [t["name"] for t in TOOLS]},
                         ensure_ascii=False, indent=2))
        return 0
    for stream in (sys.stdin, sys.stdout):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    log("Asset Studio MCP server ready (stdio)")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError as e:
            log(f"invalid json: {e}")
            continue
        resp = handle(msg)
        if resp is not None:
            sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
            sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


