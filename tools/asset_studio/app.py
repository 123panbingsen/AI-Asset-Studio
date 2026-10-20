"""VS Code 风格桌面界面（浅色主题）：生成 → 后处理 → 交付。

运行：python -m asset_studio
打包：tools/build_asset_studio.ps1
"""
from __future__ import annotations

import math
import ctypes
import os
import sys
import threading
import traceback
from pathlib import Path
from typing import List, Optional

import tkinter as tk
from tkinter import filedialog, messagebox, ttk

try:
    from tkinterdnd2 import TkinterDnD, DND_FILES
    HAVE_DND = True
except Exception:
    HAVE_DND = False

from PIL import Image, ImageTk

from .config import APP_TITLE, CONFIG_PATH, DEFAULTS, load_config, save_config, output_dir
from .pipeline import Pipeline
from .presets import by_name, names as preset_names
from .providers import list_models, static_models
from .templates import CATS, TEMPLATES, by_cat, by_id as tpl_by_id
from . import usage, atlas
from .editor import Editor
from .motion import Toast, animate, lerp, ease_out_cubic

# ---- Glassmorphism 玻璃拟态配色 ----
TITLE_BG = "#EEF2FA"
ACTIVITY_BG = "#E9EEF8"
SIDEBAR_BG = "#F1F4FB"
EDITOR_BG = "#F8FAFF"
PANEL_BG = "#FFFFFF"
BORDER = "#DDE4F0"
TEXT = "#1F2430"
SUB = "#7A8296"
ACCENT = "#7C6CFF"
ACCENT_DARK = "#5B4CDB"
BTN_BG = "#E9ECF7"
INPUT_BG = "#FFFFFF"
STATUS_BG = "#1F2430"
STATUS_FG = "#EEF2FA"
LOG_BG = "#FFFFFF"

FONT = ("Microsoft YaHei UI", 10)
FONT_B = ("Microsoft YaHei UI", 10, "bold")
FONT_S = ("Microsoft YaHei UI", 9)
FONT_MONO = ("Consolas", 9)


def enable_dpi_awareness():
    """Windows 高 DPI：避免 Tk 被系统拉伸导致模糊。"""
    if sys.platform != "win32":
        return 96
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass
    try:
        return int(ctypes.windll.user32.GetDpiForSystem())
    except Exception:
        return 96


class ToolTip:
    """轻量 Tooltip：悬停 500ms 显示，离开销毁。"""

    def __init__(self, widget, text: str, delay: int = 500):
        self.widget = widget
        self.text = text
        self.delay = delay
        self._after = None
        self._tip = None
        widget.bind("<Enter>", self._enter, add="+")
        widget.bind("<Leave>", self._leave, add="+")
        widget.bind("<ButtonPress>", self._leave, add="+")

    def _enter(self, _=None):
        self._after = self.widget.after(self.delay, self._show)

    def _leave(self, _=None):
        if self._after:
            self.widget.after_cancel(self._after)
            self._after = None
        if self._tip:
            self._tip.destroy()
            self._tip = None

    def _show(self):
        if self._tip:
            return
        try:
            x = self.widget.winfo_rootx() + 12
            y = self.widget.winfo_rooty() + self.widget.winfo_height() + 6
        except Exception:
            return
        self._tip = tk.Toplevel(self.widget)
        self._tip.wm_overrideredirect(True)
        self._tip.wm_geometry(f"+{x}+{y}")
        tk.Label(self._tip, text=self.text, bg="#1F2430", fg="#F3F6FF",
                 font=("Microsoft YaHei UI", 9), padx=8, pady=5,
                 justify="left", wraplength=300).pack()


