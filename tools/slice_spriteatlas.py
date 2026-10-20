r"""
(项目工具) 把 SpriteAtlasAddon 输出的 sprite sheet 切成 8 方向帧。

sheet 布局: 行 = 旋转方向（S,SE,E,NE,N,NW,W,SW），列 = 动作帧。

用法:
  python tools/slice_spriteatlas.py --sheet docs/art/spriteatlas-walk.png ^
    --out assets/resources/char/mixamo/walk --cols 8 --rows 8 --remove-white
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

DIRS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']


def remove_white(im: Image.Image, tol: int = 8) -> Image.Image:
    a = np.array(im.convert('RGBA')).astype(np.int16)
    rgb = a[:, :, :3]
    alpha = a[:, :, 3]
    near_white = (rgb[:, :, 0] > 255 - tol) & (rgb[:, :, 1] > 255 - tol) & (rgb[:, :, 2] > 255 - tol)
    # Blender 透明背景常为「RGB 黑 + alpha 0」，两种都要算背景
    bgmask = near_white | (alpha < 10)

    from scipy import ndimage
    labels, _ = ndimage.label(bgmask)
    border = set(labels[0, :]) | set(labels[-1, :]) | set(labels[:, 0]) | set(labels[:, -1])
    border.discard(0)
    keep = np.isin(labels, list(border))
    a[:, :, 3] = np.where(keep, 0, 255)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--sheet', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--cols', type=int, default=8)
    ap.add_argument('--rows', type=int, default=8)
    ap.add_argument('--remove-white', action='store_true')
    ap.add_argument('--trim', action='store_true')
    args = ap.parse_args()

    sheet = Image.open(args.sheet).convert('RGBA')
    tw = sheet.width // args.cols
    th = sheet.height // args.rows
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    manifest = {'sheet': args.sheet, 'tile': [tw, th], 'dirs': {}, 'states': {}}
    for r in range(args.rows):
        d = DIRS[r] if r < len(DIRS) else f'row{r}'
        ddir = out / d
        ddir.mkdir(parents=True, exist_ok=True)
        for c in range(args.cols):
            tile = sheet.crop((c * tw, r * th, (c + 1) * tw, (r + 1) * th))
            if args.remove_white:
                tile = remove_white(tile)
            tile.save(ddir / f'{c:02d}.png')
        manifest['dirs'][d] = {'row': r, 'frames': args.cols}

    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'OK: {args.cols}x{args.rows} tiles -> {out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
