"""私有字体加载：把 OFL 字体复制到 APPDATA 并注册到 Windows，不装系统字体。"""
from __future__ import annotations

import ctypes
import shutil
import sys
from pathlib import Path

from .config import CONFIG_DIR, ensure_dir

FONT_FILES = ["LXGWWenKai-Regular.ttf"]
FAMILY_CANDIDATES = ["霞鹜文楷", "LXGW WenKai", "Microsoft YaHei UI", "Segoe UI"]


def _source_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", "")) / "fonts"
    return Path(__file__).parent / "fonts"


def _copy_fonts() -> Path:
    dst = ensure_dir(CONFIG_DIR / "fonts")
    src = _source_dir()
    for name in FONT_FILES:
        s = src / name
        d = dst / name
        if s.exists() and (not d.exists() or s.stat().st_size != d.stat().st_size):
            try:
                shutil.copy2(s, d)
            except Exception:
                pass
    return dst


def _register(path: Path) -> None:
    if sys.platform != "win32":
        return
    try:
        ctypes.windll.gdi32.AddFontResourceExW(str(path), 0x10, 0)  # FR_PRIVATE
    except Exception:
        pass


def load_family() -> str | None:
    """注册字体并返回 Tk 可用的 family 名；失败返回 None。"""
    dst = _copy_fonts()
    for name in FONT_FILES:
        p = dst / name
        if p.exists():
            _register(p)
    try:
        import tkinter as tk
        from tkinter import font as tkfont

        root = tk._default_root
        if root is None:
            root = tk.Tk()
            root.withdraw()
            owned = True
        else:
            owned = False
        fams = set(tkfont.families())
        if owned:
            root.destroy()
        for cand in FAMILY_CANDIDATES:
            if cand in fams:
                return cand
    except Exception:
        pass
    return None
