"""
slice_skin.py — 把 UI 组件图集切成独立 PNG，并生成带序号的拼版预览。

用法:
  python slice_skin.py                     # 用默认素材目录，输出到 EclipsedBlade
  python slice_skin.py --min-area 600
  python slice_skin.py --src <素材目录> --out <输出目录>
"""
import os
import json
import argparse
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SHEETS = [
    ('三国古风游戏UI组件图鉴 (1).png', 'sanguo'),
    ('三国风金红UI图标组件图谱 (1).png', 'jinHong'),
    ('暗金水墨风中国武侠游戏界面素材集 (1).png', 'anJin'),
    ('11dz.png', 'eleven'),
]

DEFAULT_SRC = r'C:\Users\Administrator\Desktop\素材'
DEFAULT_OUT = r'C:\Users\Administrator\EclipsedBlade\assets\resources\skin\darkgold'


def label_components(mask):
    H, W = mask.shape
    parent = {}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    bbox = {}
    prev = []
    rid = 0
    for y in range(H):
        row = mask[y]
        if not row.any():
            prev = []
            continue
        d = np.diff(np.concatenate(([0], row.astype(np.int8), [0])))
        starts = np.where(d == 1)[0]
        ends = np.where(d == -1)[0] - 1
        cur = []
        for s, e in zip(starts, ends):
            r = rid
            rid += 1
            parent[r] = r
            bbox[r] = [int(s), int(y), int(e), int(y)]
            for (ps, pe, pr) in prev:
                if s <= pe + 1 and e >= ps - 1:
                    union(r, pr)
            cur.append((s, e, r))
        prev = cur

    boxes = {}
    for r in parent:
        rr = find(r)
        b = bbox[r]
        if rr not in boxes:
            boxes[rr] = list(b)
        else:
            bb = boxes[rr]
            bb[0] = min(bb[0], b[0])
            bb[1] = min(bb[1], b[1])
            bb[2] = max(bb[2], b[2])
            bb[3] = max(bb[3], b[3])
    return list(boxes.values())


def text_font(size=16):
    for f in [r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\arial.ttf']:
        if os.path.exists(f):
            try:
                return ImageFont.truetype(f, size)
            except Exception:
                pass
    return ImageFont.load_default()


def build_atlas(items, src_key, out_dir, per_page=20, cols=5):
    cell_w, cell_h = 250, 300
    rows = (per_page + cols - 1) // cols
    font = text_font(15)
    pages = []
    for p in range(0, len(items), per_page):
        chunk = items[p:p + per_page]
        canvas = Image.new('RGB', (cols * cell_w, rows * cell_h), (14, 12, 9))
        dr = ImageDraw.Draw(canvas)
        for i, it in enumerate(chunk):
            r, c = divmod(i, cols)
            x = c * cell_w
            y = r * cell_h
            thumb = it['image'].copy()
            thumb.thumbnail((cell_w - 20, cell_h - 60))
            canvas.paste(thumb, (x + (cell_w - thumb.width) // 2, y + 10), thumb)
            label = '#%03d  %dx%d' % (it['index'], it['w'], it['h'])
            dr.rectangle([x + 6, y + 8, x + 200, y + 28], fill=(0, 0, 0))
            dr.text((x + 8, y + 10), label, fill=(232, 210, 142), font=font)
        path = os.path.join(out_dir, 'atlas-%s-%d.png' % (src_key, p // per_page + 1))
        canvas.save(path)
        pages.append(path)
    return pages


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=DEFAULT_SRC)
    ap.add_argument('--out', default=DEFAULT_OUT)
    ap.add_argument('--min-area', type=int, default=400)
    ap.add_argument('--pad', type=int, default=2)
    ap.add_argument('--thr', type=int, default=0)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    index = []
    global_i = 0

    for fname, src_key in SHEETS:
        path = os.path.join(args.src, fname)
        if not os.path.exists(path):
            print('skip missing:', fname)
            continue
        im = Image.open(path).convert('RGBA')
        arr = np.array(im)
        alpha = arr[:, :, 3]
        mask = alpha > args.thr
        boxes = label_components(mask)
        parts = []
        for b in boxes:
            x0, y0, x1, y1 = b
            w = x1 - x0 + 1
            h = y1 - y0 + 1
            if w * h < args.min_area:
                continue
            if w < 12 or h < 12:
                continue
            px0 = max(0, x0 - args.pad)
            py0 = max(0, y0 - args.pad)
            px1 = min(im.width - 1, x1 + args.pad)
            py1 = min(im.height - 1, y1 + args.pad)
            crop = im.crop((px0, py0, px1 + 1, py1 + 1))
            parts.append({
                'image': crop, 'w': crop.width, 'h': crop.height,
                'x': px0, 'y': py0, 'source': src_key,
            })
        # 大件优先，编号稳定
        parts.sort(key=lambda p: (p['w'] * p['h'], p['x'], p['y']), reverse=True)
        print('%s -> %d parts (min_area=%d)' % (fname, len(parts), args.min_area))

        for it in parts:
            it['index'] = global_i
            out_name = 'p%03d.png' % global_i
            it['image'].save(os.path.join(args.out, out_name))
            index.append({
                'id': 'p%03d' % global_i,
                'file': out_name,
                'source': src_key,
                'w': it['w'],
                'h': it['h'],
                'x': it['x'],
                'y': it['y'],
                'area': it['w'] * it['h'],
            })
            global_i += 1

        build_atlas(parts, src_key, args.out)

    with open(os.path.join(args.out, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump({'count': len(index), 'parts': index}, f, ensure_ascii=False, indent=1)
    print('total parts:', len(index))
    print('out:', args.out)


if __name__ == '__main__':
    main()
