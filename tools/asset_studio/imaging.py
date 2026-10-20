"""图像算法：去背、拆层、切图、Atlas 打包。

只依赖 Pillow + numpy，保证 exe 体积小、打包稳定。
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def ensure_rgba(img: Image.Image) -> Image.Image:
    return img.convert("RGBA") if img.mode != "RGBA" else img.copy()


def _corner_colors(img: Image.Image) -> List[Tuple[int, int, int]]:
    w, h = img.size
    pts = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
           (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    px = img.convert("RGB").load()
    colors = []
    for x, y in pts:
        c = px[x, y]
        if c not in colors:
            colors.append(c)
    return colors


def remove_background(img: Image.Image, tolerance: int = 26, feather: int = 2) -> Image.Image:
    """以四边/中点采样色为背景色，按容差抠成透明；再轻微羽化边缘。

    对纯色/近纯色背景（AI 生图常见）效果好；复杂背景建议后续接 BiRefNet。
    """
    img = ensure_rgba(img)
    rgb = np.array(img.convert("RGB"), dtype=np.int16)
    colors = _corner_colors(img)
    mask = np.zeros(rgb.shape[:2], dtype=bool)
    for c in colors:
        diff = np.abs(rgb - np.array(c, dtype=np.int16)).sum(axis=2)
        mask |= diff <= tolerance * 3
    alpha = np.where(mask, 0, 255).astype(np.uint8)
    result = img.copy()
    result.putalpha(Image.fromarray(alpha))
    if feather > 0:
        a = result.getchannel("A").filter(ImageFilter.GaussianBlur(radius=feather))
        result.putalpha(a)
    return result


def alpha_bbox(img: Image.Image) -> Tuple[int, int, int, int] | None:
    img = ensure_rgba(img)
    return img.getchannel("A").getbbox()


def trim_alpha(img: Image.Image, padding: int = 0) -> Image.Image:
    img = ensure_rgba(img)
    box = alpha_bbox(img)
    if not box:
        return img
    l, t, r, b = box
    l = max(0, l - padding); t = max(0, t - padding)
    r = min(img.width, r + padding); b = min(img.height, b + padding)
    return img.crop((l, t, r, b))


def alpha_components(img: Image.Image, min_area: int = 64, sample: int = 256) -> List[Tuple[int, int, int, int]]:
    """在 alpha 上做连通域，返回原图坐标的包围盒列表。

    先缩到 sample 尺寸做 BFS，成本可控；再把框映射回原图。
    """
    img = ensure_rgba(img)
    w, h = img.size
    sw = min(sample, w)
    sh = min(sample, h)
    small = img.getchannel("A").resize((sw, sh), Image.BILINEAR)
    a = np.array(small, dtype=np.uint8)
    mask = a > 24
    labels = np.zeros((sh, sw), dtype=np.int32)
    from collections import deque
    boxes: List[Tuple[int, int, int, int]] = []
    min_px = max(4, int(min_area * (sw * sh) / float(max(1, w * h))))
    cur = 0
    for y in range(sh):
        for x in range(sw):
            if not mask[y, x] or labels[y, x]:
                continue
            cur += 1
            q = deque([(y, x)])
            labels[y, x] = cur
            minx = maxx = x
            miny = maxy = y
            area = 0
            while q:
                cy, cx = q.popleft()
                area += 1
                if cx < minx: minx = cx
                if cx > maxx: maxx = cx
                if cy < miny: miny = cy
                if cy > maxy: maxy = cy
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < sh and 0 <= nx < sw and mask[ny, nx] and labels[ny, nx] == 0:
                        labels[ny, nx] = cur
                        q.append((ny, nx))
            if area >= min_px:
                scale_x = w / float(sw)
                scale_y = h / float(sh)
                boxes.append((
                    int(minx * scale_x), int(miny * scale_y),
                    int((maxx + 1) * scale_x), int((maxy + 1) * scale_y),
                ))
    boxes.sort(key=lambda b: (b[1], b[0]))
    return boxes


def split_layers(img: Image.Image, min_area: int = 64, padding: int = 2) -> List[Image.Image]:
    """按 alpha 连通域把图拆成独立图层（透明 PNG）。"""
    img = ensure_rgba(img)
    layers = []
    for box in alpha_components(img, min_area=min_area):
        l, t, r, b = box
        l = max(0, l - padding); t = max(0, t - padding)
        r = min(img.width, r + padding); b = min(img.height, b + padding)
        crop = img.crop((l, t, r, b)).copy()
        if alpha_bbox(crop):
            layers.append(crop)
    return layers


def slice_grid(img: Image.Image, rows: int, cols: int, padding: int = 0,
               trim: bool = True) -> List[Tuple[str, Image.Image]]:
    """按网格切图（雪碧图拆分），每格可自动裁掉透明边。"""
    img = ensure_rgba(img)
    rows = max(1, int(rows)); cols = max(1, int(cols))
    cw = img.width // cols
    ch = img.height // rows
    out: List[Tuple[str, Image.Image]] = []
    idx = 0
    for r in range(rows):
        for c in range(cols):
            box = (c * cw + padding, r * ch + padding,
                   c * cw + cw - padding, r * ch + ch - padding)
            cell = img.crop(box).copy()
            if trim:
                cell = trim_alpha(cell)
            if alpha_bbox(cell) is None:
                idx += 1
                continue
            out.append((f"sprite_{r}_{c}", cell))
            idx += 1
    return out


def pack_atlas(images: Sequence[Tuple[str, Image.Image]], max_size: int = 2048,
               padding: int = 4) -> Tuple[Image.Image, List[Dict]]:
    """货架式打包（按高度降序），返回 atlas 图与帧信息。"""
    items = sorted([(n, ensure_rgba(im)) for n, im in images if im.width > 0 and im.height > 0],
                   key=lambda kv: kv[1].height, reverse=True)
    frames: List[Dict] = []
    # 先估算宽度：取最宽图，逐步放大到能放下
    total_area = sum((im.width + padding) * (im.height + padding) for _, im in items)
    width = min(max_size, max(256, int(total_area ** 0.5) + 64))
    while width <= max_size:
        x = y = 0
        row_h = 0
        placed = []
        ok = True
        for name, im in items:
            w = im.width + padding
            h = im.height + padding
            if x + w > width:
                x = 0
                y += row_h
                row_h = 0
            if y + h > max_size:
                ok = False
                break
            placed.append((name, im, x, y, w, h))
            x += w
            row_h = max(row_h, h)
        if ok:
            height = min(max_size, y + row_h)
            atlas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            for name, im, px, py, w, h in placed:
                atlas.alpha_composite(im, (px, py))
                frames.append({"name": name, "x": px, "y": py, "w": im.width, "h": im.height})
            return atlas, frames
        width = int(width * 1.5) if width < max_size else max_size + 1
    # 兜底：单列竖排
    width = min(max_size, max(im.width + padding for _, im in items))
    y = 0
    atlas = Image.new("RGBA", (width, max_size), (0, 0, 0, 0))
    for name, im in items:
        if y + im.height > max_size:
            break
        atlas.alpha_composite(im, (0, y))
        frames.append({"name": name, "x": 0, "y": y, "w": im.width, "h": im.height})
        y += im.height + padding
    return atlas, frames


def write_atlas(out_dir: Path, images: Sequence[Tuple[str, Image.Image]],
                name: str = "atlas", insets: Tuple[int, int, int, int] = (12, 12, 12, 12)) -> Dict[str, Path]:
    """导出 atlas.png + manifest.json（Cocos 风格坐标与 9-slice）。"""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    atlas, frames = pack_atlas(images)
    atlas_path = out_dir / f"{name}.png"
    atlas.save(atlas_path)
    manifest = {
        "texture": atlas_path.name,
        "size": [atlas.width, atlas.height],
        "frames": {
            f["name"]: {
                "x": f["x"], "y": f["y"], "w": f["w"], "h": f["h"],
                "insets": list(insets),
            } for f in frames
        },
    }
    manifest_path = out_dir / f"{name}.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"atlas": atlas_path, "manifest": manifest_path}


def upscale(img: Image.Image, factor: int = 2) -> Image.Image:
    """Lanczos 超分（本地兜底；后续可替换 Real-ESRGAN）。"""
    factor = max(1, int(factor))
    return img.resize((img.width * factor, img.height * factor), Image.LANCZOS)
