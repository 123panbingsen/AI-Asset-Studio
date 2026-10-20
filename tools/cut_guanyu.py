"""
处理关羽立绘：HSV 前景分割（背景=低饱和高亮，角色=高饱和/偏暗），
形态学 + 最大连通域 + 去底部小图标，输出透明 PNG。
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

SRC = Path(r'C:\Users\Administrator\.dsh\attachments\v1\objects\3f\3fba5d80b78ac7ab474dfd296914397813ed2597735c206b67eee53957c84faf')
OUT = Path(r'C:\Users\Administrator\EclipsedBlade\assets\resources\char\guanyu_art')
SCALE = 2


def cut(im: Image.Image) -> Image.Image:
    rgb = np.array(im.convert('RGB')).astype(np.float32)
    hsv = np.array(im.convert('HSV')).astype(np.float32)
    H, S, V = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    h, w = H.shape

    # 背景：低饱和 + 高亮；角色：有颜色（绿袍/肤色）或偏暗（甲/须/兵器）
    mask = (S > 38) | (V < 160)
    # 皮肤/浅绿也保留
    mask |= (H > 60) & (H < 160) & (S > 22)

    mask = ndimage.binary_closing(mask, structure=np.ones((7, 7)), iterations=2)
    mask = ndimage.binary_fill_holes(mask)
    mask = ndimage.binary_opening(mask, structure=np.ones((3, 3)), iterations=1)

    labels, n = ndimage.label(mask)
    if n == 0:
        return im
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    keep = np.zeros_like(mask)
    main = sizes.max()
    for i, s in enumerate(sizes, start=1):
        if s < max(500, main * 0.01):
            continue
        ys = np.where(labels == i)[0]
        # 去掉贴底部的小图标（水印）
        if ys.mean() > h * 0.95 and s < main * 0.2:
            continue
        keep |= labels == i
    mask = keep

    # 再补一次最大连通域
    labels, n = ndimage.label(mask)
    if n:
        sizes = ndimage.sum(mask, labels, range(1, n + 1))
        mask = labels == (int(np.argmax(sizes)) + 1)

    alpha = ndimage.gaussian_filter(mask.astype(np.float32), 0.7)
    alpha = np.clip((alpha - 0.25) / 0.75, 0, 1)

    # 去掉底部左右两角的水印图标（保留中间脚部）
    bottom = int(h * 0.92)
    alpha[bottom:, :int(w * 0.30)] = 0
    alpha[bottom:, int(w * 0.62):] = 0
    # 底边残字与右侧边缘杂点
    alpha[int(h * 0.975):, :int(w * 0.42)] = 0
    alpha[int(h * 0.85):, int(w * 0.93):] = 0

    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    im2 = Image.fromarray(out, 'RGBA')
    bbox = im2.getbbox()
    if bbox:
        im2 = im2.crop(bbox)
    return im2


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    im = Image.open(SRC).convert('RGBA')
    im = cut(im)
    im = im.resize((im.width * SCALE, im.height * SCALE), Image.LANCZOS)
    im.save(OUT / 'portrait.png')
    print('portrait', im.size)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
