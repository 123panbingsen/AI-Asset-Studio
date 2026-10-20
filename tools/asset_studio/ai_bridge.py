"""AI 桥接：定位本地 Python、准备 AI 资源、调用 ai_worker。"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Tuple

from .config import CONFIG_DIR, ensure_dir

AI_DIR = CONFIG_DIR / "ai"


def _frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def _worker_source() -> Path:
    if _frozen():
        return Path(getattr(sys, "_MEIPASS", "")) / "ai_worker.py"
    return Path(__file__).parent / "ai_worker.py"


def _project_bin() -> Path:
    return Path(__file__).parent / "bin" / "realesrgan"


def ensure_assets() -> None:
    """把 worker 与 Real-ESRGAN 复制到 APPDATA，供 exe/子进程使用。"""
    ensure_dir(AI_DIR)
    src_worker = _worker_source()
    dst_worker = AI_DIR / "ai_worker.py"
    if src_worker.exists() and (not dst_worker.exists() or
                                src_worker.stat().st_size != dst_worker.stat().st_size or
                                src_worker.stat().st_mtime > dst_worker.stat().st_mtime):
        shutil.copy2(src_worker, dst_worker)
    esr = AI_DIR / "realesrgan"
    if not (esr / "realesrgan-ncnn-vulkan.exe").exists():
        pb = _project_bin()
        if (pb / "realesrgan-ncnn-vulkan.exe").exists():
            shutil.copytree(pb, esr, dirs_exist_ok=True)


def find_python(cfg: dict) -> str | None:
    p = (cfg.get("ai_python") or "").strip()
    if p and Path(p).exists():
        return p
    cand = Path.home() / ".venvs" / "asset_studio" / "Scripts" / "python.exe"
    if cand.exists():
        return str(cand)
    if not _frozen():
        return sys.executable
    return None


def status(cfg: dict) -> Tuple[bool, str]:
    py = find_python(cfg)
    if not py:
        return False, "AI 未配置：找不到本地 Python（可在设置填入 ai_python）"
    worker = AI_DIR / "ai_worker.py"
    if not worker.exists():
        try:
            ensure_assets()
        except Exception:
            pass
    if not worker.exists():
        return False, "AI 组件缺失：ai_worker.py 未就绪"
    if not (AI_DIR / "realesrgan" / "realesrgan-ncnn-vulkan.exe").exists():
        return True, "BiRefNet 可用；Real-ESRGAN 未就绪（仅基础超分）"
    return True, "BiRefNet + Real-ESRGAN 可用"


def run_ai(cfg: dict, args: list, timeout: int = 900) -> None:
    ensure_assets()
    py = find_python(cfg)
    if not py:
        raise RuntimeError("找不到本地 AI Python 环境")
    worker = AI_DIR / "ai_worker.py"
    if not worker.exists():
        raise RuntimeError("AI 组件未就绪（ai_worker.py 缺失）")
    r = subprocess.run([py, str(worker)] + [str(a) for a in args],
                       cwd=str(AI_DIR), capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        msg = (r.stderr or r.stdout or "未知错误").strip()
        raise RuntimeError(msg[-400:])


LAMA_URL = ("https://gh-proxy.com/https://github.com/Sanster/models/"
            "releases/download/add_big_lama/big-lama.pt")


def lama_path() -> Path:
    return AI_DIR / "models" / "big-lama.pt"


def ensure_lama(progress=None) -> Path:
    """按需下载 LaMa big-lama（196MB）到 APPDATA。"""
    dst = lama_path()
    if dst.exists() and dst.stat().st_size > 100 * 1024 * 1024:
        return dst
    ensure_dir(dst.parent)
    tmp = dst.with_suffix(".part")
    import requests
    with requests.get(LAMA_URL, stream=True, timeout=120) as r:
        r.raise_for_status()
        total = int(r.headers.get("Content-Length") or 0)
        done = 0
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1024 * 256):
                if not chunk:
                    continue
                f.write(chunk)
                done += len(chunk)
                if progress and total:
                    progress(f"下载 LaMa 模型 {done * 100 // total}%")
    tmp.replace(dst)
    if progress:
        progress("LaMa 模型下载完成")
    return dst
