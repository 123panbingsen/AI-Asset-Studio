"""
slice_8dir.py — 把 8 列 × N 行的角色图集切成单帧 PNG。

用途:
  1) 八方向角色：列 = 方向，行 = 动作状态（idle/walk/attack）
  2) 转面参考图：列 = 帧，行 = 视角（front/side/back...）

示例:
  python tools/slice_8dir.py --sheet ref8.jpg --cols 8 --rows 5 ^
      --out docs/art/ref8-slice --remove-bg --trim --canvas 160x160 ^
      --row-names front,front-45,side,back-45,back
"""
import argparse
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

try:
    from scipy import ndimage
except Exception:  # scipy 不可用时退化为全局色差
    ndimage = None


def remove_background(im: Image.Image, tol: int) -> Image.Image:
    """只去掉与画布边缘连通的背景，保留线稿内部填色。"""
    a = np.array(im.convert('RGBA')).astype(np.int16)
    rgb = a[:, :, :3]
    corners = np.concatenate([
        rgb[0:8, 0:8].reshape(-1, 3),
        rgb[0:8, -8:].reshape(-1, 3),
        rgb[-8:, 0:8].reshape(-1, 3),
        rgb[-8:, -8:].reshape(-1, 3),
    ])
    bg = np.median(corners, axis=0)
    dist = np.abs(rgb - bg).sum(axis=2)
    bgmask = dist <= tol

    if ndimage is not None:
        labels, _ = ndimage.label(bgmask)
        border = set(labels[0, :]) | set(labels[-1, :]) | set(labels[:, 0]) | set(labels[:, -1])
        border.discard(0)
        keep = np.isin(labels, list(border))
    else:
        keep = bgmask

    a[:, :, 3] = np.where(keep, 0, 255)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def trim_alpha(im: Image.Image, pad: int = 2) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad)
    y1 = min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1))


def fit_canvas(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    """等比缩放到画布内，底部居中放置（脚底为锚点）"""
    cw, ch = size
    scale = min(cw / im.width, ch / im.height, 1.0)
    nw = max(1, int(im.width * scale))
    nh = max(1, int(im.height * scale))
    resized = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((cw - nw) // 2, ch - nh))
    return canvas


def contact_sheet(cells: list[dict], out_path: Path, cols: int, rows: int, cell_w: int, cell_h: int):
    sheet = Image.new('RGB', (cols * cell_w, rows * cell_h), (18, 16, 12))
    dr = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for c in cells:
        im = Image.open(c['path']).convert('RGBA')
        im.thumbnail((cell_w - 8, cell_h - 24))
        x = (c['col']) * cell_w
        y = (c['row']) * cell_h
        sheet.paste(im, (x + (cell_w - im.width) // 2, y + 18), im)
        dr.text((x + 6, y + 4), f"{c['row_name']} / {c['col']}", fill=(230, 210, 150), font=font)
    sheet.save(out_path)


def detect_bands(profile: np.ndarray, count: int) -> list[tuple[int, int]]:
    """按空白间隙把投影切成 count 段；不足则合并最近段，过多则拆分最宽段。"""
    thr = max(1, int(profile.max() * 0.02))
    on = profile > thr
    runs: list[tuple[int, int]] = []
    s = None
    for i, v in enumerate(on):
        if v and s is None:
            s = i
        if not v and s is not None:
            runs.append((s, i - 1))
            s = None
    if s is not None:
        runs.append((s, len(on) - 1))
    runs = [r for r in runs if r[1] - r[0] > 2]
    if not runs:
        return [(0, len(on) - 1)]

    while len(runs) > count:
        gaps = [(runs[i + 1][0] - runs[i][1], i) for i in range(len(runs) - 1)]
        _, i = min(gaps)
        runs[i] = (runs[i][0], runs[i + 1][1])
        del runs[i + 1]
    while len(runs) < count:
        i = max(range(len(runs)), key=lambda k: runs[k][1] - runs[k][0])
        a, b = runs[i]
        mid = (a + b) // 2
        runs[i] = (a, mid)
        runs.insert(i + 1, (mid + 1, b))
    return runs


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--sheet', required=True)
    ap.add_argument('--cols', type=int, default=8)
    ap.add_argument('--rows', type=int, default=5)
    ap.add_argument('--out', required=True)
    ap.add_argument('--row-names', default='')
    ap.add_argument('--remove-bg', action='store_true')
    ap.add_argument('--tol', type=int, default=36)
    ap.add_argument('--trim', action='store_true')
    ap.add_argument('--canvas', default='160x160')
    ap.add_argument('--contact', action='store_true')
    args = ap.parse_args()

    src = Image.open(args.sheet).convert('RGBA')
    if args.remove_bg:
        src = remove_background(src, args.tol)

    alpha = np.array(src)[:, :, 3]
    col_bands = detect_bands(alpha.sum(axis=0), args.cols)
    # 行之间通常紧贴（无空白），按等高均分更稳
    row_h = src.height / args.rows
    row_bands = [(int(round(r * row_h)), int(round((r + 1) * row_h)) - 1) for r in range(args.rows)]

    row_names = [n.strip() for n in args.row_names.split(',') if n.strip()]
    if len(row_names) != len(row_bands):
        row_names = [f'row{i}' for i in range(len(row_bands))]

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    canvas_w, canvas_h = (int(x) for x in args.canvas.lower().split('x'))
    cells = []
    for r, (ry0, ry1) in enumerate(row_bands):
        row_dir = out / row_names[r]
        row_dir.mkdir(parents=True, exist_ok=True)
        for c, (cx0, cx1) in enumerate(col_bands):
            pad = 3
            x0 = max(0, cx0 - pad)
            y0 = max(0, ry0 - pad)
            x1 = min(src.width, cx1 + 1 + pad)
            y1 = min(src.height, ry1 + 1 + pad)
            cell = src.crop((x0, y0, x1, y1))
            if args.trim:
                cell = trim_alpha(cell)
            cell = fit_canvas(cell, (canvas_w, canvas_h))
            p = row_dir / f'{c:02d}.png'
            cell.save(p)
            cells.append({
                'row': r, 'col': c, 'row_name': row_names[r],
                'path': str(p), 'source_rect': [x0, y0, x1 - x0, y1 - y0],
                'size': [canvas_w, canvas_h],
            })

    manifest = {
        'sheet': str(Path(args.sheet).name),
        'cols': len(col_bands), 'rows': len(row_bands),
        'canvas': [canvas_w, canvas_h],
        'row_names': row_names,
        'column_bands': col_bands,
        'row_bands': row_bands,
        'cells': cells,
    }
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    if args.contact:
        contact_sheet(cells, out / 'contact.png', len(col_bands), len(row_bands), canvas_w + 8, canvas_h + 24)
    print(f'OK: {len(cells)} cells ({len(col_bands)}x{len(row_bands)}) -> {out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
