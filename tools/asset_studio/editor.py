"""轻量 PS 类图像编辑：旋转/翻转/裁剪/缩放/调色/消除。

基于 Pillow + OpenCV（Apache-2.0 / MIT-CMU），不依赖商业软件。
"""
from __future__ import annotations

from pathlib import Path
from typing import Tuple

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter


class Editor:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.original = Image.open(path).convert("RGBA")
        self.img = self.original.copy()

    # ------------------------------------------------------------------ 基础
    def reset(self):
        self.img = self.original.copy()
        return self.img

    def rotate(self, clockwise: bool = True):
        self.img = self.img.transpose(Image.ROTATE_270 if clockwise else Image.ROTATE_90)
        return self.img

    def flip(self, horizontal: bool = True):
        self.img = self.img.transpose(Image.FLIP_LEFT_RIGHT if horizontal else Image.FLIP_TOP_BOTTOM)
        return self.img

    def resize(self, scale: float):
        w = max(1, int(self.img.width * scale))
        h = max(1, int(self.img.height * scale))
        self.img = self.img.resize((w, h), Image.LANCZOS)
        return self.img

    def crop(self, box: Tuple[int, int, int, int]):
        l, t, r, b = box
        l = max(0, min(l, self.img.width - 1))
        t = max(0, min(t, self.img.height - 1))
        r = max(l + 1, min(r, self.img.width))
        b = max(t + 1, min(b, self.img.height))
        self.img = self.img.crop((l, t, r, b))
        return self.img

    def adjust(self, brightness: float = 1.0, contrast: float = 1.0,
               saturation: float = 1.0, sharpen: float = 0.0):
        img = self.img
        if brightness != 1.0:
            img = ImageEnhance.Brightness(img).enhance(brightness)
        if contrast != 1.0:
            img = ImageEnhance.Contrast(img).enhance(contrast)
        if saturation != 1.0:
            img = ImageEnhance.Color(img).enhance(saturation)
        if sharpen > 0:
            img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=int(60 * sharpen), threshold=3))
        self.img = img.convert("RGBA")
        return self.img

    def auto_contrast(self):
        from PIL import ImageOps
        r, g, b, a = self.img.split()
        rgb = ImageOps.autocontrast(Image.merge("RGB", (r, g, b)))
        rgb = rgb.convert("RGBA")
        rgb.putalpha(a)
        self.img = rgb
        return self.img

    # ------------------------------------------------------------------ 消除
    def inpaint(self, box: Tuple[int, int, int, int]):
        """OpenCV Telea 修复选区（消除小物体/瑕疵）。"""
        try:
            import cv2
        except Exception as e:
            raise RuntimeError("OpenCV 不可用：" + str(e))
        l, t, r, b = box
        arr = np.array(self.img.convert("RGB"))
        mask = np.zeros(arr.shape[:2], dtype=np.uint8)
        mask[max(0, t):min(arr.shape[0], b), max(0, l):min(arr.shape[1], r)] = 255
        bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
        fixed = cv2.inpaint(bgr, mask, 3, cv2.INPAINT_TELEA)
        alpha = np.array(self.img.getchannel("A"))
        rgba = cv2.cvtColor(fixed, cv2.COLOR_BGR2RGBA)
        rgba[:, :, 3] = alpha
        self.img = Image.fromarray(rgba)
        return self.img

    # ------------------------------------------------------------------ 保存
    def save(self, path: str | Path | None = None) -> Path:
        dst = Path(path) if path else self.path.with_name(self.path.stem + "_edited.png")
        self.img.save(dst)
        return dst
