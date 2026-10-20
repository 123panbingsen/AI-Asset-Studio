"""
build_8view_sheet.py — 把 8 张单视角角色图拼成「八视图」参考图；也可生成空白模板。

用法:
  # 拼版（input 目录内文件名 = 视角名，如 front.png / side.png）
  python tools/build_8view_sheet.py --input docs/art/guanyu --out docs/art/guanyu-8view.png

  # 生成空白模板（手绘用）
  python tools/build_8view_sheet.py --template docs/art/8view-template.png

视角顺序（默认）:
  front, front-45, side, back-45, back, back-135, left, front-135
"""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

VIEWS = ['front', 'front-45', 'side', 'back-45', 'back', 'back-135', 'left', 'front-135']
LABELS = ['正面', '前 45°', '右侧', '后 45°', '背面', '后 135°', '左侧', '前 135°']


def font(size=18):
    for f in [r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\arial.ttf']:
        if Path(f).exists():
            try:
                return ImageFont.truetype(f, size)
            except Exception:
                pass
    return ImageFont.load_default()


def trim(im: Image.Image) -> Image.Image:
    im = im.convert('RGBA')
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def fit(im: Image.Image, w: int, h: int, bottom_pad: int = 10) -> Image.Image:
    scale = min(w / im.width, (h - bottom_pad) / im.height, 1.0)
    nw, nh = max(1, int(im.width * scale)), max(1, int(im.height * scale))
    r = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    canvas.alpha_composite(r, ((w - nw) // 2, h - nh))
    return canvas


def parse_cell(s: str) -> tuple[int, int]:
    a, b = s.lower().split('x')
    return int(a), int(b)


def build_sheet(input_dir: Path, out: Path, cell: tuple[int, int], bg: str, rows: int):
    cols = len(VIEWS)
    per_row = cols if rows == 1 else (cols + 1) // 2
    rows_n = rows
    label_h = 34
    cw, ch = cell
    sheet = Image.new('RGBA', (per_row * cw, rows_n * (ch + label_h)), bg)
    dr = ImageDraw.Draw(sheet)
    fnt = font(20)

    missing = []
    manifest = {'views': [], 'cell': [cw, ch], 'rows': rows_n}
    for i, view in enumerate(VIEWS):
        r = i // per_row
        c = i % per_row
        x = c * cw
        y = r * (ch + label_h)

        src = None
        for ext in ('.png', '.jpg', '.jpeg', '.webp'):
            p = input_dir / (view + ext)
            if p.exists():
                src = p
                break
        if src:
            im = fit(trim(Image.open(src)), cw, ch)
            sheet.alpha_composite(im, (x, y))
            status = 'ok'
        else:
            dr.rectangle([x + 2, y + 2, x + cw - 2, y + ch - 2], outline=(90, 74, 42), width=2)
            dr.text((x + cw // 2 - 40, y + ch // 2 - 12), '待生成', fill=(120, 110, 90), font=fnt)
            missing.append(view)
            status = 'missing'

        dr.text((x + cw // 2 - 30, y + ch + 6), LABELS[i], fill=(230, 210, 150), font=fnt)
        dr.text((x + 8, y + 6), view, fill=(150, 140, 120), font=font(14))
        manifest['views'].append({'view': view, 'label': LABELS[i], 'status': status})

    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    if out.suffix.lower() != '.png':
        sheet.convert('RGB').save(out)
    (out.parent / (out.stem + '-manifest.json')).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'OK: {out}  cells={per_row}x{rows_n}  missing={missing}')
    return 0


def build_template(out: Path, cell: tuple[int, int], rows: int):
    cols = len(VIEWS) if rows == 1 else (len(VIEWS) + 1) // 2
    label_h = 34
    cw, ch = cell
    sheet = Image.new('RGBA', (cols * cw, rows * (ch + label_h)), (250, 248, 242, 255))
    dr = ImageDraw.Draw(sheet)
    fnt = font(20)
    for i, view in enumerate(VIEWS):
        r = i // cols
        c = i % cols
        x, y = c * cw, r * (ch + label_h)
        for gx in range(x, x + cw, 20):
            dr.line([(gx, y), (gx, y + ch)], fill=(232, 228, 218, 255))
        for gy in range(y, y + ch, 20):
            dr.line([(x, gy), (x + cw, gy)], fill=(232, 228, 218, 255))
        dr.rectangle([x, y, x + cw, y + ch], outline=(120, 100, 70, 255), width=2)
        dr.line([(x, y + ch - 24), (x + cw, y + ch - 24)], fill=(200, 60, 60, 180), width=2)  # 脚底基线
        dr.text((x + 10, y + 8), f'{LABELS[i]}  ({view})', fill=(80, 70, 55), font=fnt)
        dr.text((x + 10, y + ch + 6), '脚底基线 ↑', fill=(160, 150, 130), font=font(16))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert('RGB').save(out)
    print(f'OK template: {out}')
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--input')
    ap.add_argument('--out')
    ap.add_argument('--template')
    ap.add_argument('--cell', default='320x320')
    ap.add_argument('--bg', default='#14100c')
    ap.add_argument('--rows', type=int, default=1)
    args = ap.parse_args()

    cell = parse_cell(args.cell)
    if args.template:
        return build_template(Path(args.template), cell, args.rows)
    if not args.input or not args.out:
        print('ERROR: need --input and --out (or --template)')
        return 1
    return build_sheet(Path(args.input), Path(args.out), cell, args.bg, args.rows)


if __name__ == '__main__':
    raise SystemExit(main())
