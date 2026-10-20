"""
make_8dir_from_ref.py — 把「5 视角 × 8 帧」的参考切图转成八方向角色资源。

映射（参考图行为右向）:
  S  <- front
  SE <- front-45
  E  <- side
  NE <- front-45（镜像）
  N  <- back
  NW <- back-45（镜像）
  W  <- side（镜像）
  SW <- back-45

输出:
  assets/resources/char/<id>/walk/<dir>/00..07.png
  assets/resources/char/<id>/idle/<dir>/00..03.png
  docs/art/<id>-8dir-preview.png
"""
import argparse
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

DIRS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']
# dir: (row_name, mirror)
MAP = {
    'S': ('front', False),
    'SE': ('front-45', False),
    'E': ('side', False),
    'NE': ('front-45', True),
    'N': ('back', False),
    'NW': ('back-45', True),
    'W': ('side', True),
    'SW': ('back-45', False),
}


def font(size=18):
    for f in [r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\arial.ttf']:
        if Path(f).exists():
            try:
                return ImageFont.truetype(f, size)
            except Exception:
                pass
    return ImageFont.load_default()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--slice-dir', required=True, help='slice_8dir.py 的输出目录')
    ap.add_argument('--id', default='refchibi')
    ap.add_argument('--project', required=True)
    ap.add_argument('--preview')
    args = ap.parse_args()

    src = Path(args.slice_dir)
    proj = Path(args.project)
    out_root = proj / 'assets' / 'resources' / 'char' / args.id
    if out_root.exists():
        shutil.rmtree(out_root)

    manifest = {'id': args.id, 'dirs': {}, 'states': ['idle', 'walk']}
    previews = []
    for d in DIRS:
        row, mirror = MAP[d]
        row_dir = src / row
        walk_dir = out_root / 'walk' / d
        idle_dir = out_root / 'idle' / d
        walk_dir.mkdir(parents=True, exist_ok=True)
        idle_dir.mkdir(parents=True, exist_ok=True)

        frames = sorted(row_dir.glob('*.png'))
        if not frames:
            print(f'WARN: no frames in {row_dir}')
            continue

        for i, f in enumerate(frames[:8]):
            im = Image.open(f).convert('RGBA')
            if mirror:
                im = im.transpose(Image.FLIP_LEFT_RIGHT)
            im.save(walk_dir / f'{i:02d}.png')

        idle_pick = frames[::2][:4]
        for i, f in enumerate(idle_pick):
            im = Image.open(f).convert('RGBA')
            if mirror:
                im = im.transpose(Image.FLIP_LEFT_RIGHT)
            im.save(idle_dir / f'{i:02d}.png')

        previews.append((d, walk_dir / '00.png'))
        manifest['dirs'][d] = {'row': row, 'mirror': mirror, 'walk_frames': len(frames[:8]), 'idle_frames': len(idle_pick)}

    (out_root / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

    if args.preview:
        cell = 140
        sheet = Image.new('RGB', (cell * 8, cell + 30), (18, 16, 12))
        dr = ImageDraw.Draw(sheet)
        fnt = font(16)
        for i, (d, p) in enumerate(previews):
            im = Image.open(p).convert('RGBA')
            im.thumbnail((cell - 10, cell - 10))
            sheet.paste(im, (i * cell + (cell - im.width) // 2, 20 + (cell - im.height)), im)
            dr.text((i * cell + 8, 4), d, fill=(230, 210, 150), font=fnt)
        Path(args.preview).parent.mkdir(parents=True, exist_ok=True)
        sheet.save(args.preview)
        print('preview:', args.preview)

    print('OK:', out_root)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
