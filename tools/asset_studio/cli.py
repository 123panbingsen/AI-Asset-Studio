"""命令行自检：不打开 GUI，用 Mock provider 跑通整条管线。

用法：
    python -m asset_studio --selftest [--out DIR]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw

from . import imaging
from .config import load_config, save_config, DEFAULTS
from .pipeline import Pipeline


def make_sheet(size: int = 768, rows: int = 3, cols: int = 3) -> Image.Image:
    """合成一张带透明分隔的雪碧图，用于切图测试。"""
    sheet = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(sheet)
    cw, ch = size // cols, size // rows
    for r in range(rows):
        for c in range(cols):
            pad = 12
            x0, y0 = c * cw + pad, r * ch + pad
            x1, y1 = (c + 1) * cw - pad, (r + 1) * ch - pad
            color = ((r * 60 + 80) % 255, (c * 70 + 70) % 255, 150)
            d.rounded_rectangle([x0, y0, x1, y1], radius=16, fill=color + (255,))
    return sheet


def selftest(out_dir: Path) -> int:
    cfg = load_config()
    cfg["provider"] = "mock"
    cfg["output_dir"] = str(out_dir)
    cfg["size"] = 512
    cfg["count"] = 2
    pipe = Pipeline(cfg)
    sess = pipe.new_session()
    print(f"[1/6] session: {sess}")

    gen = pipe.generate("测试图标，暗金古风", "", 512, 2)
    assert len(gen) == 2 and all(p.exists() for p in gen)
    print(f"[2/6] generate ok: {[p.name for p in gen]}")

    matte = pipe.matte(gen[0])
    im = Image.open(matte)
    assert im.mode == "RGBA"
    print(f"[3/6] matte ok: {matte.name} alpha_bbox={imaging.alpha_bbox(im)}")

    big = pipe.upscale(matte, 2)
    assert Image.open(big).size == (im.width * 2, im.height * 2)
    print(f"[4/6] upscale ok: {big.name}")

    layers = pipe.layers(matte, min_area=48)
    print(f"[5/6] layers: {len(layers)}")

    sheet = make_sheet()
    sheet_path = sess / "sheet.png"
    sheet.save(sheet_path)
    slices = pipe.slice_sheet(sheet_path, 3, 3)
    assert len(slices) == 9, f"expect 9 slices, got {len(slices)}"
    print(f"[6/6] slices: {len(slices)}")

    res = pipe.export_atlas(layers or slices, name="atlas_demo")
    assert res["atlas"].exists() and res["manifest"].exists()
    print(f"[ok] atlas: {res['atlas']} / {res['manifest']}")
    print("SELFTEST PASSED")
    return 0


def main(argv=None) -> int:
    # 打包成 windowed exe 时 stdout/stderr 为 None，先兜底避免 print/argparse 崩溃
    import io
    if sys.stdout is None:
        sys.stdout = io.StringIO()
    if sys.stderr is None:
        sys.stderr = io.StringIO()
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--demo", action="store_true", help="启动后自动用 Mock 生成示例")
    ap.add_argument("--templates", action="store_true", help="启动后打开模板库")
    ap.add_argument("--ref", default="", help="启动时预载参考图路径")
    ap.add_argument("--quota", action="store_true", help="启动后打开额度页")
    ap.add_argument("--cursor-demo", action="store_true", help="演示玻璃光标")
    ap.add_argument("--motion-demo", action="store_true", help="演示动效")
    ap.add_argument("--edit-demo", action="store_true", help="演示编辑页")
    ap.add_argument("--out", default=str(Path.home() / "Pictures" / "AssetStudio" / "selftest"))
    args = ap.parse_args(argv)
    if args.selftest:
        return selftest(Path(args.out))
    from .app import run
    run()
    return 0


if __name__ == "__main__":
    sys.exit(main())




