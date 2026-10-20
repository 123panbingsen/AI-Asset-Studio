r"""
给 2D chibi 底模上色，生成不同武将的 2D 精灵。

输入: refchibi 结构（walk/<dir>/00..07.png, idle/.../00..03.png）
输出: char/<id>/{idle,walk,attack}/<dir>/...

用法:
  python tools/tint_chibi.py --src assets/resources/char/refchibi ^
      --out assets/resources/char --variants guanyu,zhaoyun,zhangfei
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

DIRS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']

PALETTES = {
    'guanyu': [(0x1a, 0x2e, 0x1f), (0x2f, 0x5d, 0x3a), (0xcf, 0xdc, 0xa8)],
    'zhaoyun': [(0x24, 0x2d, 0x3a), (0x6f, 0x85, 0x9e), (0xea, 0xf1, 0xf8)],
    'zhangfei': [(0x1c, 0x14, 0x12), (0x5a, 0x22, 0x1c), (0xd8, 0xb0, 0x6a)],
}


def ramp(lum: np.ndarray, colors) -> np.ndarray:
    """lum 0..1 -> 三色渐变 RGB"""
    n = len(colors) - 1
    pos = np.clip(lum, 0, 1) * n
    idx = np.clip(pos.astype(np.int32), 0, n - 1)
    frac = (pos - idx)[..., None]
    c0 = np.array(colors, dtype=np.float32)[idx]
    c1 = np.array(colors, dtype=np.float32)[np.clip(idx + 1, 0, n)]
    rgb = c0 * (1 - frac) + c1 * frac
    return rgb.astype(np.uint8)


def tint(src: Path, dst: Path, colors) -> None:
    a = np.array(Image.open(src).convert('RGBA')).astype(np.float32)
    rgb = a[:, :, :3]
    alpha = a[:, :, 3]
    lum = (0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]) / 255.0
    out = ramp(lum, colors)
    rgba = np.dstack([out, alpha]).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(dst)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--src', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--variants', default='guanyu,zhaoyun,zhangfei')
    args = ap.parse_args()

    src = Path(args.src)
    out_root = Path(args.out)
    ids = [v.strip() for v in args.variants.split(',') if v.strip()]

    for vid in ids:
        colors = PALETTES.get(vid, PALETTES['guanyu'])
        vroot = out_root / f'chibi_{vid}'
        for state in ('walk', 'idle'):
            for d in DIRS:
                sdir = src / state / d
                if not sdir.exists():
                    continue
                ddir = vroot / state / d
                ddir.mkdir(parents=True, exist_ok=True)
                for f in sorted(sdir.glob('*.png')):
                    tint(f, ddir / f.name, colors)

        # idle: 源只有 4 帧，循环补到 8 帧
        idle_seq = [0, 1, 2, 3, 2, 1, 0, 1]
        for d in DIRS:
            sdir = src / 'idle' / d
            if not sdir.exists():
                continue
            frames = sorted(sdir.glob('*.png'))
            if not frames:
                continue
            ddir = vroot / 'idle' / d
            ddir.mkdir(parents=True, exist_ok=True)
            for i, idx in enumerate(idle_seq):
                f = frames[min(idx, len(frames) - 1)]
                tint(f, ddir / f'{i:02d}.png', colors)

        # attack: 用 walk 帧重排成「突刺」节奏
        attack_seq = [2, 3, 4, 5, 6, 5, 4, 3]
        for d in DIRS:
            sdir = src / 'walk' / d
            if not sdir.exists():
                continue
            frames = sorted(sdir.glob('*.png'))
            ddir = vroot / 'attack' / d
            ddir.mkdir(parents=True, exist_ok=True)
            for i, idx in enumerate(attack_seq):
                f = frames[min(idx, len(frames) - 1)]
                tint(f, ddir / f'{i:02d}.png', colors)

        print('variant:', vid, '->', vroot)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
