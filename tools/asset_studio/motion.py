"""轻量动效工具：Tk after 驱动的 easing 与 Toast。"""
from __future__ import annotations

import time
import tkinter as tk
from typing import Callable, Optional


def ease_out_cubic(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def animate(root: tk.Misc, duration_ms: int, frame: Callable[[float], None],
            done: Optional[Callable[[], None]] = None, interval: int = 16) -> str:
    """按进度 0→1 调用 frame(t)，返回 after id（可用于取消）。"""
    start = time.time()
    duration = max(1, duration_ms) / 1000.0
    holder = {"id": ""}

    def tick():
        t = (time.time() - start) / duration
        frame(ease_out_cubic(min(1.0, t)))
        if t >= 1.0:
            if done:
                done()
            return
        holder["id"] = root.after(interval, tick)

    holder["id"] = root.after(interval, tick)
    return holder["id"]


class Toast:
    """右下角滑入通知，1.8s 后滑出；同类只保留一个。"""

    STYLES = {
        "info": ("#1F2430", "#F3F6FF"),
        "success": ("#1F5E45", "#EAFBF2"),
        "warn": ("#7A4A12", "#FFF4E3"),
        "error": ("#8C2F2A", "#FFEDEC"),
    }

    def __init__(self, root: tk.Misc, text: str, kind: str = "info", hold: int = 1900):
        self.root = root
        self.destroyed = False
        bg, fg = self.STYLES.get(kind, self.STYLES["info"])
        self.frame = tk.Frame(root, bg=bg, highlightthickness=1,
                              highlightbackground="#FFFFFF")
        tk.Label(self.frame, text={"success": "✓ ", "error": "! ", "warn": "! "}.get(kind, "● ")
                 + text, bg=bg, fg=fg, font=("Microsoft YaHei UI", 9),
                 padx=12, pady=8, justify="left").pack()
        self.frame.place(relx=1.0, rely=1.0, x=-24, y=-40, anchor="se")
        self.frame.lift()
        animate(root, 180, lambda t: self._place(t, 18, 0))
        root.after(hold, self._out)

    def _place(self, t: float, from_y: float, to_y: float):
        if self.destroyed:
            return
        y = -40 + int(lerp(from_y, to_y, t))
        self.frame.place(relx=1.0, rely=1.0, x=-24, y=y, anchor="se")

    def _out(self):
        if self.destroyed:
            return
        animate(self.root, 160, lambda t: self._place(t, 0, 18), self._kill)

    def _kill(self):
        if not self.destroyed:
            self.destroyed = True
            try:
                self.frame.destroy()
            except Exception:
                pass
