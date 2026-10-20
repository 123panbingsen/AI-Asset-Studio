"""TexturePacker 式图集打包：MaxRects、旋转、POT、trim、多页、多格式导出。

基于开源 rectpack（Apache-2.0）。
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

from PIL import Image

try:
    from rectpack import MaxRectsBssf, newPacker
except Exception:  # 兜底：没有 rectpack 时退回简易货架
    MaxRectsBssf = None
    newPacker = None


def _trim(img: Image.Image) -> Tuple[Image.Image, Tuple[int, int, int, int], Tuple[int, int]]:
    """裁掉透明边，返回 (trim图, 原图内偏移xywh, 原尺寸)。"""
    img = img.convert("RGBA")
    box = img.getchannel("A").getbbox()
    if not box:
        return img, (0, 0, img.width, img.height), (img.width, img.height)
    l, t, r, b = box
    return img.crop(box), (l, t, r - l, b - t), (img.width, img.height)


def _extrude(img: Image.Image, e: int) -> Image.Image:
    if e <= 0:
        return img
    w, h = img.size
    out = Image.new("RGBA", (w + 2 * e, h + 2 * e), (0, 0, 0, 0))
    out.alpha_composite(img, (e, e))
    # 四边拉伸
    top = img.crop((0, 0, w, 1)).resize((w, e))
    bottom = img.crop((0, h - 1, w, h)).resize((w, e))
    left = img.crop((0, 0, 1, h)).resize((e, h))
    right = img.crop((w - 1, 0, w, h)).resize((e, h))
    out.alpha_composite(top, (e, 0))
    out.alpha_composite(bottom, (e, e + h))
    out.alpha_composite(left, (0, e))
    out.alpha_composite(right, (e + w, e))
    for cx, cy in ((0, 0), (w + e, 0), (0, h + e), (w + e, h + e)):
        out.alpha_composite(img.crop((0 if cx == 0 else w - 1, 0 if cy == 0 else h - 1,
                                      (1 if cx == 0 else w), (1 if cy == 0 else h))).resize((e, e)),
                            (cx, cy))
    return out


def _pot(n: int) -> int:
    return 1 << max(0, (n - 1).bit_length())


def pack_pages(images: Sequence[Tuple[str, Image.Image]], max_size: int = 2048,
               padding: int = 4, rotate: bool = False, pot: bool = False,
               extrude: int = 0, trim: bool = True, fmt: str = "cocos",
               page_padding: int = 4) -> List[Dict]:
    """返回多页结果：[{image, frames, manifest}]。"""
    items = []
    for name, im in images:
        im = im.convert("RGBA")
        if trim:
            t, off, src = _trim(im)
        else:
            t, off, src = im, (0, 0, im.width, im.height), (im.width, im.height)
        items.append({"name": name, "img": t, "off": off, "src": src,
                      "rotated": False, "placed": None})

    packer = None
    if newPacker:
        packer = newPacker(rotation=rotate, pack_algo=MaxRectsBssf)
        for _ in range(4):
            packer.add_bin(max_size, max_size)
        for idx, it in enumerate(items):
            w = it["img"].width + 2 * padding + 2 * extrude
            h = it["img"].height + 2 * padding + 2 * extrude
            packer.add_rect(w, h, idx)
        packer.pack()
        for bidx, abin in enumerate(packer):
            for rect in abin:
                x, y, w, h, rid = rect.x, rect.y, rect.width, rect.height, rect.rid
                it = items[rid]
                it["placed"] = (bidx, x, y, w, h)
                if it["img"].width + 2 * padding + 2 * extrude != w:
                    it["rotated"] = True
    else:
        # 兜底：单页竖排
        y = 0
        for it in items:
            w = it["img"].width + 2 * padding + 2 * extrude
            h = it["img"].height + 2 * padding + 2 * extrude
            it["placed"] = (0, 0, y, w, h)
            y += h
        max_size = max(max_size, y)

    pages: Dict[int, List[Dict]] = {}
    for it in items:
        if not it["placed"]:
            continue
        pages.setdefault(it["placed"][0], []).append(it)

    out: List[Dict] = []
    for bidx in sorted(pages):
        plist = pages[bidx]
        need_w = max(p[1] + p[3] for p in (it["placed"] for it in plist))
        need_h = max(p[2] + p[4] for p in (it["placed"] for it in plist))
        page_w = _pot(need_w) if pot else need_w
        page_h = _pot(need_h) if pot else need_h
        page_w = min(max_size, max(page_w, 1))
        page_h = min(max_size, max(page_h, 1))
        atlas = Image.new("RGBA", (page_w, page_h), (0, 0, 0, 0))
        frames = []
        for it in plist:
            _, x, y, w, h = it["placed"]
            im = it["img"]
            if it["rotated"]:
                im = im.transpose(Image.ROTATE_270)
            im = _extrude(im, extrude)
            atlas.alpha_composite(im, (x + padding, y + padding))
            frames.append({
                "name": it["name"],
                "x": x + padding,
                "y": y + padding,
                "w": im.width,
                "h": im.height,
                "source_w": it["src"][0],
                "source_h": it["src"][1],
                "off_x": it["off"][0],
                "off_y": it["off"][1],
                "rotated": it["rotated"],
                "trimmed": trim and (it["off"][2] != it["src"][0] or it["off"][3] != it["src"][1]),
            })
        out.append({"image": atlas, "frames": frames,
                    "manifest": build_manifest(frames, page_w, page_h, fmt, bidx)})
    return out


def build_manifest(frames: List[Dict], w: int, h: int, fmt: str, page: int = 0) -> Dict:
    if fmt == "cocos":
        return {
            "texture": f"atlas_{page}.png",
            "size": [w, h],
            "frames": {
                f["name"]: {"x": f["x"], "y": f["y"], "w": f["w"], "h": f["h"],
                            "insets": [8, 8, 8, 8]} for f in frames
            },
        }
    if fmt == "phaser":
        return {
            "frames": {
                f["name"]: {
                    "frame": {"x": f["x"], "y": f["y"], "w": f["w"], "h": f["h"]},
                    "rotated": f["rotated"],
                    "trimmed": f["trimmed"],
                    "spriteSourceSize": {"x": f["off_x"], "y": f["off_y"],
                                         "w": f["w"], "h": f["h"]},
                    "sourceSize": {"w": f["source_w"], "h": f["source_h"]},
                } for f in frames
            },
            "meta": {"image": f"atlas_{page}.png", "size": {"w": w, "h": h},
                     "scale": "1", "format": "RGBA8888"},
        }
    # texturepacker / unity 通用 array 格式
    return {
        "frames": [{
            "filename": f["name"],
            "frame": {"x": f["x"], "y": f["y"], "w": f["w"], "h": f["h"]},
            "rotated": f["rotated"],
            "trimmed": f["trimmed"],
            "spriteSourceSize": {"x": f["off_x"], "y": f["off_y"],
                                 "w": f["w"], "h": f["h"]},
            "sourceSize": {"w": f["source_w"], "h": f["source_h"]},
        } for f in frames],
        "meta": {"image": f"atlas_{page}.png", "size": {"w": w, "h": h},
                 "scale": "1", "format": "RGBA8888"},
    }


def export_pages(pages: List[Dict], out_dir: Path, name: str = "atlas") -> List[Dict]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for i, page in enumerate(pages):
        png = out_dir / f"{name}_{i}.png"
        page["image"].save(png)
        js = out_dir / f"{name}_{i}.json"
        js.write_text(json.dumps(page["manifest"], ensure_ascii=False, indent=2), encoding="utf-8")
        results.append({"image": png, "json": js, "page": i})
    return results




