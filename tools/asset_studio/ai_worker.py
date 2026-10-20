"""AI 子进程：BiRefNet 抠图 / Real-ESRGAN 超分。

由桌面程序用本地 venv 的 python 调用，避免把 PyTorch/ONNX 依赖打进 exe。
用法：
    python ai_worker.py matte in.png out.png [model]
    python ai_worker.py upscale in.png out.png [factor]
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from PIL import Image


def matte(inp: str, out: str, model: str = "birefnet-general-lite") -> None:
    from rembg import new_session, remove
    sess = new_session(model)
    im = Image.open(inp).convert("RGBA")
    res = remove(im, session=sess, post_process_mask=True)
    res.save(out)


def upscale(inp: str, out: str, factor: int = 2,
            exe: str | None = None, model: str = "realesrgan-x4plus") -> None:
    if exe is None:
        exe = str(Path(__file__).parent / "realesrgan" / "realesrgan-ncnn-vulkan.exe")
    if not Path(exe).exists():
        raise RuntimeError("Real-ESRGAN 可执行文件不存在：" + exe)
    cmd = [exe, "-i", inp, "-o", out, "-n", model, "-s", str(factor)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not Path(out).exists():
        raise RuntimeError("Real-ESRGAN 失败：" + (r.stderr or r.stdout)[-300:])


def inpaint(inp: str, out: str, box: str) -> None:
    import cv2
    import numpy as np
    im = Image.open(inp).convert("RGBA")
    arr = np.array(im.convert("RGB"))
    l, t, r, b = [int(v) for v in box.split(",")]
    mask = np.zeros(arr.shape[:2], dtype=np.uint8)
    mask[max(0, t):min(arr.shape[0], b), max(0, l):min(arr.shape[1], r)] = 255
    fixed = cv2.inpaint(cv2.cvtColor(arr, cv2.COLOR_RGB2BGR), mask, 3, cv2.INPAINT_TELEA)
    rgba = cv2.cvtColor(fixed, cv2.COLOR_BGR2RGBA)
    rgba[:, :, 3] = np.array(im.getchannel("A"))
    Image.fromarray(rgba).save(out)


def inpaint_lama(inp: str, out: str, box: str) -> None:
    """LaMa (big-lama JIT) 高质量消除：ROI 裁切 → 512 推理 → 羽化回贴。"""
    import numpy as np
    import torch
    from PIL import ImageFilter

    model_path = Path(__file__).parent / "models" / "big-lama.pt"
    if not model_path.exists():
        raise RuntimeError(f"LaMa 模型缺失：{model_path}（首次使用会自动下载）")

    im = Image.open(inp).convert("RGBA")
    W, H = im.size
    l, t, r, b = [int(v) for v in box.split(",")]
    l, t, r, b = max(0, l), max(0, t), min(W, r), min(H, b)
    if r <= l or b <= t:
        raise RuntimeError("选区为空")

    mw, mh = r - l, b - t
    margin = int(max(mw, mh) * 0.75) + 16
    side = max(mw, mh) + 2 * margin
    cx, cy = (l + r) // 2, (t + b) // 2
    x0 = max(0, min(W - side, cx - side // 2))
    y0 = max(0, min(H - side, cy - side // 2))
    x1, y1 = min(W, x0 + side), min(H, y0 + side)

    crop = im.crop((x0, y0, x1, y1)).convert("RGB")
    crop_w, crop_h = crop.size
    mask = Image.new("L", im.size, 0)
    mask.paste(255, (l, t, r, b))
    crop_mask = mask.crop((x0, y0, x1, y1))

    # 模型输入 0-1，尺寸 512（8 的倍数）
    work = crop.resize((512, 512), Image.LANCZOS)
    mwork = crop_mask.resize((512, 512), Image.NEAREST)
    a = np.asarray(work, dtype=np.float32) / 255.0
    k = np.asarray(mwork, dtype=np.float32) / 255.0

    model = torch.jit.load(str(model_path), map_location="cpu")
    model.eval()
    with torch.no_grad():
        pred = model(torch.from_numpy(a).permute(2, 0, 1)[None],
                     torch.from_numpy(k)[None, None])
    arr = np.clip(pred[0].permute(1, 2, 0).numpy(), 0.0, 1.0)
    pred_img = Image.fromarray((arr * 255).astype(np.uint8)).resize((crop_w, crop_h), Image.LANCZOS)

    feather = crop_mask.filter(ImageFilter.GaussianBlur(3))
    result = im.copy()
    region = result.crop((x0, y0, x1, y1))
    region.paste(pred_img, (0, 0), feather)
    result.paste(region, (x0, y0))
    result.save(out)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["matte", "upscale", "inpaint", "inpaint_lama"])
    ap.add_argument("inp")
    ap.add_argument("out")
    ap.add_argument("arg", nargs="?", default="")
    args = ap.parse_args(argv)
    if args.cmd == "matte":
        matte(args.inp, args.out, args.arg or "birefnet-general-lite")
    elif args.cmd == "inpaint":
        inpaint(args.inp, args.out, args.arg)
    elif args.cmd == "inpaint_lama":
        inpaint_lama(args.inp, args.out, args.arg)
    else:
        upscale(args.inp, args.out, int(args.arg or 2))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

