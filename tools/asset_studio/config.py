"""本地配置：API 供应商、Key、输出目录与默认参数。

配置文件位于 %APPDATA%\\EclipsedAssetStudio\\config.json，
不写入项目目录，打包成 exe 后同样可用。
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict

APP_TITLE = "Eclipsed Asset Studio"
CONFIG_DIR = Path(os.environ.get("APPDATA", str(Path.home()))) / "EclipsedAssetStudio"
CONFIG_PATH = CONFIG_DIR / "config.json"
DEFAULT_OUTPUT = Path.home() / "Pictures" / "AssetStudio"

DEFAULTS: Dict[str, Any] = {
    "provider": "mock",              # mock | doubao | dashscope | openai
    "doubao_api_key": "",
    "doubao_model": "doubao-seedream-4-0-20260415",
    "doubao_base": "https://ark.cn-beijing.volces.com/api/v3",
    "dashscope_api_key": "",
    "dashscope_model": "wanx2.1-t2i-turbo",
    "openai_base": "https://api.siliconflow.cn/v1",
    "openai_key": "",
    "openai_model": "",
    "output_dir": str(DEFAULT_OUTPUT),
    "size": 1024,
    "ratio": "1:1",
    "auto_switch": True,
    "daily_limit": 0,
    "quota_limits": {},
    "count": 2,
    "last_prompt": "游戏 UI 图标，暗金古风，透明背景，正面视图",
    "negative": "文字, 水印, 低清晰度, 变形",
}


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def load_config() -> Dict[str, Any]:
    """读取配置；缺失/损坏时回退默认值，不抛异常。"""
    cfg = dict(DEFAULTS)
    try:
        if CONFIG_PATH.exists():
            raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                for k, v in raw.items():
                    if k in cfg:
                        cfg[k] = v
    except Exception:
        pass
    # 类型兜底
    try:
        cfg["size"] = int(cfg.get("size", 1024))
    except Exception:
        cfg["size"] = 1024
    try:
        cfg["count"] = max(1, min(6, int(cfg.get("count", 2))))
    except Exception:
        cfg["count"] = 2
    if not str(cfg.get("output_dir") or "").strip():
        cfg["output_dir"] = str(DEFAULT_OUTPUT)
    return cfg


def save_config(cfg: Dict[str, Any]) -> None:
    ensure_dir(CONFIG_DIR)
    data = {k: cfg.get(k, v) for k, v in DEFAULTS.items()}
    CONFIG_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def output_dir(cfg: Dict[str, Any]) -> Path:
    p = Path(str(cfg.get("output_dir") or DEFAULT_OUTPUT))
    return ensure_dir(p)


