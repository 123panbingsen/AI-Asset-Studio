"""管线：生成 → 保存 → 抠图 / 超分 / 拆层 / 切图 / Atlas 导出。"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from PIL import Image

from . import imaging, usage
from .config import load_config, output_dir
from .providers import build_provider


class Pipeline:
    def __init__(self, cfg: Optional[dict] = None):
        self.cfg = cfg or load_config()
        self.session: Optional[Path] = None
        self.last_model = ""

    # ---------------------------------------------------------------- session
    def new_session(self) -> Path:
        root = output_dir(self.cfg)
        stamp = time.strftime("%Y%m%d_%H%M%S")
        p = root / f"session_{stamp}"
        p.mkdir(parents=True, exist_ok=True)
        self.session = p
        return p

    def ensure_session(self) -> Path:
        return self.session or self.new_session()

    # ---------------------------------------------------------------- generate
    def _candidate_models(self) -> List[str]:
        cfg = self.cfg
        primary = (cfg.get("doubao_model") or "").strip()
        models = ([primary] if primary else []) + [m for m in usage.get_models() if m != primary]
        out = []
        for m in models:
            if not m:
                continue
            if usage.is_unavailable(m):
                continue
            if usage.exhausted(cfg, "doubao", m):
                continue
            out.append(m)
        return out

    def generate(self, prompt: str, negative: str = "", size: int = 1024, count: int = 2,
                 ratio: str = "1:1", refs: List[str] | None = None, progress=None) -> List[Path]:
        refs = refs or []
        kind = (self.cfg.get("provider") or "mock").lower()
        imgs = None
        last_err = None

        if kind == "doubao" and self.cfg.get("auto_switch", True):
            candidates = self._candidate_models()
            if not candidates:
                raise RuntimeError("豆包候选模型均已用完/不可用，请到「额度」页重置或检查控制台")
            for model in candidates:
                c = dict(self.cfg)
                c["doubao_model"] = model
                try:
                    imgs = build_provider(c).generate(prompt, negative, size, count,
                                                      progress=progress, ratio=ratio, refs=refs)
                    self.last_model = model
                    usage.record("doubao", model, len(imgs))
                    if progress:
                        progress(f"使用模型：{model}（今日 {usage.used('doubao', model)} 次）")
                    break
                except RuntimeError as e:
                    msg = str(e)
                    retryable = any(k.lower() in msg.lower() for k in
                                    ("modelnotopen", "invalidendpointormodel", "notfound",
                                     "429", "quota", "exceed", "limit"))
                    if retryable:
                        usage.mark_unavailable(model, msg)
                        if progress:
                            progress(f"模型 {model} 不可用，自动切换下一个…")
                        last_err = e
                        continue
                    raise
            else:
                raise RuntimeError("豆包候选模型均失败：" + (str(last_err) if last_err else "未知错误"))
        else:
            model = (self.cfg.get(f"{kind}_model") or "").strip()
            imgs = build_provider(self.cfg).generate(prompt, negative, size, count,
                                                     progress=progress, ratio=ratio, refs=refs)
            self.last_model = model
            usage.record(kind, model, len(imgs))

        sess = self.ensure_session()
        paths = []
        for i, im in enumerate(imgs):
            p = sess / f"gen_{int(time.time())}_{i + 1}.png"
            im.save(p)
            paths.append(p)
        return paths

    # ---------------------------------------------------------------- actions
    def matte(self, src: str | Path, tolerance: int = 26, feather: int = 2) -> Path:
        img = Image.open(src).convert("RGBA")
        out = imaging.remove_background(img, tolerance=tolerance, feather=feather)
        dst = Path(src).with_name(Path(src).stem + "_matte.png")
        out.save(dst)
        return dst

    def upscale(self, src: str | Path, factor: int = 2) -> Path:
        img = Image.open(src).convert("RGBA")
        out = imaging.upscale(img, factor)
        dst = Path(src).with_name(Path(src).stem + f"_x{factor}.png")
        out.save(dst)
        return dst

    # ---------------------------------------------------------------- AI 增强
    def matte_ai(self, src: str | Path, model: str = "birefnet-general-lite") -> Path:
        from .ai_bridge import run_ai
        dst = Path(src).with_name(Path(src).stem + "_ai_matte.png")
        run_ai(self.cfg, ["matte", str(src), str(dst), model])
        return dst

    def upscale_ai(self, src: str | Path, factor: int = 2) -> Path:
        from .ai_bridge import run_ai
        dst = Path(src).with_name(Path(src).stem + f"_ai_x{factor}.png")
        run_ai(self.cfg, ["upscale", str(src), str(dst), str(factor)])
        return dst

    def layers(self, src: str | Path, min_area: int = 64) -> List[Path]:
        img = Image.open(src).convert("RGBA")
        parts = imaging.split_layers(img, min_area=min_area)
        folder = Path(src).with_name(Path(src).stem + "_layers")
        folder.mkdir(exist_ok=True)
        paths = []
        for i, part in enumerate(parts):
            p = folder / f"layer_{i + 1:02d}.png"
            part.save(p)
            paths.append(p)
        return paths

    def slice_sheet(self, src: str | Path, rows: int, cols: int, padding: int = 0) -> List[Path]:
        img = Image.open(src).convert("RGBA")
        parts = imaging.slice_grid(img, rows, cols, padding=padding)
        folder = Path(src).with_name(Path(src).stem + "_slices")
        folder.mkdir(exist_ok=True)
        paths = []
        for name, part in parts:
            p = folder / f"{name}.png"
            part.save(p)
            paths.append(p)
        return paths

    def export_atlas(self, paths: Sequence[str | Path], name: str = "atlas",
                     insets: Tuple[int, int, int, int] = (12, 12, 12, 12)) -> Dict[str, Path]:
        items: List[Tuple[str, Image.Image]] = []
        for p in paths:
            p = Path(p)
            items.append((p.stem, Image.open(p).convert("RGBA")))
        folder = self.ensure_session() / "atlas"
        return imaging.write_atlas(folder, items, name=name, insets=insets)

    # ---------------------------------------------------------------- helpers
    @staticmethod
    def load_image(path: str | Path) -> Image.Image:
        return Image.open(path).convert("RGBA")

