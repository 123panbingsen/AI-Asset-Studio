"""本地用量账本：按天统计各 provider/model 的调用次数、可配置上限、模型可用性。

说明：火山方舟不提供公开的“剩余额度”查询接口，这里统计本地调用次数；
上限可由用户设置（0=不限），模型不可用/未开通会被标记并跳过，用于自动切换。
"""
from __future__ import annotations

import json
import time
from typing import Dict, List

from .config import CONFIG_DIR, ensure_dir

KNOWN_DOUBAO_MODELS = [
    "doubao-seedream-4-0-20260415",
    "doubao-seedream-5-0-pro-260628",
    "doubao-seedream-5-0-flash-260915",
]
PATH = CONFIG_DIR / "usage.json"
DEFAULT = {
    "date": "",
    "counts": {},        # "provider:model" -> int
    "limits": {},        # "provider:model" -> int（覆盖 daily_limit）
    "unavailable": {},   # model -> {"reason": str, "ts": float}
    "models": [],        # 最近一次 /models 拉取到的图片模型 id
}


def _today() -> str:
    return time.strftime("%Y-%m-%d")


def load() -> dict:
    d = dict(DEFAULT)
    try:
        if PATH.exists():
            raw = json.loads(PATH.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                for k in DEFAULT:
                    if k in raw:
                        d[k] = raw[k]
    except Exception:
        pass
    if d.get("date") != _today():
        d["date"] = _today()
        d["counts"] = {}
    return d


def save(d: dict) -> None:
    ensure_dir(CONFIG_DIR)
    PATH.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")


def record(provider: str, model: str, n: int = 1) -> None:
    d = load()
    key = f"{provider}:{model}"
    d["counts"][key] = int(d["counts"].get(key, 0)) + int(n)
    save(d)


def used(provider: str, model: str) -> int:
    return int(load()["counts"].get(f"{provider}:{model}", 0))


def total(provider: str) -> int:
    d = load()
    return sum(int(v) for k, v in d["counts"].items() if k.startswith(provider + ":"))


def limit_of(cfg: dict, provider: str, model: str) -> int:
    key = f"{provider}:{model}"
    limits = cfg.get("quota_limits") or {}
    try:
        if key in limits:
            return int(limits[key])
        return int(cfg.get("daily_limit") or 0)
    except Exception:
        return 0


def exhausted(cfg: dict, provider: str, model: str) -> bool:
    lim = limit_of(cfg, provider, model)
    return lim > 0 and used(provider, model) >= lim


def mark_unavailable(model: str, reason: str = "") -> None:
    d = load()
    d["unavailable"][model] = {"reason": reason[:200], "ts": time.time()}
    save(d)


def mark_available(model: str) -> None:
    d = load()
    d["unavailable"].pop(model, None)
    save(d)


def is_unavailable(model: str) -> bool:
    return model in load()["unavailable"]


def set_models(models: List[str]) -> None:
    d = load()
    d["models"] = list(models)
    save(d)


def get_models() -> List[str]:
    models = list(load()["models"])
    return models or list(KNOWN_DOUBAO_MODELS)


def reset_today() -> None:
    d = load()
    d["date"] = _today()
    d["counts"] = {}
    save(d)

