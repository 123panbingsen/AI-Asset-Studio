r"""
从 Desktop\素材\tp_split_out 精选组件，生成 Cocos 皮肤包 skin/sanguo。

- 抹掉素材上烘焙的文字（按钮/标题条），变成可拉伸的 9-slice
- 从货币条裁出金币/勾玉/票券图标
- 输出 PNG + manifest.json
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(r'C:\Users\Administrator\Desktop\素材\tp_split_out')
OUT = Path(r'C:\Users\Administrator\EclipsedBlade\assets\resources\skin\sanguo')

# 源文件（精确文件名）
GOLD_BTN = '暗金水墨风中国武侠游戏界面素材集 (1)_073.png'   # 152x44 金币胶囊
DARK_BTN = '三国古风游戏UI组件图鉴 (1)_002.png'            # 214x37 深色标题条
TITLE_BAR = '11dz_000.png'                                 # 274x35 标题条
RING = '三国风金红UI图标组件图谱 (1)_016.png'              # 196x194 圆框
SLOT = '11dz_003.png'                                       # 96x83 技能槽
BAR = '三国古风游戏UI组件图鉴 (1)_020.png'                 # 251x25 进度条
COIN = '三国风金红UI图标组件图谱 (1)_001.png'              # 171x71 货币条
GEM = '三国风金红UI图标组件图谱 (1)_002.png'
TICKET = '三国风金红UI图标组件图谱 (1)_003.png'


def blank_center(im: Image.Image, wr: float = 0.62, hr: float = 0.55) -> Image.Image:
    """用左右两侧的背景色填充中间文字区域（按行取中值，保留渐变）。"""
    a = np.array(im.convert('RGBA')).astype(np.float32)
    h, w = a.shape[:2]
    x0 = int(w * (1 - wr) / 2)
    x1 = int(w * (1 + wr) / 2)
    y0 = int(h * (1 - hr) / 2)
    y1 = int(h * (1 + hr) / 2)
    for y in range(y0, y1):
        row = a[y]
        left = row[max(0, x0 - 18):x0]
        right = row[x1:min(w, x1 + 18)]
        samples = np.concatenate([left, right], axis=0)
        samples = samples[samples[:, 3] > 40]
        if len(samples) == 0:
            continue
        color = np.median(samples, axis=0)
        a[y, x0:x1] = color
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


def blank_flat(im: Image.Image, wr: float = 0.9, hr: float = 0.6, color=None) -> Image.Image:
    """用纯色填掉中间文字（适合标题条/槽位）"""
    a = np.array(im.convert('RGBA')).astype(np.float32)
    h, w = a.shape[:2]
    if color is None:
        samples = a[a[:, :, 3] > 40][:, :3]
        color = np.median(samples, axis=0)
    x0 = int(w * (1 - wr) / 2)
    x1 = int(w * (1 + wr) / 2)
    y0 = int(h * (1 - hr) / 2)
    y1 = int(h * (1 + hr) / 2)
    a[y0:y1, x0:x1, 0:3] = color
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


def crop_icon(im: Image.Image, box) -> Image.Image:
    """裁出图标：取 alpha 连通域中面积最大的那个（排除旁边的数字）"""
    from scipy import ndimage
    crop = im.crop(box)
    a = np.array(crop)
    mask = a[:, :, 3] > 30
    labels, n = ndimage.label(mask)
    if n == 0:
        return crop
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    best = int(np.argmax(sizes)) + 1
    ys, xs = np.where(labels == best)
    pad = 2
    x0 = max(0, xs.min() - pad)
    y0 = max(0, ys.min() - pad)
    x1 = min(crop.width, xs.max() + 1 + pad)
    y1 = min(crop.height, ys.max() + 1 + pad)
    return crop.crop((x0, y0, x1, y1))


def save(im: Image.Image, name: str) -> None:
    im.save(OUT / f'{name}.png')
    print('  ', name, im.size)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.png'):
        old.unlink()

    gold = Image.open(SRC / GOLD_BTN).convert('RGBA')
    gold = blank_center(gold, 0.5, 0.45)
    save(gold, 'btn-primary')

    dark = Image.open(SRC / DARK_BTN).convert('RGBA')
    dark = blank_center(dark, 0.72, 0.5)
    save(dark, 'btn-secondary')

    title = Image.open(SRC / TITLE_BAR).convert('RGBA')
    title = blank_flat(title, 0.92, 0.62, (26, 20, 14))
    save(title, 'title-bar')

    ring = Image.open(SRC / RING).convert('RGBA')
    save(ring, 'ring')

    slot = Image.open(SRC / SLOT).convert('RGBA')
    slot = blank_flat(slot, 0.55, 0.35)
    save(slot, 'slot')

    bar = Image.open(SRC / BAR).convert('RGBA')
    save(bar, 'bar')

    save(crop_icon(Image.open(SRC / COIN).convert('RGBA'), (10, 8, 74, 70)), 'icon-coin')
    save(crop_icon(Image.open(SRC / GEM).convert('RGBA'), (10, 8, 70, 70)), 'icon-gem')
    save(crop_icon(Image.open(SRC / TICKET).convert('RGBA'), (10, 8, 72, 70)), 'icon-ticket')

    manifest = {
        'set': 'sanguo',
        'version': 2,
        'source': r'Desktop\素材\tp_split_out',
        'keys': {
            'panel': {'tex': 'skin/darkgold/panel', 'slice': [30, 26, 30, 26], 'tint': '#ffffff'},
            'panel_dark': {'tex': 'skin/darkgold/panel-dark', 'slice': [28, 24, 28, 24], 'tint': '#ffffff'},
            'btn_primary': {'tex': 'skin/sanguo/btn-primary', 'slice': [26, 16, 26, 16], 'tint': '#ffffff'},
            'btn_secondary': {'tex': 'skin/sanguo/btn-secondary', 'slice': [22, 14, 22, 14], 'tint': '#ffffff'},
            'title_bar': {'tex': 'skin/sanguo/title-bar', 'nine': False, 'tint': '#ffffff'},
            'frame_gold': {'tex': 'skin/sanguo/ring', 'nine': False, 'tint': '#ffffff'},
            'slot': {'tex': 'skin/sanguo/slot', 'slice': [20, 20, 20, 20], 'tint': '#ffffff'},
            'bar': {'tex': 'skin/sanguo/bar', 'slice': [12, 6, 12, 6], 'tint': '#ffffff'},
            'icon_coin': {'tex': 'skin/sanguo/icon-coin', 'nine': False, 'tint': '#ffffff'},
            'icon_gem': {'tex': 'skin/sanguo/icon-gem', 'nine': False, 'tint': '#ffffff'},
            'icon_ticket': {'tex': 'skin/sanguo/icon-ticket', 'nine': False, 'tint': '#ffffff'},
            'scrim': {'tex': 'skin/darkgold/scrim', 'nine': False, 'tint': '#ffffff'},
        },
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding='utf-8')
    print('OK ->', OUT)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