class App:
    def __init__(self, root: tk.Tk):
        self.root = root
        # 私有加载 OFL 字体（不安装到系统）
        try:
            from .fonts import load_family
            fam = load_family()
            if fam:
                global FONT, FONT_B, FONT_S
                FONT = (fam, 10)
                FONT_B = (fam, 10, "bold")
                FONT_S = (fam, 9)
        except Exception:
            pass
        self.cfg = load_config()
        self.pipe = Pipeline(self.cfg)
        self.results: List[Path] = []
        self.selected: Optional[Path] = None
        self.current_img: Optional[Image.Image] = None
        self.ref_paths: List[str] = []
        self.busy = False
        self.demo_mode = False
        self.view = "gen"
        self.zoom = 1.0
        self.pan_x = 0.0
        self.pan_y = 0.0
        self._drag = None
        self._cursor_xy = None
        self._cursor_inside = False
        self._cursor_after = None
        self._cursor_phase = 0.0
        self._intro = 1.0
        self._zoom_after = None
        self._busy_after = None
        self._toast_obj = None
        self._gen_label = "生成图片"
        self.editor = None
        self.crop_mode = False
        self._sel_img_box = None
        self._sel_canvas = None
        self._view_rect = None
        self._tips = []

        root.title(f"{APP_TITLE} — 本地游戏资产管线")
        try:
            _sw, _sh = root.winfo_screenwidth(), root.winfo_screenheight()
            _w = min(1500, int(_sw * 0.94))
            _h = min(960, int(_sh * 0.92))
            root.geometry(f"{_w}x{_h}+{(_sw - _w) // 2}+{(_sh - _h) // 2}")
        except Exception:
            root.geometry("1220x900")
        root.minsize(1200, 760)
        root.configure(bg=SIDEBAR_BG)

        self._style()
        self._build_titlebar()
        self._build_statusbar()
        self._build_bottom_panel()
        self._build_body()
        self._refresh_provider()
        self._log("就绪。Mock 可直接演示；豆包/百炼需在「设置」填 API Key。")
        try:
            from .ai_bridge import status as ai_status
            ok, msg = ai_status(self.cfg)
            self._log("AI 引擎：" + msg)
        except Exception as e:
            self._log(f"AI 引擎检测失败：{e}")
        self._set_status("就绪")

    # ------------------------------------------------------------------ style
    def _style(self):
        st = ttk.Style(self.root)
        try:
            st.theme_use("clam")
        except tk.TclError:
            pass
        st.configure(".", background=SIDEBAR_BG, foreground=TEXT, font=FONT, borderwidth=0)
        st.configure("TFrame", background=SIDEBAR_BG)
        st.configure("Card.TFrame", background=PANEL_BG)
        st.configure("TLabel", background=SIDEBAR_BG, foreground=TEXT, font=FONT)
        st.configure("Sub.TLabel", background=SIDEBAR_BG, foreground=SUB, font=FONT_S)
        st.configure("Head.TLabel", background=SIDEBAR_BG, foreground=TEXT, font=FONT_B)
        st.configure("TButton", background=BTN_BG, foreground=TEXT, font=FONT,
                     padding=(10, 6), relief="flat")
        st.map("TButton", background=[("active", "#DFE5F2"), ("disabled", "#EFE5D7")],
               foreground=[("disabled", "#a0a0a0")])
        st.configure("Accent.TButton", background=ACCENT, foreground="#FFFFFF", font=FONT_B)
        st.map("Accent.TButton", background=[("active", ACCENT_DARK), ("disabled", "#9fc7e8")])
        st.configure("TEntry", fieldbackground=INPUT_BG, foreground=TEXT, insertcolor=TEXT,
                     bordercolor=BORDER, lightcolor=BORDER, darkcolor=BORDER)
        st.configure("TCombobox", fieldbackground=INPUT_BG, background=INPUT_BG,
                     foreground=TEXT, arrowcolor=TEXT, bordercolor=BORDER)
        st.map("TCombobox", fieldbackground=[("readonly", INPUT_BG)],
               foreground=[("readonly", TEXT)],
               selectbackground=[("readonly", INPUT_BG)],
               selectforeground=[("readonly", TEXT)])
        self.root.option_add("*TCombobox*Listbox.background", INPUT_BG)
        self.root.option_add("*TCombobox*Listbox.foreground", TEXT)
        self.root.option_add("*TCombobox*Listbox.selectBackground", ACCENT)
        self.root.option_add("*TCombobox*Listbox.selectForeground", "#FFFFFF")
        st.configure("TProgressbar", background=ACCENT, troughcolor="#E9EEF8")
        st.configure("TLabelframe", background=SIDEBAR_BG, bordercolor=BORDER)
        st.configure("TLabelframe.Label", background=SIDEBAR_BG, foreground=TEXT, font=FONT_S)
        st.configure("TPanedwindow", background=SIDEBAR_BG)
        st.configure("Sash", background=BORDER)

    def _entry(self, parent, show=None, width=None) -> tk.Entry:
        e = tk.Entry(parent, bg=INPUT_BG, fg=TEXT, insertbackground=TEXT, relief="flat",
                     font=FONT, show=show, highlightthickness=1,
                     highlightbackground=BORDER, highlightcolor=ACCENT)
        if width:
            e.configure(width=width)
        return e

    def _text(self, parent, height=4) -> tk.Text:
        return tk.Text(parent, height=height, bg=INPUT_BG, fg=TEXT, insertbackground=TEXT,
                       relief="flat", font=FONT, wrap="word", padx=8, pady=6,
                       highlightthickness=1, highlightbackground=BORDER, highlightcolor=ACCENT)

    def _small_label(self, parent, text: str) -> tk.Label:
        return tk.Label(parent, text=text, bg=SIDEBAR_BG, fg=SUB, font=FONT_S, anchor="w")

    # --------------------------------------------------------------- titlebar
    def _build_titlebar(self):
        bar = tk.Frame(self.root, bg=TITLE_BG, height=32, highlightthickness=0)
        bar.pack(fill="x", side="top")
        bar.pack_propagate(False)
        tk.Frame(bar, bg=BORDER, height=1).pack(side="bottom", fill="x")

        tk.Label(bar, text="  ◆  ", bg=TITLE_BG, fg=ACCENT, font=("Segoe UI", 11, "bold")).pack(side="left", pady=4)
        tk.Label(bar, text="Eclipsed Asset Studio", bg=TITLE_BG, fg=TEXT, font=FONT_B).pack(side="left")

        for name in ("文件", "编辑", "视图", "帮助"):
            lb = tk.Label(bar, text=name, bg=TITLE_BG, fg=SUB, font=FONT_S, padx=8)
            lb.pack(side="left", padx=(6, 0), pady=6)
            lb.bind("<Enter>", lambda e, w=lb: w.configure(bg="#E9EEF8"))
            lb.bind("<Leave>", lambda e, w=lb: w.configure(bg=TITLE_BG))
            lb.bind("<Button-1>", lambda e, n=name: self._menu_click(n))

        self.provider_chip = tk.Label(bar, text="", bg="#E9EEF8", fg=ACCENT_DARK, font=FONT_S,
                                      padx=8, pady=2)
        self.provider_chip.pack(side="right", padx=(4, 10), pady=6)
        tk.Button(bar, text="设置", command=self.open_settings, bg=TITLE_BG, fg=TEXT,
                  relief="flat", font=FONT_S, padx=10, cursor="hand2").pack(side="right")

    def _menu_click(self, name: str):
        if name == "文件":
            self.open_output()
        elif name == "帮助":
            messagebox.showinfo(APP_TITLE, "Eclipsed Asset Studio\n本地生成 / 抠图 / 拆层 / 切图 / Atlas")
        elif name == "编辑":
            self._show_view("gen")
        else:
            self._show_view("assets")

    # ------------------------------------------------------------------- body
    def _build_body(self):
        body = tk.Frame(self.root, bg=SIDEBAR_BG)
        body.pack(fill="both", expand=True)

        activity = tk.Frame(body, bg=ACTIVITY_BG, width=48)
        activity.pack(side="left", fill="y")
        activity.pack_propagate(False)
        tk.Frame(activity, bg=BORDER, width=1).pack(side="right", fill="y")
        self._build_activity(activity)

        try:
            _ui_scale = max(1.0, min(1.2, self.root.winfo_fpixels("1i") / 96.0))
        except Exception:
            _ui_scale = 1.0
        self.sidebar = tk.Frame(body, bg=SIDEBAR_BG, width=int(332 * _ui_scale))
        self.sidebar.pack(side="left", fill="y")
        self.sidebar.pack_propagate(False)
        tk.Frame(self.sidebar, bg=BORDER, width=1).pack(side="right", fill="y")
        self._build_sidebar(self.sidebar)

        self.main = tk.Frame(body, bg=EDITOR_BG)
        self.main.pack(side="left", fill="both", expand=True)
        self._build_main(self.main)

    def _build_activity(self, parent):
        self.act_buttons = {}
        items = [("gen", "✧", "生成"), ("templates", "▤", "模板"), ("edit", "✎", "编辑"),
                 ("assets", "▦", "素材"), ("quota", "◔", "额度"), ("settings", "⚙", "设置")]
        for key, icon, label in items:
            box = tk.Frame(parent, bg=ACTIVITY_BG, height=58)
            box.pack(fill="x")
            ind = tk.Frame(box, bg=ACTIVITY_BG, width=2)
            ind.pack(side="left", fill="y")
            btn = tk.Label(box, text=icon, bg=ACTIVITY_BG, fg=SUB, font=("Segoe UI", 16))
            btn.pack(pady=(4, 0))
            cap = tk.Label(box, text=label, bg=ACTIVITY_BG, fg=SUB, font=("Microsoft YaHei UI", 8))
            cap.pack()
            for w in (box, btn, cap):
                w.bind("<Button-1>", lambda e, k=key: self._activity(k))
                w.bind("<Enter>", lambda e, b=box: b.configure(bg="#E4E9F5"))
                w.bind("<Leave>", lambda e, b=box: b.configure(bg=ACTIVITY_BG))
            self._tips.append(ToolTip(box, {
                "gen": "生成：文生图 / 图生图",
                "templates": "模板库：角色 / 场景 / UI / 图标 / 运营",
                "assets": "本次结果与输出目录",
                "quota": "额度：本地用量、每日上限、模型自动切换",
                "settings": "设置：API Key、模型、输出目录",
            }.get(key, "")))
            self.act_buttons[key] = (box, ind, btn, cap)
        self._activity_highlight()

    def _activity(self, key: str):
        if key == "settings":
            self.open_settings()
            return
        self._show_view(key)

    def _activity_highlight(self):
        for key, (box, ind, btn, cap) in self.act_buttons.items():
            active = key == self.view
            ind.configure(bg=ACCENT if active else ACTIVITY_BG)
            btn.configure(fg=ACCENT if active else SUB)
            cap.configure(fg=ACCENT if active else SUB)

    def _show_view(self, key: str):
        self.view = key
        self._activity_highlight()
        for name, frame in self.panels.items():
            if name == key:
                frame.pack(fill="both", expand=True)
            else:
                frame.pack_forget()
        self.sidebar_title.config(text={"gen": "生成", "templates": "模板库", "edit": "编辑",
                                        "assets": "素材", "quota": "额度"}.get(key, key))
        if key == "quota":
            self._quota_refresh()
        if key == "edit":
            self._enter_edit()

    # ---------------------------------------------------------------- sidebar
    def _build_sidebar(self, parent):
        head = tk.Frame(parent, bg=SIDEBAR_BG, height=36)
        head.pack(fill="x")
        head.pack_propagate(False)
        self.sidebar_title = tk.Label(head, text="生成", bg=SIDEBAR_BG, fg=TEXT, font=FONT_B)
        self.sidebar_title.pack(side="left", padx=14, pady=8)
        tk.Button(head, text="⋯", bg=SIDEBAR_BG, fg=SUB, relief="flat", font=FONT_B,
                  command=self.open_settings).pack(side="right", padx=8)

        self.panels = {}
        gen = tk.Frame(parent, bg=SIDEBAR_BG)
        templates = tk.Frame(parent, bg=SIDEBAR_BG)
        assets = tk.Frame(parent, bg=SIDEBAR_BG)
        quota = tk.Frame(parent, bg=SIDEBAR_BG)
        editp = tk.Frame(parent, bg=SIDEBAR_BG)
        self.panels["gen"] = gen
        self.panels["templates"] = templates
        self.panels["edit"] = editp
        self.panels["assets"] = assets
        self.panels["quota"] = quota
        self._build_gen_panel(gen)
        self._build_templates_panel(templates)
        self._build_edit_panel(editp)
        self._build_assets_panel(assets)
        self._build_quota_panel(quota)
        self._show_view("gen")

    def _build_gen_panel(self, holder):
        # 可滚动侧边栏，避免小屏/多控件被裁切
        canvas = tk.Canvas(holder, bg=SIDEBAR_BG, highlightthickness=0)
        sb = ttk.Scrollbar(holder, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        canvas.pack(side="left", fill="both", expand=True)
        inner = tk.Frame(canvas, bg=SIDEBAR_BG)
        win = canvas.create_window((0, 0), window=inner, anchor="nw")
        inner.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.bind("<Configure>", lambda e: canvas.itemconfigure(win, width=e.width))
        parent = inner
        pad = {"padx": 14}
        self._small_label(parent, "预设").pack(anchor="w", **pad, pady=(6, 2))
        self.preset = tk.StringVar(value="")
        self.preset_box = ttk.Combobox(parent, textvariable=self.preset, values=preset_names(),
                                       state="readonly")
        self.preset_box.pack(fill="x", **pad, pady=(0, 8))
        self.preset_box.bind("<<ComboboxSelected>>", lambda e: self._apply_preset())

        mrow = tk.Frame(parent, bg=SIDEBAR_BG)
        mrow.pack(fill="x", padx=14, pady=(0, 8))
        tk.Label(mrow, text="模型", bg=SIDEBAR_BG, fg=SUB, font=FONT_S).pack(side="left")
        self.model_var = tk.StringVar(value=self._current_model())
        self.model_box = ttk.Combobox(mrow, textvariable=self.model_var, width=22,
                                      values=static_models(self.cfg))
        self.model_box.pack(side="left", padx=(6, 4), fill="x", expand=True)
        self.model_box.bind("<<ComboboxSelected>>", lambda e: self._on_model_change())
        self.model_box.bind("<FocusOut>", lambda e: self._on_model_change())
        ttk.Button(mrow, text="⟳", width=3, command=self._refresh_models).pack(side="left")
        self._tips.append(ToolTip(self.model_box, "可直接输入模型名；点 ⟳ 从服务端拉取可用列表"))

        # 大块拖拽上传区
        self.drop = tk.Canvas(parent, height=118, bg="#FFFFFF", highlightthickness=0,
                              cursor="hand2")
        self.drop.pack(fill="x", padx=14, pady=(0, 10))
        self.drop.bind("<Button-1>", lambda e: self._upload_refs())
        self.drop.bind("<Configure>", lambda e: self._render_dropzone())
        self.drop.bind("<Enter>", lambda e: self._drop_hover(True))
        self.drop.bind("<Leave>", lambda e: self._drop_hover(False))
        if HAVE_DND:
            try:
                self.drop.drop_target_register(DND_FILES)
                self.drop.dnd_bind("<<Drop>>", self._on_drop)
                self.drop.dnd_bind("<<DragEnter>>", lambda e: self._drop_hover(True))
                self.drop.dnd_bind("<<DragLeave>>", lambda e: self._drop_hover(False))
            except Exception:
                pass
        self._drop_img = None
        self._drop_active = False
        self._tips.append(ToolTip(self.drop, "点击选择，或把 JPG/PNG/WebP 直接拖进来（最多 3 张）"))

        self._small_label(parent, "画面描述").pack(anchor="w", **pad)
        self.prompt = self._text(parent, height=4)
        self.prompt.pack(fill="x", **pad, pady=(2, 2))
        self.prompt.insert("1.0", self.cfg.get("last_prompt", ""))
        tk.Label(parent, text="例：一只蹲在宝箱上的青绿色小龙，暗金古风，透明背景",
                 bg=SIDEBAR_BG, fg="#7A8296", font=("Microsoft YaHei UI", 8),
                 anchor="w", justify="left", wraplength=300).pack(fill="x", padx=14, pady=(0, 6))

        self._small_label(parent, "负面词").pack(anchor="w", **pad)
        self.negative = self._entry(parent)
        self.negative.pack(fill="x", **pad, pady=(2, 6))
        self.negative.insert(0, self.cfg.get("negative", ""))

        # 图推词 / 扩写
        toggles = tk.Frame(parent, bg=SIDEBAR_BG)
        toggles.pack(fill="x", padx=14, pady=(0, 6))
        self.autotag_var = tk.BooleanVar(value=False)
        self.expand_var = tk.BooleanVar(value=False)
        cb1 = tk.Checkbutton(toggles, text="图推词", variable=self.autotag_var,
                             bg=SIDEBAR_BG, fg=TEXT, selectcolor=INPUT_BG,
                             activebackground=SIDEBAR_BG, font=FONT_S,
                             command=self._on_toggle_autotag)
        cb1.pack(side="left")
        cb2 = tk.Checkbutton(toggles, text="扩写", variable=self.expand_var,
                             bg=SIDEBAR_BG, fg=TEXT, selectcolor=INPUT_BG,
                             activebackground=SIDEBAR_BG, font=FONT_S)
        cb2.pack(side="left", padx=(12, 0))
        tk.Label(toggles, text="小助手", bg=SIDEBAR_BG, fg="#7A8296",
                 font=("Microsoft YaHei UI", 8)).pack(side="right")
        self._tips.append(ToolTip(cb1, "从参考图自动提取构图/色调/透明背景等描述，填入画面描述"))
        self._tips.append(ToolTip(cb2, "生成前自动补充画质、光照、无文字等约束"))

        row = tk.Frame(parent, bg=SIDEBAR_BG)
        row.pack(fill="x", **pad, pady=(0, 6))
        tk.Label(row, text="尺寸", bg=SIDEBAR_BG, fg=SUB, font=FONT_S).pack(side="left")
        self.size_var = tk.StringVar(value=str(self.cfg.get("size", 1024)))
        self.size = tk.Spinbox(row, textvariable=self.size_var, values=("512", "768", "1024", "1536"),
                               width=6, state="readonly", bg=INPUT_BG, fg=TEXT,
                               readonlybackground=INPUT_BG, relief="flat", font=FONT,
                               highlightthickness=1, highlightbackground=BORDER)
        self.size.pack(side="left", padx=(6, 12))
        tk.Label(row, text="数量", bg=SIDEBAR_BG, fg=SUB, font=FONT_S).pack(side="left")
        self.count = tk.Spinbox(row, from_=1, to=6, width=3, bg=INPUT_BG, fg=TEXT,
                                relief="flat", font=FONT, buttonbackground="#EFE5D7",
                                highlightthickness=1, highlightbackground=BORDER)
        self.count.delete(0, "end"); self.count.insert(0, str(self.cfg.get("count", 2)))
        self.count.pack(side="left", padx=6)
        tk.Label(row, text="比例", bg=SIDEBAR_BG, fg=SUB, font=FONT_S).pack(side="left", padx=(10, 0))
        self.ratio_var = tk.StringVar(value=str(self.cfg.get("ratio", "1:1")))
        self.ratio = ttk.Combobox(row, textvariable=self.ratio_var, state="readonly", width=8,
                                  values=["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "9:16 高清"])
        self.ratio.pack(side="left", padx=(6, 0))

        self.gen_btn = ttk.Button(parent, text="生成图片", style="Accent.TButton",
                                  command=self.on_generate)
        self.gen_btn.pack(fill="x", **pad, pady=(2, 8))

        tk.Frame(parent, bg=BORDER, height=1).pack(fill="x", padx=14, pady=2)

        self._small_label(parent, "后处理 / 交付").pack(anchor="w", **pad, pady=(2, 2))
        grid = tk.Frame(parent, bg=SIDEBAR_BG)
        grid.pack(fill="x", padx=10)
        actions = [("抠图（AI 透明）", self.on_matte), ("超分 2x（AI）", self.on_upscale),
                   ("拆图层", self.on_layers), ("雪碧图切分", self.on_slice),
                   ("导出 Atlas", self.on_atlas)]
        for i, (text, cmd) in enumerate(actions):
            b = ttk.Button(grid, text=text, command=cmd)
            b.grid(row=i // 2, column=i % 2, sticky="ew", padx=4, pady=2)
            tip = {
                "抠图（AI 透明）": "BiRefNet 去背景，输出透明 PNG；复杂边缘比纯色算法稳。",
                "超分 2x（AI）": "Real-ESRGAN 2x 放大；CPU 单张约 1–3 分钟。",
                "拆图层": "按 alpha 连通域拆成独立图层；不透明图会先 AI 抠图。",
                "雪碧图切分": "按行/列切分网格图，自动裁透明边，适合动作帧。",
                "导出 Atlas": "打包图集并生成 9-slice 的 atlas.json，供 Cocos 使用。",
            }.get(text, "")
            if tip:
                self._tips.append(ToolTip(b, tip))
        grid.columnconfigure(0, weight=1); grid.columnconfigure(1, weight=1)

        sheet = tk.Frame(parent, bg=SIDEBAR_BG)
        sheet.pack(fill="x", padx=14, pady=(4, 2))
        tk.Label(sheet, text="切图 行", bg=SIDEBAR_BG, fg=SUB, font=FONT_S).pack(side="left")
        self.rows = tk.Spinbox(sheet, from_=1, to=20, width=3, bg=INPUT_BG, fg=TEXT,
                               relief="flat", font=FONT, buttonbackground="#EFE5D7",
                               highlightthickness=1, highlightbackground=BORDER)
        self.rows.delete(0, "end"); self.rows.insert(0, "3"); self.rows.pack(side="left", padx=(4, 8))
        tk.Label(sheet, text="列", bg=SIDEBAR_BG, fg=SUB, font=FONT_S).pack(side="left")
        self.cols = tk.Spinbox(sheet, from_=1, to=20, width=3, bg=INPUT_BG, fg=TEXT,
                               relief="flat", font=FONT, buttonbackground="#EFE5D7",
                               highlightthickness=1, highlightbackground=BORDER)
        self.cols.delete(0, "end"); self.cols.insert(0, "3"); self.cols.pack(side="left", padx=(4, 8))
        tk.Label(sheet, text="边距", bg=SIDEBAR_BG, fg=SUB, font=FONT_S).pack(side="left")
        self.pad = tk.Spinbox(sheet, from_=0, to=64, width=3, bg=INPUT_BG, fg=TEXT,
                              relief="flat", font=FONT, buttonbackground="#EFE5D7",
                              highlightthickness=1, highlightbackground=BORDER)
        self.pad.delete(0, "end"); self.pad.insert(0, "0"); self.pad.pack(side="left", padx=4)

        self.progress = ttk.Progressbar(parent, mode="indeterminate")

    def _build_templates_panel(self, parent):
        self.tpl_cat = "全部"
        self.tpl_selected = None
        bar = tk.Frame(parent, bg=SIDEBAR_BG)
        bar.pack(fill="x", padx=10, pady=(6, 2))
        for cat in CATS:
            b = tk.Button(bar, text=cat, bg=BTN_BG if cat != self.tpl_cat else "#DCE3F5",
                          fg=TEXT, relief="flat", font=("Microsoft YaHei UI", 8),
                          padx=6, pady=2,
                          command=lambda c=cat: self._tpl_filter(c))
            b.pack(side="left", padx=2, pady=2)

        wrap = tk.Frame(parent, bg=SIDEBAR_BG)
        wrap.pack(fill="both", expand=True, padx=(10, 4), pady=(2, 4))
        self.tpl_canvas = tk.Canvas(wrap, bg=SIDEBAR_BG, highlightthickness=0)
        sb = ttk.Scrollbar(wrap, orient="vertical", command=self.tpl_canvas.yview)
        self.tpl_canvas.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        self.tpl_canvas.pack(side="left", fill="both", expand=True)
        self.tpl_inner = tk.Frame(self.tpl_canvas, bg=SIDEBAR_BG)
        self.tpl_canvas.create_window((0, 0), window=self.tpl_inner, anchor="nw")
        self.tpl_inner.bind("<Configure>", lambda e: self.tpl_canvas.configure(
            scrollregion=self.tpl_canvas.bbox("all")))

        self.tpl_info = tk.Label(parent, text="选择一个模板", bg=SIDEBAR_BG, fg=SUB,
                                 font=FONT_S, wraplength=300, justify="left", anchor="w")
        self.tpl_info.pack(fill="x", padx=14, pady=(2, 4))
        btns = tk.Frame(parent, bg=SIDEBAR_BG)
        btns.pack(fill="x", padx=14, pady=(0, 10))
        ttk.Button(btns, text="应用参数", command=self._tpl_apply).pack(side="left")
        ttk.Button(btns, text="执行模板", style="Accent.TButton",
                   command=self._tpl_run).pack(side="right")
        self._tpl_refresh()

    def _tpl_filter(self, cat: str):
        self.tpl_cat = cat
        self._tpl_refresh()

    def _tpl_refresh(self):
        for w in self.tpl_inner.winfo_children():
            w.destroy()
        for t in by_cat(self.tpl_cat):
            sel = self.tpl_selected and self.tpl_selected["id"] == t["id"]
            b = tk.Button(
                self.tpl_inner,
                text=f"{t['name']}\n{t['desc']}" + ("  ⚠需参考图" if t.get("ref") else ""),
                anchor="w", justify="left", wraplength=300, font=("Microsoft YaHei UI", 9),
                bg="#E9EEF8" if sel else INPUT_BG, fg=TEXT, activebackground="#E9EEF8",
                relief="flat", padx=8, pady=6,
                command=lambda tpl=t: self._tpl_pick(tpl),
            )
            b.pack(fill="x", pady=2, padx=2)

    def _upload_refs(self):
        files = filedialog.askopenfilenames(
            title="选择参考图（最多 3 张）",
            filetypes=[("图片", "*.png *.jpg *.jpeg *.webp"), ("全部", "*.*")])
        if not files:
            return
        for f in files:
            if f not in self.ref_paths:
                self.ref_paths.append(f)
        self.ref_paths = self.ref_paths[:3]
        self._update_ref_label()
        self._log(f"参考图 {len(self.ref_paths)} 张：" + ", ".join(Path(p).name for p in self.ref_paths))

    def _clear_refs(self):
        self.ref_paths = []
        self._update_ref_label()
        self._log("已清除参考图")

    def _update_ref_label(self):
        n = len(self.ref_paths)
        self._gen_label = "图生图生成" if n else "生成图片"
        if not self.busy:
            self.gen_btn.config(text=self._gen_label)
        self._render_dropzone()

    def _drop_hover(self, active: bool):
        self._drop_active = active
        self._render_dropzone()

    def _render_dropzone(self):
        c = self.drop
        if c is None:
            return
        c.delete("all")
        w = max(100, c.winfo_width())
        h = max(80, c.winfo_height())
        edge = ACCENT if self._drop_active else "#C9D3E6"
        c.create_rectangle(4, 4, w - 4, h - 4, outline=edge, width=2, dash=(6, 4))
        if self.ref_paths:
            try:
                im = Image.open(self.ref_paths[0]).convert("RGBA")
                im.thumbnail((h - 34, h - 34))
                self._drop_img = ImageTk.PhotoImage(im)
                c.create_image(14 + im.width // 2, h // 2, image=self._drop_img)
            except Exception:
                pass
            n = len(self.ref_paths)
            c.create_text(130, h // 2 - 12, anchor="w", fill=TEXT, font=FONT_B,
                          text=f"已添加 {n} 张参考图")
            c.create_text(130, h // 2 + 12, anchor="w", fill=SUB, font=FONT_S,
                          text="点击更换 · 拖入添加")
        else:
            c.create_text(w // 2, h // 2 - 14, text="↑", fill=ACCENT, font=("Segoe UI", 18))
            c.create_text(w // 2, h // 2 + 20, text="点击或拖入参考图",
                          fill=TEXT, font=("Microsoft YaHei UI", 11, "bold"))

    def _on_drop(self, event):
        try:
            paths = self.root.tk.splitlist(event.data)
        except Exception:
            paths = str(event.data).split()
        allowed = {".png", ".jpg", ".jpeg", ".webp"}
        added = []
        for raw in paths:
            p = Path(raw.strip("{}"))
            if p.suffix.lower() in allowed and p.exists():
                if str(p) not in self.ref_paths:
                    self.ref_paths.append(str(p))
                added.append(p.name)
        self.ref_paths = self.ref_paths[:3]
        self._drop_hover(False)
        self._update_ref_label()
        if added:
            self._log("拖入参考图：" + ", ".join(added))
            if self.autotag_var.get():
                self._autotag_prompt()

    def _on_toggle_autotag(self):
        if self.autotag_var.get():
            self._autotag_prompt()

    @staticmethod
    def _describe_image(path: str) -> str:
        im = Image.open(path).convert("RGBA")
        w, h = im.size
        parts = ["竖版构图" if h > w * 1.2 else ("横版构图" if w > h * 1.2 else "方形构图")]
        a = im.getchannel("A")
        if a.getextrema()[0] < 250:
            parts.append("透明背景")
        rgb = im.convert("RGB").resize((48, 48))
        px = list(rgb.getdata())
        avg = tuple(sum(c[i] for c in px) // len(px) for i in range(3))
        if sum(avg) / 3 < 85:
            parts.append("暗色调")
        elif sum(avg) / 3 > 190:
            parts.append("明亮色调")
        else:
            parts.append("中间调")
        names = []
        for c in rgb.getcolors(48 * 48)[:3]:
            r, g, b = c[1]
            if r > 150 and g > 110 and b < 90:
                names.append("金色")
            elif r > 120 and g < 90 and b < 90:
                names.append("红色")
            elif b > 120 and r < 90:
                names.append("蓝色")
            elif g > 110 and r < 110:
                names.append("绿色")
            elif abs(r - g) < 25 and abs(g - b) < 25:
                names.append("灰白" if r > 150 else "深灰")
        parts.append("主体居中")
        if names:
            parts.append("色调：" + "、".join(dict.fromkeys(names)))
        return "，".join(parts)

    def _autotag_prompt(self):
        if not self.ref_paths:
            return
        try:
            desc = self._describe_image(self.ref_paths[0])
            cur = self.prompt.get("1.0", "end").strip()
            self.prompt.delete("1.0", "end")
            self.prompt.insert("1.0", (cur + "，" + desc) if cur else desc)
            self._log("图推词：" + desc)
        except Exception as e:
            self._log(f"图推词失败：{e}")

    def _tpl_pick(self, t: dict):
        self.tpl_selected = t
        self._tpl_apply()
        self._tpl_refresh()
        tag = "（需参考图/编辑模型）" if t.get("ref") else ""
        self.tpl_info.config(text=f"已选：{t['name']} {tag}\n{t['desc']}")
        self._log(f"模板：{t['name']} · 比例 {t['ratio']} · 步骤 {t.get('steps') or '仅生成'}")

    def _tpl_apply(self):
        t = self.tpl_selected
        if not t:
            return
        self.prompt.delete("1.0", "end")
        self.prompt.insert("1.0", t["prompt"])
        self.negative.delete(0, "end")
        self.negative.insert(0, t["neg"])
        self.ratio_var.set(t["ratio"])
        self.size_var.set("1024")

    def _tpl_run(self):
        t = self.tpl_selected
        if not t:
            messagebox.showinfo(APP_TITLE, "先在列表里选一个模板")
            return
        if t.get("ref") and not self.ref_paths:
            messagebox.showinfo(
                APP_TITLE,
                "该模板需要参考图：先点「上传参考图」，\n再执行；描述里写清楚要改什么。")
            return
        self._tpl_apply()
        self._run(lambda: self._tpl_job(t), f"执行模板：{t['name']}")

    def _tpl_job(self, t: dict):
        prompt, neg, size, count, ratio = self._collect_prompt()
        count = min(max(1, count), 2)
        refs = list(self.ref_paths)

        def prog(m):
            self.root.after(0, lambda: self._log(m))

        paths = self.pipe.generate(prompt, neg, size, count, ratio=ratio, refs=refs, progress=prog)
        outs = list(paths)
        src = paths[0]
        steps = t.get("steps") or []
        if "matte" in steps:
            src = self.pipe.matte(src)
            outs.append(src)
        if "layers" in steps:
            outs += self.pipe.layers(src)
        for step in steps:
            if isinstance(step, str) and step.startswith("slice:"):
                rows, cols = step.split(":")[1].split("x")
                outs += self.pipe.slice_sheet(src, int(rows), int(cols))
        self.root.after(0, lambda: self._add_results(outs, f"模板完成：{t['name']}"))

    def _build_quota_panel(self, parent):
        tk.Label(parent, text="接口额度 / 模型切换", bg=SIDEBAR_BG, fg=TEXT,
                 font=FONT_B).pack(anchor="w", padx=14, pady=(8, 2))
        self.quota_total_lb = tk.Label(parent, text="", bg=SIDEBAR_BG, fg=SUB, font=FONT_S)
        self.quota_total_lb.pack(anchor="w", padx=14)

        self.auto_switch_var = tk.BooleanVar(value=bool(self.cfg.get("auto_switch", True)))
        tk.Checkbutton(parent, text="模型不可用/超额时自动切换", variable=self.auto_switch_var,
                       bg=SIDEBAR_BG, fg=TEXT, selectcolor=INPUT_BG, activebackground=SIDEBAR_BG,
                       font=FONT_S, command=self._quota_toggle).pack(anchor="w", padx=10, pady=(6, 2))

        lim = tk.Frame(parent, bg=SIDEBAR_BG)
        lim.pack(fill="x", padx=14, pady=(4, 4))
        tk.Label(lim, text="每日上限", bg=SIDEBAR_BG, fg=SUB, font=FONT_S).pack(side="left")
        self.limit_var = tk.StringVar(value=str(self.cfg.get("daily_limit", 0)))
        tk.Entry(lim, textvariable=self.limit_var, width=6, bg=INPUT_BG, fg=TEXT,
                 relief="flat", font=FONT_S, highlightthickness=1,
                 highlightbackground=BORDER).pack(side="left", padx=6)
        tk.Label(lim, text="0=不限", bg=SIDEBAR_BG, fg=SUB,
                 font=("Microsoft YaHei UI", 8)).pack(side="left")
        ttk.Button(lim, text="应用", width=5, command=self._quota_apply_limit).pack(side="right")

        tk.Frame(parent, bg=BORDER, height=1).pack(fill="x", padx=14, pady=4)
        self.quota_rows = tk.Frame(parent, bg=SIDEBAR_BG)
        self.quota_rows.pack(fill="both", expand=True, padx=10, pady=(2, 2))

        btns = tk.Frame(parent, bg=SIDEBAR_BG)
        btns.pack(fill="x", padx=14, pady=(2, 4))
        ttk.Button(btns, text="刷新可用模型", command=self._quota_fetch_models).pack(fill="x", pady=2)
        ttk.Button(btns, text="恢复全部模型", command=self._quota_restore).pack(fill="x", pady=2)
        ttk.Button(btns, text="重置今日计数", command=self._quota_reset).pack(fill="x", pady=2)
        tk.Label(parent, text="注：云端剩余额度不公开；这里显示本地调用次数与自设上限，\n模型不可用时自动降级切换。",
                 bg=SIDEBAR_BG, fg=SUB, font=("Microsoft YaHei UI", 8),
                 justify="left", wraplength=300).pack(anchor="w", padx=14, pady=(2, 8))

    def _quota_refresh(self):
        for w in self.quota_rows.winfo_children():
            w.destroy()
        provider = self.cfg.get("provider", "mock")
        self.quota_total_lb.config(text=f"provider={provider} · 今日请求 {usage.total(provider)} 次")
        if provider != "doubao":
            tk.Label(self.quota_rows, text="当前非豆包后端，无模型切换列表。",
                     bg=SIDEBAR_BG, fg=SUB, font=FONT_S).pack(anchor="w", padx=4, pady=8)
            return
        for m in usage.get_models():
            row = tk.Frame(self.quota_rows, bg=INPUT_BG)
            row.pack(fill="x", pady=2)
            unavail = usage.is_unavailable(m)
            exh = usage.exhausted(self.cfg, "doubao", m)
            status = "不可用" if unavail else ("额度用完" if exh else "可用")
            color = "#c0392b" if (unavail or exh) else "#1e7e34"
            tk.Label(row, text=m, bg=INPUT_BG, fg=TEXT,
                     font=("Consolas", 8), anchor="w").pack(side="left", padx=6)
            tk.Label(row, text=status, bg=INPUT_BG, fg=color,
                     font=("Microsoft YaHei UI", 8)).pack(side="right", padx=6)
            lim = usage.limit_of(self.cfg, "doubao", m)
            limtxt = f"/{lim}" if lim else "/∞"
            tk.Label(row, text=f"{usage.used('doubao', m)}{limtxt}", bg=INPUT_BG, fg=SUB,
                     font=("Consolas", 8)).pack(side="right", padx=4)

    def _quota_toggle(self):
        self.cfg["auto_switch"] = bool(self.auto_switch_var.get())
        save_config(self.cfg)
        self._log("自动切换：" + ("开" if self.cfg["auto_switch"] else "关"))

    def _quota_apply_limit(self):
        try:
            self.cfg["daily_limit"] = max(0, int(self.limit_var.get() or 0))
            save_config(self.cfg)
            self._quota_refresh()
            self._log(f"每日上限：{self.cfg['daily_limit'] or '不限'}")
        except Exception as e:
            messagebox.showerror(APP_TITLE, f"上限格式错误：{e}")

    def _quota_fetch_models(self):
        if self.cfg.get("provider") != "doubao":
            messagebox.showinfo(APP_TITLE, "仅豆包后端支持模型列表刷新")
            return

        def job():
            import requests
            base = (self.cfg.get("doubao_base") or "").rstrip("/")
            r = requests.get(base + "/models",
                             headers={"Authorization": "Bearer " + self.cfg["doubao_api_key"]},
                             timeout=30)
            if r.status_code >= 400:
                raise RuntimeError(f"拉取模型失败 {r.status_code}: {r.text[:200]}")
            active, retiring = [], []
            for m in r.json().get("data") or []:
                mid = m.get("id", "")
                if "seedream" not in mid or m.get("status") == "Shutdown":
                    continue
                (retiring if m.get("status") == "Retiring" else active).append(mid)
            models = active + retiring
            usage.set_models(models)
            self.root.after(0, self._quota_refresh)
            self.root.after(0, lambda: self._log(f"可用模型：{', '.join(models)}"))

        self._run(job, "刷新模型列表…")

    def _quota_restore(self):
        d = usage.load()
        d["unavailable"] = {}
        usage.save(d)
        self._quota_refresh()
        self._log("已恢复全部模型（清除不可用标记）")

    def _quota_reset(self):
        usage.reset_today()
        self._quota_refresh()
        self._log("已重置今日计数")

    def _build_assets_panel(self, parent):
        tk.Label(parent, text="本次结果", bg=SIDEBAR_BG, fg=SUB, font=FONT_S).pack(anchor="w", padx=14, pady=(8, 4))
        self.asset_list = tk.Listbox(parent, bg=INPUT_BG, fg=TEXT, relief="flat", font=FONT_S,
                                     highlightthickness=1, highlightbackground=BORDER,
                                     selectbackground="#DCE3F5", selectforeground=TEXT)
        self.asset_list.pack(fill="both", expand=True, padx=14, pady=(0, 8))
        self.asset_list.bind("<<ListboxSelect>>", lambda e: self._asset_pick())
        ttk.Button(parent, text="打开输出目录", command=self.open_output).pack(fill="x", padx=14, pady=(0, 6))
        ttk.Button(parent, text="清空列表", command=self._clear_results).pack(fill="x", padx=14, pady=(0, 12))

    def _asset_pick(self):
        sel = self.asset_list.curselection()
        if not sel:
            return
        idx = int(sel[0])
        if 0 <= idx < len(self.results):
            self._select(self.results[idx])

    # ------------------------------------------------------------------- main
    def _build_main(self, parent):
        parent.grid_rowconfigure(2, weight=1)
        parent.grid_columnconfigure(0, weight=1)
        tabs = tk.Frame(parent, bg="#F6EFE5", height=34)
        tabs.grid(row=0, column=0, sticky="ew")
        tabs.pack_propagate(False)
        tab = tk.Frame(tabs, bg=EDITOR_BG, highlightthickness=0)
        tab.pack(side="left", fill="y")
        tk.Label(tab, text="  预览  ", bg=EDITOR_BG, fg=TEXT, font=FONT).pack(side="left", pady=8)
        tk.Frame(tab, bg=ACCENT, height=2).pack(side="bottom", fill="x")
        self.tab_info = tk.Label(tabs, text="", bg="#F6EFE5", fg=SUB, font=FONT_S)
        self.tab_info.pack(side="left", padx=12)
        self.sel_badge = tk.Label(tabs, text="", bg="#E9EEF8", fg=ACCENT_DARK, font=FONT_S,
                                  padx=8, pady=1)
        self.sel_badge.pack(side="right", padx=10)
        tk.Frame(parent, bg=BORDER, height=1).grid(row=1, column=0, sticky="ew")

        self.preview = tk.Canvas(parent, bg="#F8FAFF", highlightthickness=0, cursor="none")
        self.preview.grid(row=2, column=0, sticky="nsew", padx=16, pady=(10, 4))
        self.preview.bind("<Configure>", lambda e: self._render_preview())
        self.preview.bind("<MouseWheel>", self._on_wheel)
        self.preview.bind("<Button-4>", lambda e: self._zoom_at(1.12))
        self.preview.bind("<Button-5>", lambda e: self._zoom_at(1 / 1.12))
        self.preview.bind("<Motion>", self._on_motion)
        self.preview.bind("<Enter>", self._on_preview_enter)
        self.preview.bind("<Leave>", self._on_preview_leave)
        self.preview.bind("<ButtonPress-1>", self._on_press)
        self.preview.bind("<B1-Motion>", self._on_drag)
        self.preview.bind("<ButtonRelease-1>", self._on_release)
        self.preview.bind("<Double-Button-1>", lambda e: self._reset_view())
        self.preview.bind("<Button-3>", self._on_right)

        hint = tk.Frame(parent, bg="#FFFFFF", height=30)
        hint.grid(row=3, column=0, sticky="ew", padx=16, pady=(0, 8))
        hint.pack_propagate(False)
        tk.Label(hint, text="滚轮缩放 · 拖拽平移 · 左键使用 · 右键功能菜单 · 双击复位",
                 bg="#FFFFFF", fg=SUB, font=("Microsoft YaHei UI", 8)).pack(side="left")
        self.zoom_lb = tk.Label(hint, text="100%", bg="#FFFFFF", fg=SUB,
                                font=("Consolas", 9))
        self.zoom_lb.pack(side="right")

        strip = tk.Frame(parent, bg="#FFFFFF", height=124)
        strip.grid(row=4, column=0, sticky="ew")
        strip.pack_propagate(False)
        tk.Frame(strip, bg=BORDER, height=1).pack(fill="x")
        self.thumb_canvas = tk.Canvas(strip, bg="#FFFFFF", height=112, highlightthickness=0)
        self.thumb_canvas.pack(side="left", fill="x", expand=True, padx=6, pady=2)
        sb = ttk.Scrollbar(strip, orient="horizontal", command=self.thumb_canvas.xview)
        sb.pack(side="bottom", fill="x")
        self.thumb_canvas.configure(xscrollcommand=sb.set)
        self.thumb_frame = tk.Frame(self.thumb_canvas, bg="#FFFFFF")
        self.thumb_canvas.create_window((0, 0), window=self.thumb_frame, anchor="nw")
        self.thumb_frame.bind("<Configure>", lambda e: self.thumb_canvas.configure(
            scrollregion=self.thumb_canvas.bbox("all")))

    # -------------------------------------------------------------- bottom/log
    def _build_bottom_panel(self):
        wrap = tk.Frame(self.root, bg=PANEL_BG, height=112)
        wrap.pack(fill="x", side="bottom")
        wrap.pack_propagate(False)
        tk.Frame(wrap, bg=BORDER, height=1).pack(fill="x")
        bar = tk.Frame(wrap, bg=PANEL_BG, height=28)
        bar.pack(fill="x")
        bar.pack_propagate(False)
        tk.Label(bar, text="输出", bg=PANEL_BG, fg=TEXT, font=FONT_S).pack(side="left", padx=14)
        self.problem_lb = tk.Label(bar, text="问题 0", bg=PANEL_BG, fg=SUB, font=FONT_S)
        self.problem_lb.pack(side="left", padx=10)
        tk.Label(bar, text="清空", bg=PANEL_BG, fg=SUB, font=FONT_S, cursor="hand2").pack(side="right", padx=12)
        tk.Frame(bar, bg=BORDER, height=1).pack(fill="x", side="bottom")

        self.log = tk.Text(wrap, bg=LOG_BG, fg="#444444", relief="flat",
                           font=FONT_MONO, padx=10, pady=6, state="disabled", wrap="none")
        self.log.pack(fill="both", expand=True)

    def _build_statusbar(self):
        bar = tk.Frame(self.root, bg=STATUS_BG, height=24)
        bar.pack(fill="x", side="bottom")
        bar.pack_propagate(False)
        self.status_left = tk.Label(bar, text="", bg=STATUS_BG, fg=STATUS_FG, font=FONT_S)
        self.status_left.pack(side="left", padx=10)
        self.status_right = tk.Label(bar, text="", bg=STATUS_BG, fg=STATUS_FG, font=FONT_S)
        self.status_right.pack(side="right", padx=10)

    # ------------------------------------------------------------------- util
    def _log(self, msg: str):
        self.log.configure(state="normal")
        self.log.insert("end", msg + "\n")
        self.log.see("end")
        self.log.configure(state="disabled")

    def _set_status(self, msg: str):
        self.status_right.config(text=msg)

    def _toast(self, text: str, kind: str = "info", hold: int = 1900):
        if self._toast_obj is not None:
            try:
                self._toast_obj.frame.destroy()
            except Exception:
                pass
        self._toast_obj = Toast(self.root, text, kind, hold)

    def _refresh_provider(self):
        kind = self.cfg.get("provider", "mock")
        name = {"mock": "Mock 离线", "doubao": "豆包 Seedream",
                "dashscope": "百炼 DashScope", "openai": "OpenAI 兼容"}.get(kind, kind)
        model = (self.cfg.get(f"{kind}_model") or "").strip()
        model_txt = f" · {model}" if model else ""
        n = usage.total(kind)
        self.provider_chip.config(text="● " + name + model_txt)
        self.status_left.config(text=f"  {name}{model_txt}  |  今日 {n} 次")

    def _run(self, fn, busy_text: str):
        if self.busy:
            return
        self.busy = True
        self.gen_btn.state(["disabled"])
        self._start_busy(busy_text)
        self.progress.pack(fill="x", padx=14, pady=(0, 6))
        self.progress.start(12)
        self._set_status(busy_text)

        def worker():
            try:
                fn()
            except Exception as e:
                err = str(e)
                tb = traceback.format_exc()
                self.root.after(0, lambda: self._on_error(err, tb))
            finally:
                self.root.after(0, self._on_done)

        threading.Thread(target=worker, daemon=True).start()

    def _start_busy(self, text: str):
        if self._busy_after:
            self.root.after_cancel(self._busy_after)
            self._busy_after = None
        base = text.rstrip("…· ").strip() or "处理中"
        n = {"i": 0}

        def tick():
            self._busy_after = None
            try:
                self.gen_btn.config(text=base + "·" * (n["i"] % 4))
            except tk.TclError:
                return
            n["i"] += 1
            self._busy_after = self.root.after(320, tick)

        tick()

    def _play_intro(self):
        if self.current_img is None:
            return
        self._intro = 0.93

        def frame(t):
            self._intro = lerp(0.93, 1.0, t)
            self._render_preview(fast=True)

        def done():
            self._intro = 1.0
            self._render_preview()

        animate(self.root, 180, frame, done)

    def _on_done(self):
        self.busy = False
        if self._busy_after:
            self.root.after_cancel(self._busy_after)
            self._busy_after = None
        try:
            self.gen_btn.config(text=self._gen_label)
        except tk.TclError:
            pass
        self.progress.stop()
        self.progress.pack_forget()
        self.gen_btn.state(["!disabled"])

    def _on_error(self, msg: str, tb: str):
        self._log("错误：" + msg)
        self._log(tb)
        self._set_status("出错，见输出面板")
        self._toast(msg[:60], "error")
        messagebox.showerror(APP_TITLE, msg)

    def _collect_prompt(self):
        return (self.prompt.get("1.0", "end").strip(),
                self.negative.get().strip(),
                int(self.size_var.get() or 1024),
                int(self.count.get() or 1),
                self.ratio_var.get() or "1:1")

    def _current_model(self) -> str:
        kind = (self.cfg.get("provider") or "mock").lower()
        return str(self.cfg.get(f"{kind}_model", "") or "")

    def _save_model(self):
        kind = (self.cfg.get("provider") or "mock").lower()
        self.cfg[f"{kind}_model"] = self.model_var.get().strip()
        save_config(self.cfg)
        self._refresh_provider()

    def _on_model_change(self):
        if not hasattr(self, "model_var"):
            return
        self._save_model()
        self._log("模型切换：" + (self.model_var.get() or "（空）"))

    def _refresh_models(self):
        def job():
            models = list_models(self.cfg)
            def apply():
                self.model_box["values"] = models
                if models and not self.model_var.get():
                    self.model_var.set(models[0])
                    self._save_model()
                self._log(f"可用模型 {len(models)} 个：{', '.join(models[:6])}")
            self.root.after(0, apply)
        self._run(job, "拉取模型列表…")

    def _apply_preset(self):
        p = by_name(self.preset.get())
        self.prompt.delete("1.0", "end")
        self.prompt.insert("1.0", p["prompt"])
        self.negative.delete(0, "end")
        self.negative.insert(0, p["negative"])
        self.size_var.set(str(p["size"]))
        self.ratio_var.set(p.get("ratio", "1:1"))
        self._log(f"已应用预设：{p['name']}")

    # ---------------------------------------------------------------- generate
    def on_generate(self):
        prompt, neg, size, count, ratio = self._collect_prompt()
        if self.expand_var.get() and prompt:
            prompt = prompt + "，高细节，统一光照，清晰轮廓，游戏资产，居中构图，无文字"
            self._log("已扩写画面描述")
        if not prompt:
            messagebox.showinfo(APP_TITLE, "先写提示词")
            return
        if (self.cfg.get("provider") == "doubao") and ratio == "1:1" and size < 1024:
            size = 1024
            self.size_var.set("1024")
            self._log("豆包 Seedream 最小 960×960，尺寸已自动调整为 1024。")
        self.cfg.update({"last_prompt": prompt, "negative": neg, "size": size,
                         "count": count, "ratio": ratio})
        if not self.demo_mode:
            save_config(self.cfg)
        refs = list(self.ref_paths)
        self._run(lambda: self._do_generate(prompt, neg, size, count, ratio, refs), "生成中…")

    def _do_generate(self, prompt, neg, size, count, ratio, refs=None):
        def prog(m):
            self.root.after(0, lambda: self._log(m))
        paths = self.pipe.generate(prompt, neg, size, count, ratio=ratio, refs=refs, progress=prog)
        self.root.after(0, lambda: self._add_results(paths, "生成完成"))

    def _add_results(self, paths, note=""):
        for p in paths:
            if p not in self.results:
                self.results.append(p)
        self._refresh_thumbs()
        self._refresh_asset_list()
        if paths:
            self._select(paths[0])
            self._play_intro()
        if note:
            self._toast(f"{note} · {len(self.results)} 个结果", "success")
        self._set_status(f"{note} · 共 {len(self.results)} 个结果")
        self.tab_info.config(text=f"{len(self.results)} 个结果")
        self._log(f"{note}: " + ", ".join(p.name for p in paths))
        self._refresh_provider()

    def _clear_results(self):
        self.results = []
        self.selected = None
        self.current_img = None
        self.zoom = 1.0
        self.pan_x = self.pan_y = 0.0
        if hasattr(self, "sel_badge"):
            self.sel_badge.config(text="")
        if hasattr(self, "tab_info"):
            self.tab_info.config(text="")
        self._refresh_thumbs()
        self._refresh_asset_list()
        self._render_preview()
        self._set_status("已清空列表")

    def _refresh_asset_list(self):
        self.asset_list.delete(0, "end")
        for p in self.results:
            self.asset_list.insert("end", p.name)

    # ------------------------------------------------------------------ thumbs
    def _refresh_thumbs(self):
        for w in self.thumb_frame.winfo_children():
            w.destroy()
        for i, p in enumerate(self.results):
            try:
                im = Image.open(p).convert("RGBA")
                im.thumbnail((72, 72))
                ph = ImageTk.PhotoImage(im)
            except Exception:
                continue
            chosen = self.selected == p
            box = tk.Frame(self.thumb_frame, bg="#FFFFFF",
                           highlightthickness=2 if chosen else 1,
                           highlightbackground=ACCENT if chosen else BORDER,
                           highlightcolor=ACCENT if chosen else BORDER)
            box.grid(row=0, column=i, padx=4, pady=4)
            lb = tk.Label(box, image=ph, bg="#FFFFFF", width=76, height=76)
            lb.image = ph
            lb.pack()
            name = tk.Label(box, text=("✓ " if chosen else "") + p.stem[:12],
                            bg="#FFFFFF", fg=ACCENT_DARK if chosen else SUB,
                            font=("Microsoft YaHei UI", 8))
            name.pack()
            for w in (box, lb, name):
                w.bind("<Button-1>", lambda e, path=p: self._select(path))

    def _select(self, path: Path):
        if self.selected != path:
            self.zoom = 1.0
            self.pan_x = 0.0
            self.pan_y = 0.0
        self.selected = path
        self._log(f"选择: {path}")
        self.sel_badge.config(text="已选中")
        try:
            self.current_img = Image.open(path).convert("RGBA")
            iw, ih = self.current_img.size
            self.tab_info.config(text=f"{path.name}  ·  {iw}×{ih}")
            self._refresh_thumbs()
            self._render_preview()
        except Exception as e:
            self._log(f"预览失败: {e}")

    # ------------------------------------------------------------- preview view
    def _fit_scale(self):
        c = self.preview
        iw, ih = self.current_img.size
        w = max(64, c.winfo_width() - 56)
        h = max(64, c.winfo_height() - 56)
        # 小图不放大，避免预览发虚；需要放大用滚轮
        return min(1.0, w / iw, h / ih)

    def _render_preview(self, fast: bool = False):
        c = self.preview
        c.delete("all")
        W = max(64, c.winfo_width())
        H = max(64, c.winfo_height())
        if self.current_img is None:
            c.create_text(W // 2, H // 2 - 10, text="生成或选择一张图片后，这里显示预览",
                          fill="#7A8296", font=FONT)
            c.create_text(W // 2, H // 2 + 18,
                          text="提示：滚轮缩放 · 拖拽平移 · 右键功能菜单",
                          fill="#9AA3B5", font=FONT_S)
            self.zoom_lb.config(text="—")
            return
        iw, ih = self.current_img.size
        scale = self._fit_scale() * self.zoom * self._intro
        dw, dh = max(1, int(iw * scale)), max(1, int(ih * scale))
        cx = W / 2 + self.pan_x
        cy = H / 2 + self.pan_y
        x0, y0 = cx - dw / 2, cy - dh / 2
        x1, y1 = x0 + dw, y0 + dh
        # 阴影 + 棋盘底
        c.create_rectangle(x0 + 6, y0 + 6, x1 + 6, y1 + 6, fill="#E7ECF6", outline="")
        c.create_rectangle(x0, y0, x1, y1, fill="#FFFFFF",
                           outline=ACCENT if self.selected else "#DDE4F0", width=2)
        im = self.current_img.resize((dw, dh),
                                     Image.BILINEAR if fast else Image.LANCZOS)
        self._preview_img = ImageTk.PhotoImage(im)
        c.create_image(cx, cy, image=self._preview_img, anchor="center")
        self._view_rect = (x0, y0, scale)
        if self._sel_img_box:
            l, t, r, b = self._sel_img_box
            sx0, sy0 = x0 + l * scale, y0 + t * scale
            sx1, sy1 = x0 + r * scale, y0 + b * scale
            c.create_rectangle(sx0, sy0, sx1, sy1, outline=ACCENT, width=2,
                               dash=(5, 3), tags="sel")
        elif self._sel_canvas:
            x0s, y0s, x1s, y1s = self._sel_canvas
            c.create_rectangle(x0s, y0s, x1s, y1s, outline=ACCENT, width=2,
                               dash=(5, 3), tags="sel")
        # 顶部信息
        c.create_rectangle(12, 10, 12 + min(360, W - 24), 38, fill="#FFFFFF",
                           outline="#DDE4F0")
        c.create_text(20, 24, anchor="w", fill=TEXT, font=FONT_S,
                      text=f"{self.selected.name if self.selected else ''}   {iw}×{ih}")
        self.zoom_lb.config(text=f"{int(self.zoom * 100)}%")
        self._draw_cursor()

    def _on_wheel(self, e):
        self._zoom_at(1.12 if e.delta > 0 else 1 / 1.12)

    def _on_motion(self, e):
        self._cursor_xy = (e.x, e.y)
        self._cursor_inside = True
        self._draw_cursor()

    def _on_preview_enter(self, e):
        self._cursor_inside = True
        self._cursor_xy = (e.x, e.y)
        self._draw_cursor()

    def _on_preview_leave(self, e):
        if getattr(self, "cursor_demo", False):
            return
        self._cursor_inside = False
        self._draw_cursor()

    def _draw_cursor(self):
        """玻璃拟态光标：半透明玻璃环 + 中心点。"""
        c = self.preview
        if c is None:
            return
        c.delete("cur")
        if not self._cursor_inside or not self._cursor_xy:
            return
        x, y = self._cursor_xy
        c.create_oval(x - 16, y - 16, x + 16, y + 16, outline=ACCENT, width=2,
                      stipple="gray50", tags="cur")
        c.create_oval(x - 8, y - 8, x + 8, y + 8, outline="#B9C4F5", width=1, tags="cur")
        c.create_oval(x - 2, y - 2, x + 2, y + 2, fill=ACCENT, outline="", tags="cur")
        if self._drag and self._drag[4]:
            c.create_rectangle(x + 18, y + 10, x + 56, y + 30, fill="#FFFFFF",
                               outline=BORDER, tags="cur")
            c.create_text(x + 37, y + 20, text="拖动", fill=ACCENT_DARK,
                          font=("Microsoft YaHei UI", 8), tags="cur")

    def _zoom_at(self, factor: float):
        if self.current_img is None:
            return
        if self._zoom_after:
            try:
                self.root.after_cancel(self._zoom_after)
            except Exception:
                pass
            self._zoom_after = None
        start = self.zoom
        target = max(0.1, min(8.0, start * factor))

        def frame(t):
            self.zoom = lerp(start, target, t)
            self._render_preview(fast=True)

        def done():
            self._zoom_after = None
            self._render_preview()

        self._zoom_after = animate(self.root, 120, frame, done)

    def _reset_view(self):
        self.zoom = 1.0
        self.pan_x = self.pan_y = 0.0
        self._render_preview()
        self._log("预览已复位")

    def _on_press(self, e):
        if getattr(self, "crop_mode", False) and self.current_img is not None:
            self._sel_canvas = (e.x, e.y, e.x, e.y)
            self._render_preview()
            return
        self._drag = (e.x, e.y, self.pan_x, self.pan_y, False)
        self._draw_cursor()

    def _on_drag(self, e):
        if getattr(self, "crop_mode", False) and self._sel_canvas:
            x0, y0, _, _ = self._sel_canvas
            self._sel_canvas = (x0, y0, e.x, e.y)
            self._render_preview(fast=True)
            return
        if not self._drag:
            return
        sx, sy, px, py, moved = self._drag
        dx, dy = e.x - sx, e.y - sy
        if abs(dx) + abs(dy) > 3:
            moved = True
        self.pan_x, self.pan_y = px + dx, py + dy
        self._drag = (sx, sy, px, py, moved)
        self._render_preview(fast=True)

    def _on_release(self, e):
        if getattr(self, "crop_mode", False) and self._sel_canvas:
            self._sel_img_box = self._canvas_to_img(self._sel_canvas)
            self._sel_canvas = None
            self._render_preview()
            return
        if self._drag and not self._drag[4]:
            self._use_current()
        self._drag = None
        self._draw_cursor()

    def _use_current(self):
        if not self.selected:
            return
        self.sel_badge.config(text="✓ 已使用")
        self._set_status(f"已使用：{self.selected.name}")
        self._log(f"左键使用：{self.selected.name}")
        self._toast(f"已使用：{self.selected.name}", "success")

    def _on_right(self, e):
        if not self.selected:
            return
        m = tk.Menu(self.root, tearoff=0, bg="#FFFFFF", fg=TEXT, activebackground="#E9EEF8",
                    activeforeground=TEXT, font=FONT_S)
        m.add_command(label="抠图（AI 去背） — 输出透明 PNG", command=self.on_matte)
        m.add_command(label="超分 2x（AI） — Real-ESRGAN 放大", command=self.on_upscale)
        m.add_command(label="拆图层 — 按 alpha 拆分独立图层", command=self.on_layers)
        m.add_command(label="雪碧图切分 — 按行列切分网格", command=self.on_slice)
        m.add_command(label="导出 Atlas — 图集 + 9-slice JSON", command=self.on_atlas)
        m.add_separator()
        m.add_command(label="复制文件路径", command=self._copy_path)
        m.add_command(label="在资源管理器中显示", command=self._reveal)
        m.add_command(label="复位缩放/平移", command=self._reset_view)
        try:
            m.tk_popup(e.x_root, e.y_root)
        finally:
            m.grab_release()

    def _copy_path(self):
        if self.selected:
            self.root.clipboard_clear()
            self.root.clipboard_append(str(self.selected))
            self._set_status("已复制路径")
            self._log("已复制：" + str(self.selected))
            self._toast("文件路径已复制", "success")

    def _reveal(self):
        if not self.selected:
            return
        try:
            os.startfile(str(self.selected.parent))
        except Exception as e:
            self._log(f"打开目录失败：{e}")

    def _need_sel(self) -> Optional[Path]:
        if not self.selected:
            messagebox.showinfo(APP_TITLE, "先在缩略图或「素材」里选一张图")
            return None
        return self.selected

    # ----------------------------------------------------------------- actions
    def on_matte(self):
        p = self._need_sel()
        if not p:
            return

        def job():
            try:
                out = self.pipe.matte_ai(p)
                self.root.after(0, lambda: self._log("AI 抠图：BiRefNet"))
            except Exception as e:
                self.root.after(0, lambda: self._log(f"AI 抠图不可用，改用基础算法：{e}"))
                out = self.pipe.matte(p)
            self.root.after(0, lambda: self._add_results([out], "抠图完成"))

        self._run(job, "AI 抠图中…")

    def on_upscale(self):
        p = self._need_sel()
        if not p:
            return

        def job():
            try:
                out = self.pipe.upscale_ai(p, 2)
                self.root.after(0, lambda: self._log("AI 超分：Real-ESRGAN 2x"))
            except Exception as e:
                self.root.after(0, lambda: self._log(f"AI 超分不可用，改用 Lanczos：{e}"))
                out = self.pipe.upscale(p, 2)
            self.root.after(0, lambda: self._add_results([out], "超分完成"))

        self._run(job, "AI 超分中…")

    def on_layers(self):
        p = self._need_sel()
        if not p:
            return

        def job():
            src = p
            img = Image.open(src).convert("RGBA")
            a = img.getchannel("A")
            opaque = a.getbbox() == (0, 0, img.width, img.height) and a.getextrema()[0] > 250
            if opaque:
                try:
                    src = self.pipe.matte_ai(src)
                    self.root.after(0, lambda: self._log("拆层前先做 AI 抠图（BiRefNet）"))
                except Exception as e:
                    self.root.after(0, lambda: self._log(f"AI 抠图不可用，直接按 alpha 拆层：{e}"))
            paths = self.pipe.layers(src)
            self.root.after(0, lambda: self._add_results(paths, f"拆层 {len(paths)} 层"))
        self._run(job, "拆层中…")

    def on_slice(self):
        p = self._need_sel()
        if not p:
            return
        rows = max(1, int(self.rows.get() or 1))
        cols = max(1, int(self.cols.get() or 1))
        pad = max(0, int(self.pad.get() or 0))

        def job():
            paths = self.pipe.slice_sheet(p, rows, cols, pad)
            self.root.after(0, lambda: self._add_results(paths, f"切图 {len(paths)} 张"))
        self._run(job, "切图中…")

    def on_atlas(self):
        paths = [p for p in self.results if p.suffix.lower() == ".png"]
        if not paths:
            messagebox.showinfo(APP_TITLE, "先有 PNG 结果图")
            return
        win = tk.Toplevel(self.root)
        win.title("Atlas 打包（TexturePacker 式）")
        win.configure(bg=SIDEBAR_BG)
        win.geometry("460x430")
        win.transient(self.root)
        body = tk.Frame(win, bg=SIDEBAR_BG)
        body.pack(fill="both", expand=True, padx=16, pady=12)
        tk.Label(body, text="MaxRects 打包 · rectpack", bg=SIDEBAR_BG, fg=TEXT,
                 font=FONT_B).pack(anchor="w")

        def row(label):
            r = tk.Frame(body, bg=SIDEBAR_BG)
            r.pack(fill="x", pady=4)
            tk.Label(r, text=label, bg=SIDEBAR_BG, fg=SUB, font=FONT_S, width=10,
                     anchor="w").pack(side="left")
            return r

        r1 = row("最大尺寸")
        size_var = tk.StringVar(value="2048")
        ttk.Combobox(r1, textvariable=size_var, values=["1024", "2048", "4096"],
                     state="readonly", width=8).pack(side="left")
        r2 = row("内边距")
        pad_var = tk.StringVar(value="4")
        tk.Spinbox(r2, from_=0, to=32, textvariable=pad_var, width=6,
                   bg=INPUT_BG, fg=TEXT, relief="flat").pack(side="left")
        r3 = row("外扩")
        ext_var = tk.StringVar(value="1")
        tk.Spinbox(r3, from_=0, to=8, textvariable=ext_var, width=6,
                   bg=INPUT_BG, fg=TEXT, relief="flat").pack(side="left")
        r4 = row("格式")
        fmt_var = tk.StringVar(value="cocos")
        ttk.Combobox(r4, textvariable=fmt_var,
                     values=["cocos", "phaser", "texturepacker"],
                     state="readonly", width=16).pack(side="left")
        opts = tk.Frame(body, bg=SIDEBAR_BG)
        opts.pack(fill="x", pady=6)
        rot_var = tk.BooleanVar(value=True)
        pot_var = tk.BooleanVar(value=False)
        trim_var = tk.BooleanVar(value=True)
        for text, var in (("允许旋转", rot_var), ("POT 2 的幂", pot_var), ("裁透明边", trim_var)):
            tk.Checkbutton(opts, text=text, variable=var, bg=SIDEBAR_BG, fg=TEXT,
                           selectcolor=INPUT_BG, activebackground=SIDEBAR_BG,
                           font=FONT_S).pack(side="left", padx=(0, 10))

        def do_pack():
            try:
                pages = atlas.pack_pages(
                    [(p.stem, Image.open(p).convert("RGBA")) for p in paths],
                    max_size=int(size_var.get()), padding=int(pad_var.get()),
                    rotate=rot_var.get(), pot=pot_var.get(), extrude=int(ext_var.get()),
                    trim=trim_var.get(), fmt=fmt_var.get())
                folder = self.pipe.ensure_session() / "atlas"
                res = atlas.export_pages(pages, folder, "atlas")
                outs = [r["image"] for r in res]
                self._log(f"Atlas：{len(pages)} 页 → {folder}")
                self._add_results(outs, f"Atlas {len(pages)} 页")
                self._toast(f"Atlas 完成：{len(pages)} 页", "success")
                win.destroy()
            except Exception as e:
                messagebox.showerror(APP_TITLE, f"打包失败：{e}")

        btns = tk.Frame(body, bg=SIDEBAR_BG)
        btns.pack(fill="x", pady=10)
        ttk.Button(btns, text="开始打包", style="Accent.TButton",
                   command=do_pack).pack(side="right")
        ttk.Button(btns, text="取消", command=win.destroy).pack(side="right", padx=8)
        tk.Label(body, text="输出：atlas_N.png + atlas_N.json；Cocos/Phaser/TexturePacker 三种 manifest",
                 bg=SIDEBAR_BG, fg=SUB, font=("Microsoft YaHei UI", 8),
                 wraplength=420, justify="left").pack(anchor="w", pady=(4, 0))

    def _do_action(self, path: Path, note: str):
        self.root.after(0, lambda: self._add_results([path], note))

    # ----------------------------------------------------------------- settings
    def open_settings(self):
        win = tk.Toplevel(self.root)
        win.title("设置")
        win.configure(bg=SIDEBAR_BG)
        win.geometry("780x600")
        win.minsize(720, 560)
        win.transient(self.root)

        body = tk.Frame(win, bg=SIDEBAR_BG)
        body.pack(fill="both", expand=True, padx=18, pady=12)

        top = tk.Frame(body, bg=SIDEBAR_BG)
        top.pack(fill="x")
        tk.Label(top, text="生成后端", bg=SIDEBAR_BG, fg=TEXT, font=FONT_B).pack(side="left")
        provider = ttk.Combobox(top, values=["mock", "doubao", "dashscope", "openai"],
                                 state="readonly", width=14)
        provider.set(self.cfg.get("provider", "mock"))
        provider.pack(side="left", padx=10)

        cols = tk.Frame(body, bg=SIDEBAR_BG)
        cols.pack(fill="both", expand=True, pady=(8, 6))
        cols.columnconfigure(0, weight=1)
        cols.columnconfigure(1, weight=1)
        left = tk.Frame(cols, bg=SIDEBAR_BG)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 14))
        right = tk.Frame(cols, bg=SIDEBAR_BG)
        right.grid(row=0, column=1, sticky="nsew")

        fields = {}

        def section(parent, title):
            tk.Label(parent, text=title, bg=SIDEBAR_BG, fg=ACCENT_DARK, font=FONT_B).pack(
                anchor="w", pady=(8, 2))

        def field(parent, label, key, show=None):
            tk.Label(parent, text=label, bg=SIDEBAR_BG, fg=SUB, font=FONT_S).pack(anchor="w", pady=(2, 0))
            e = self._entry(parent, show=show)
            e.insert(0, str(self.cfg.get(key, DEFAULTS.get(key, ""))))
            e.pack(fill="x", pady=(2, 2))
            fields[key] = e

        section(left, "豆包 Seedream（火山方舟）")
        field(left, "API Key", "doubao_api_key", show="*")
        field(left, "模型 / 接入点 ID", "doubao_model")
        field(left, "Base URL", "doubao_base")

        section(left, "阿里云百炼")
        field(left, "API Key", "dashscope_api_key", show="*")
        field(left, "模型", "dashscope_model")

        section(right, "OpenAI 兼容网关")
        field(right, "Base URL", "openai_base")
        field(right, "API Key", "openai_key", show="*")
        field(right, "模型名", "openai_model")

        section(right, "输出目录")
        out_row = tk.Frame(right, bg=SIDEBAR_BG)
        out_row.pack(fill="x", pady=(2, 2))
        out = self._entry(out_row)
        out.insert(0, str(self.cfg.get("output_dir", "")))
        out.pack(side="left", fill="x", expand=True)

        def browse():
            d = filedialog.askdirectory(initialdir=str(output_dir(self.cfg)))
            if d:
                out.delete(0, "end"); out.insert(0, d)
        ttk.Button(out_row, text="浏览", command=browse).pack(side="left", padx=(6, 0))

        tip = tk.Label(body, text="豆包生图推荐模型：doubao-seedream-4-0-20260415（需在方舟控制台开通）",
                       bg=SIDEBAR_BG, fg=SUB, font=FONT_S, anchor="w")
        tip.pack(fill="x", pady=(4, 0))

        btns = tk.Frame(body, bg=SIDEBAR_BG)
        btns.pack(fill="x", pady=(10, 0))

        def collect():
            self.cfg["provider"] = provider.get()
            for k, e in fields.items():
                self.cfg[k] = e.get().strip()
            self.cfg["output_dir"] = out.get().strip() or str(DEFAULTS["output_dir"])
            return self.cfg

        def save():
            try:
                collect()
                save_config(self.cfg)
                self.pipe = Pipeline(self.cfg)
                self._refresh_provider()
                self._log("设置已保存 → " + str(CONFIG_PATH))
                win.destroy()
            except Exception as e:
                messagebox.showerror(APP_TITLE, f"保存失败：{e}")

        def test():
            try:
                collect()
                kind = self.cfg["provider"]
                if kind == "doubao":
                    import requests
                    base = (self.cfg.get("doubao_base") or "").rstrip("/")
                    model = (self.cfg.get("doubao_model") or "").strip()
                    r = requests.get(base + "/models",
                                     headers={"Authorization": "Bearer " + self.cfg["doubao_api_key"]},
                                     timeout=20)
                    if r.status_code >= 400:
                        raise RuntimeError(f"Key 无效或网络错误：{r.status_code}")
                    ids = [m.get("id") for m in (r.json().get("data") or [])]
                    if model in ids:
                        messagebox.showinfo(APP_TITLE, f"连接成功，模型可用：{model}")
                    else:
                        avail = [i for i in ids if "seedream" in i and "2026" in i]
                        messagebox.showwarning(APP_TITLE,
                                               f"Key 有效，但模型 {model} 不在可用列表。\n可用：{', '.join(avail[:5])}")
                elif kind == "mock":
                    messagebox.showinfo(APP_TITLE, "Mock 离线模式，无需配置")
                else:
                    messagebox.showinfo(APP_TITLE, "配置已就绪；生成时会再校验网络与 Key")
            except Exception as e:
                messagebox.showerror(APP_TITLE, f"测试失败：{e}")

        ttk.Button(btns, text="测试连接", command=test).pack(side="left")
        ttk.Button(btns, text="保存并关闭", style="Accent.TButton", command=save).pack(side="right")
        ttk.Button(btns, text="取消", command=win.destroy).pack(side="right", padx=8)

        # 直接关窗口也保存，避免填完 Key 忘记点保存
        win.protocol("WM_DELETE_WINDOW", save)
    def open_output(self):
        try:
            os.startfile(str(output_dir(self.cfg)))
        except Exception as e:
            messagebox.showerror(APP_TITLE, f"打不开目录：{e}")


    # ------------------------------------------------------------------ editor
    def _build_edit_panel(self, parent):
        pad = {"padx": 14}
        tk.Label(parent, text="PS 类编辑", bg=SIDEBAR_BG, fg=TEXT, font=FONT_B).pack(
            anchor="w", **pad, pady=(8, 2))
        tk.Label(parent, text="先选一张结果图；裁剪模式下在预览拖框", bg=SIDEBAR_BG,
                 fg=SUB, font=("Microsoft YaHei UI", 8), wraplength=300,
                 justify="left").pack(anchor="w", **pad)

        grid = tk.Frame(parent, bg=SIDEBAR_BG)
        grid.pack(fill="x", padx=10, pady=6)
        ops = [("⟲ 左转", lambda: self._edit_op(lambda e: e.rotate(False))),
               ("⟳ 右转", lambda: self._edit_op(lambda e: e.rotate(True))),
               ("↔ 水平翻转", lambda: self._edit_op(lambda e: e.flip(True))),
               ("↕ 垂直翻转", lambda: self._edit_op(lambda e: e.flip(False)))]
        for i, (text, cmd) in enumerate(ops):
            ttk.Button(grid, text=text, command=cmd).grid(
                row=i // 2, column=i % 2, sticky="ew", padx=3, pady=2)
        grid.columnconfigure(0, weight=1); grid.columnconfigure(1, weight=1)

        sl = tk.Frame(parent, bg=SIDEBAR_BG)
        sl.pack(fill="x", padx=14, pady=(6, 2))
        self.bright_var = tk.DoubleVar(value=1.0)
        self.contrast_var = tk.DoubleVar(value=1.0)
        self.sat_var = tk.DoubleVar(value=1.0)
        for label, var in (("亮度", self.bright_var), ("对比", self.contrast_var),
                           ("饱和", self.sat_var)):
            row = tk.Frame(sl, bg=SIDEBAR_BG)
            row.pack(fill="x", pady=1)
            tk.Label(row, text=label, bg=SIDEBAR_BG, fg=SUB, font=FONT_S,
                     width=4, anchor="w").pack(side="left")
            ttk.Scale(row, from_=0.5, to=1.5, variable=var,
                      orient="horizontal").pack(side="left", fill="x", expand=True)

        arow = tk.Frame(parent, bg=SIDEBAR_BG)
        arow.pack(fill="x", padx=14, pady=4)
        ttk.Button(arow, text="应用调色", command=self._apply_adjust).pack(side="left")
        ttk.Button(arow, text="自动对比", command=lambda: self._edit_op(lambda e: e.auto_contrast())).pack(side="left", padx=4)

        rrow = tk.Frame(parent, bg=SIDEBAR_BG)
        rrow.pack(fill="x", padx=14, pady=4)
        tk.Label(rrow, text="缩放 %", bg=SIDEBAR_BG, fg=SUB, font=FONT_S).pack(side="left")
        self.scale_var = tk.StringVar(value="100")
        tk.Spinbox(rrow, from_=25, to=400, increment=25, textvariable=self.scale_var,
                   width=5, bg=INPUT_BG, fg=TEXT, relief="flat").pack(side="left", padx=6)
        ttk.Button(rrow, text="应用", width=5,
                   command=lambda: self._edit_op(lambda e: e.resize(int(self.scale_var.get()) / 100))).pack(side="left")

        crow = tk.Frame(parent, bg=SIDEBAR_BG)
        crow.pack(fill="x", padx=14, pady=4)
        self.crop_btn = ttk.Button(crow, text="裁剪模式", command=self._toggle_crop)
        self.crop_btn.pack(side="left")
        ttk.Button(crow, text="应用裁剪", command=self._apply_crop).pack(side="left", padx=4)

        crow2 = tk.Frame(parent, bg=SIDEBAR_BG)
        crow2.pack(fill="x", padx=14, pady=(0, 4))
        ttk.Button(crow2, text="消除（快速）", command=self._inpaint).pack(side="left")
        ttk.Button(crow2, text="AI 消除（LaMa）", command=self._inpaint_ai).pack(side="left", padx=4)

        srow = tk.Frame(parent, bg=SIDEBAR_BG)
        srow.pack(fill="x", padx=14, pady=(8, 4))
        ttk.Button(srow, text="保存副本", style="Accent.TButton",
                   command=self._save_edit).pack(side="left", fill="x", expand=True)
        ttk.Button(srow, text="还原", command=self._reset_edit).pack(side="left", padx=4)

        self.edit_info = tk.Label(parent, text="", bg=SIDEBAR_BG, fg=SUB, font=FONT_S)
        self.edit_info.pack(anchor="w", padx=14, pady=(2, 8))

    def _enter_edit(self):
        if not self.selected:
            return
        if getattr(self, "editor", None) is None or self.editor.path != self.selected:
            self.editor = Editor(self.selected)
        self.current_img = self.editor.img
        self.crop_mode = False
        self._sel_img_box = None
        self._sel_canvas = None
        if hasattr(self, "crop_btn"):
            self.crop_btn.config(text="裁剪模式")
        if hasattr(self, "edit_info"):
            self.edit_info.config(text=f"编辑：{self.selected.name}  {self.current_img.width}×{self.current_img.height}")
        self._render_preview()

    def _edit_op(self, fn):
        if getattr(self, "editor", None) is None:
            messagebox.showinfo(APP_TITLE, "先在素材里选一张图")
            return
        try:
            self.current_img = fn(self.editor)
            self._sel_img_box = None
            if hasattr(self, "edit_info"):
                self.edit_info.config(text=f"{self.current_img.width}×{self.current_img.height}")
            self._render_preview()
        except Exception as e:
            messagebox.showerror(APP_TITLE, str(e))

    def _apply_adjust(self):
        self._edit_op(lambda e: e.adjust(self.bright_var.get(), self.contrast_var.get(),
                                         self.sat_var.get()))

    def _toggle_crop(self):
        self.crop_mode = not getattr(self, "crop_mode", False)
        self._sel_img_box = None
        self._sel_canvas = None
        self.crop_btn.config(text="退出裁剪" if self.crop_mode else "裁剪模式")
        self._render_preview()

    def _apply_crop(self):
        if not self._sel_img_box:
            messagebox.showinfo(APP_TITLE, "先在预览里拖框")
            return
        self._edit_op(lambda e: e.crop(self._sel_img_box))
        self._sel_img_box = None
        self.crop_mode = False
        if hasattr(self, "crop_btn"):
            self.crop_btn.config(text="裁剪模式")

    def _inpaint(self):
        if not self._sel_img_box:
            messagebox.showinfo(APP_TITLE, "先拖框选中要消除的区域")
            return
        try:
            from .ai_bridge import run_ai
            sess = self.pipe.ensure_session()
            src = sess / "_inpaint_in.png"
            dst = sess / "_inpaint_out.png"
            self.editor.img.save(src)
            l, t, r, b = self._sel_img_box
            run_ai(self.cfg, ["inpaint", src, dst, f"{l},{t},{r},{b}"])
            self.editor.img = Image.open(dst).convert("RGBA")
            self.current_img = self.editor.img
            self._sel_img_box = None
            self._render_preview()
            self._toast("选区已消除（OpenCV Telea）", "success")
        except Exception as e:
            messagebox.showerror(APP_TITLE, f"消除失败：{e}")

    def _inpaint_ai(self):
        if not self._sel_img_box:
            messagebox.showinfo(APP_TITLE, "先拖框选中要消除的区域")
            return
        try:
            from .ai_bridge import lama_path
            has_model = lama_path().exists()
        except Exception:
            has_model = False
        if not has_model:
            if not messagebox.askyesno(
                    APP_TITLE,
                    "首次使用需下载 LaMa 模型（约 196MB，来自 GitHub 开源项目）。\n"
                    "下载到本地 APPDATA，之后离线可用。继续？"):
                return
        l, t, r, b = self._sel_img_box
        box = f"{l},{t},{r},{b}"

        def job():
            from .ai_bridge import ensure_lama, run_ai
            ensure_lama(lambda m: self._log(m))
            sess = self.pipe.ensure_session()
            src = sess / "_lama_in.png"
            dst = sess / "_lama_out.png"
            self.editor.img.save(src)
            run_ai(self.cfg, ["inpaint_lama", src, dst, box])
            self.root.after(0, lambda: self._apply_lama(dst))

        self._run(job, "AI 消除（LaMa）…")

    def _apply_lama(self, dst: Path):
        try:
            self.editor.img = Image.open(dst).convert("RGBA")
            self.current_img = self.editor.img
            self._sel_img_box = None
            self._render_preview()
            self._toast("LaMa 消除完成", "success")
        except Exception as e:
            messagebox.showerror(APP_TITLE, f"加载结果失败：{e}")

    def _save_edit(self):
        if getattr(self, "editor", None) is None:
            return
        try:
            sess = self.pipe.ensure_session()
            dst = sess / (self.selected.stem + "_edited.png")
            self.editor.save(dst)
            self._add_results([dst], "编辑完成")
            self._toast("编辑副本已保存", "success")
        except Exception as e:
            messagebox.showerror(APP_TITLE, str(e))

    def _reset_edit(self):
        self._edit_op(lambda e: e.reset())
        self._sel_img_box = None

    def _canvas_to_img(self, box):
        if not self._view_rect:
            return (0, 0, 1, 1)
        x0, y0, scale = self._view_rect
        x1, y1, x2, y2 = box
        l = int((min(x1, x2) - x0) / scale)
        t = int((min(y1, y2) - y0) / scale)
        r = int((max(x1, x2) - x0) / scale)
        b = int((max(y1, y2) - y0) / scale)
        return (l, t, r, b)


def run():
    import sys
    dpi = enable_dpi_awareness()
    demo = "--demo" in sys.argv
    root = TkinterDnD.Tk() if HAVE_DND else tk.Tk()
    try:
        root.tk.call("tk", "scaling", dpi / 72.0)
        sw = root.winfo_screenwidth()
        sh = root.winfo_screenheight()
        w = min(1500, int(sw * 0.94))
        h = min(960, int(sh * 0.92))
        x = (sw - w) // 2
        y = (sh - h) // 2
        root.geometry(f"{w}x{h}+{x}+{y}")
        root.minsize(1100, 720)
    except Exception:
        pass
    app = App(root)
    try:
        sw = root.winfo_screenwidth()
        sh = root.winfo_screenheight()
        w = min(1500, int(sw * 0.94))
        h = min(960, int(sh * 0.92))
        root.geometry(f"{w}x{h}+{(sw - w) // 2}+{(sh - h) // 2}")
        root.minsize(1280, 800)
    except Exception:
        pass
    if demo:
        # 演示模式强制使用 Mock；不写回配置，避免覆盖用户真实 provider/Key
        app.demo_mode = True
        app.cfg["provider"] = "mock"
        app.pipe = Pipeline(app.cfg)
        app._refresh_provider()

        def demo_start():
            app.preset.set(preset_names()[0])
            app._apply_preset()
            app.ratio_var.set("9:16")  # 演示竖屏比例
            root.after(250, app.on_generate)
        root.after(400, demo_start)
    if "--templates" in sys.argv:
        def show_templates():
            app._show_view("templates")
            app._tpl_pick(tpl_by_id("char_sheet"))
        root.after(500, show_templates)
    if "--ref" in sys.argv:
        idx = sys.argv.index("--ref")
        if idx + 1 < len(sys.argv):
            app.ref_paths = [sys.argv[idx + 1]]
            app._update_ref_label()
            app._log("已加载参考图：" + sys.argv[idx + 1])
    if "--quota" in sys.argv:
        root.after(500, lambda: app._show_view("quota"))
    if "--motion-demo" in sys.argv:
        root.after(3500, lambda: app._toast("动画演示：入场 / 悬停 / 微交互 / 过渡", "success", 8000))
        root.after(3700, app._play_intro)
    if "--edit-demo" in sys.argv and app.ref_paths:
        from pathlib import Path as _P
        pth = _P(app.ref_paths[0])
        app.results = [pth]
        app._refresh_thumbs()
        app._select(pth)
        app._show_view("edit")
    if "--cursor-demo" in sys.argv:
        app.cursor_demo = True

        def show_cursor():
            app._cursor_inside = True
            app._cursor_xy = (app.preview.winfo_width() // 2,
                              app.preview.winfo_height() // 2)
            app._draw_cursor()
        root.after(1200, show_cursor)
        root.after(2800, show_cursor)
    root.mainloop()


if __name__ == "__main__":
    run()

























