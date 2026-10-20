"""生成后端：Mock / 阿里云百炼 DashScope / OpenAI 兼容网关。

所有 provider 返回 PIL.Image 列表，失败抛 RuntimeError（中文信息）。
"""
from __future__ import annotations

import base64
import io
import math
import random
import time
from typing import Callable, List, Optional

import requests
from PIL import Image, ImageDraw, ImageFont

Progress = Optional[Callable[[str], None]]


def _ref_data_url(path: str) -> str:
    """把本地参考图转成 data URL（Seedream 图生图入参）。"""
    import mimetypes
    mime = mimetypes.guess_type(path)[0] or "image/png"
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _log(cb: Progress, msg: str) -> None:
    if cb:
        cb(msg)


# 比例 → 宽高（Mock/网关通用）；豆包使用已验证尺寸表
RATIO_DIMS = {
    "1:1": (1, 1), "4:3": (4, 3), "3:4": (3, 4),
    "16:9": (16, 9), "9:16": (9, 16), "3:2": (3, 2), "2:3": (2, 3),
}

DOUBAO_SIZES = {
    "1:1": "1024x1024", "4:3": "1152x864", "3:4": "864x1152",
    "16:9": "1280x720", "9:16": "720x1280", "3:2": "1248x832",
    "2:3": "832x1248", "9:16 高清": "1440x2560",
}


def ratio_wh(size: int, ratio: str = "1:1"):
    """按短边 size 与比例算宽高，限制在 256–1536。"""
    rw, rh = RATIO_DIMS.get(ratio, (1, 1))
    short = max(256, min(int(size), 1536))
    if rw >= rh:
        h = short
        w = int(short * rw / rh)
    else:
        w = short
        h = int(short * rh / rw)
    return max(256, min(w, 2048)), max(256, min(h, 2048))


# --------------------------------------------------------------------------- mock

def _mock_image(prompt: str, w: int, h: int, index: int) -> Image.Image:
    """生成一张可离线演示的占位资产：浅色背景 + 主体图形，便于抠图/拆层测试。"""
    rnd = random.Random(hash(prompt) + index * 977)
    im = Image.new("RGBA", (w, h), (236, 233, 226, 255))
    d = ImageDraw.Draw(im)
    # 背景微纹理
    for _ in range(80):
        x = rnd.randint(0, w); y = rnd.randint(0, h)
        r = rnd.randint(1, 3)
        d.ellipse([x, y, x + r, y + r], fill=(224, 220, 210, 255))

    # 主体：盾形 + 圆环 + 内部符号
    cx, cy = w // 2, h // 2
    s = min(w, h) * 0.52
    colors = [(212, 172, 84), (168, 72, 64), (70, 110, 150), (120, 160, 110), (150, 110, 180)]
    base = colors[index % len(colors)]
    dark = tuple(max(0, c - 55) for c in base)

    pts = [(cx, cy - s / 2), (cx + s / 2, cy - s / 4), (cx + s / 2, cy + s / 5),
           (cx, cy + s / 2), (cx - s / 2, cy + s / 5), (cx - s / 2, cy - s / 4)]
    d.polygon(pts, fill=base + (255,), outline=dark + (255,), width=max(2, min(w, h) // 220))
    d.ellipse([cx - s * 0.3, cy - s * 0.3, cx + s * 0.3, cy + s * 0.3],
              outline=(250, 244, 220, 255), width=max(2, min(w, h) // 180))
    for a in range(0, 360, 60):
        rad = math.radians(a)
        x1 = cx + math.cos(rad) * s * 0.3
        y1 = cy + math.sin(rad) * s * 0.3
        x2 = cx + math.cos(rad) * s * 0.42
        y2 = cy + math.sin(rad) * s * 0.42
        d.line([x1, y1, x2, y2], fill=(250, 244, 220, 255), width=max(2, min(w, h) // 200))

    # 标签
    try:
        font = ImageFont.load_default(size=max(16, min(w, h) // 28))
    except Exception:
        font = ImageFont.load_default()
    label = f"MOCK {index + 1}"
    d.text((w // 2, h - h // 12), label, fill=(60, 55, 48, 255), font=font, anchor="mm")
    return im


class MockProvider:
    name = "mock"

    def generate(self, prompt: str, negative: str, size: int, count: int,
                 ref_path: str | None = None, progress: Progress = None,
                 ratio: str = "1:1", refs: List[str] | None = None) -> List[Image.Image]:
        _log(progress, f"Mock 生成中（{ratio}，无需 API Key）…")
        w, h = ratio_wh(size, ratio)
        out = []
        for i in range(max(1, count)):
            time.sleep(0.15)
            out.append(_mock_image(prompt, w, h, i))
            _log(progress, f"Mock 完成 {i + 1}/{count}")
        return out


# ---------------------------------------------------------------------- dashscope

DASH_BASE = "https://dashscope.aliyuncs.com/api/v1"


class DashScopeProvider:
    """阿里云百炼文生图（Wanx / Qwen-Image），异步任务轮询。"""

    name = "dashscope"

    def __init__(self, api_key: str, model: str = "wanx2.1-t2i-turbo"):
        if not api_key:
            raise RuntimeError("未配置 DashScope API Key，请到「设置」填写")
        self.api_key = api_key.strip()
        self.model = (model or "wanx2.1-t2i-turbo").strip()

    @property
    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json",
                "X-DashScope-Async": "enable"}

    def generate(self, prompt: str, negative: str, size: int, count: int,
                 ref_path: str | None = None, progress: Progress = None,
                 ratio: str = "1:1", refs: List[str] | None = None) -> List[Image.Image]:
        w, h = ratio_wh(size, ratio)
        wanx = {(1280, 720): "1280*720", (720, 1280): "720*1280"}
        size_str = wanx.get((w, h), "1024*1024")
        _log(progress, f"提交 DashScope 任务（{self.model}，{size_str}）…")
        payload = {
            "model": self.model,
            "input": {"prompt": prompt, "negative_prompt": negative or ""},
            "parameters": {"size": size_str, "n": max(1, count)},
        }
        r = requests.post(f"{DASH_BASE}/services/aigc/text2image/image-synthesis",
                          headers=self._headers, json=payload, timeout=60)
        if r.status_code >= 400:
            raise RuntimeError(f"DashScope 提交失败 {r.status_code}: {r.text[:300]}")
        data = r.json()
        task_id = (data.get("output") or {}).get("task_id")
        if not task_id:
            raise RuntimeError(f"DashScope 无 task_id: {str(data)[:300]}")

        urls: List[str] = []
        deadline = time.time() + 240
        while time.time() < deadline:
            time.sleep(3)
            _log(progress, "等待生成结果…")
            q = requests.get(f"{DASH_BASE}/tasks/{task_id}",
                             headers={"Authorization": f"Bearer {self.api_key}"}, timeout=30)
            if q.status_code >= 400:
                raise RuntimeError(f"DashScope 查询失败 {q.status_code}: {q.text[:300]}")
            out = q.json().get("output") or {}
            status = out.get("task_status") or out.get("status")
            if status in ("SUCCEEDED", "SUCCESS"):
                for item in out.get("results") or []:
                    u = item.get("url") or item.get("image_url")
                    if u:
                        urls.append(u)
                break
            if status in ("FAILED", "CANCELED"):
                raise RuntimeError(f"DashScope 任务失败: {str(out)[:300]}")
        if not urls:
            raise RuntimeError("DashScope 超时或没有返回图片")

        imgs: List[Image.Image] = []
        for u in urls:
            _log(progress, "下载结果…")
            b = requests.get(u, timeout=120).content
            imgs.append(Image.open(io.BytesIO(b)).convert("RGB"))
        return imgs


# ------------------------------------------------------------------ openai compat

class OpenAICompatProvider:
    """OpenAI 兼容的 /images/generations 网关（硅基流动、自建网关等）。"""

    name = "openai"

    def __init__(self, base: str, api_key: str, model: str):
        if not base or not api_key:
            raise RuntimeError("未配置 OpenAI 兼容网关地址/Key，请到「设置」填写")
        self.base = base.rstrip("/")
        self.api_key = api_key.strip()
        self.model = (model or "").strip()
        if not self.model:
            raise RuntimeError("未配置模型名，请到「设置」填写")

    def generate(self, prompt: str, negative: str, size: int, count: int,
                 ref_path: str | None = None, progress: Progress = None,
                 ratio: str = "1:1", refs: List[str] | None = None) -> List[Image.Image]:
        _log(progress, f"请求 {self.base}/images/generations（{ratio}）…")
        w, h = ratio_wh(size, ratio)
        payload = {
            "model": self.model,
            "prompt": prompt if not negative else f"{prompt}\n负面：{negative}",
            "size": f"{w}x{h}",
            "n": max(1, count),
            "response_format": "b64_json",
        }
        r = requests.post(f"{self.base}/images/generations",
                          headers={"Authorization": f"Bearer {self.api_key}"},
                          json=payload, timeout=180)
        if r.status_code >= 400:
            raise RuntimeError(f"网关返回 {r.status_code}: {r.text[:300]}")
        data = r.json().get("data") or []
        imgs: List[Image.Image] = []
        for item in data:
            if item.get("b64_json"):
                imgs.append(Image.open(io.BytesIO(base64.b64decode(item["b64_json"]))).convert("RGB"))
            elif item.get("url"):
                b = requests.get(item["url"], timeout=120).content
                imgs.append(Image.open(io.BytesIO(b)).convert("RGB"))
        if not imgs:
            raise RuntimeError("网关没有返回图片")
        return imgs


# -------------------------------------------------------------------- doubao

class DoubaoProvider:
    """火山方舟（豆包 Seedream）文生图，OpenAI 兼容 /images/generations。"""

    name = "doubao"

    def __init__(self, api_key: str, model: str, base: str = "https://ark.cn-beijing.volces.com/api/v3"):
        if not api_key:
            raise RuntimeError("未配置豆包 API Key，请到「设置」填写")
        self.api_key = api_key.strip()
        self.model = (model or "doubao-seedream-4-0-20260415").strip()
        self.base = (base or "https://ark.cn-beijing.volces.com/api/v3").rstrip("/")

    def generate(self, prompt: str, negative: str, size: int, count: int,
                 ref_path: str | None = None, progress: Progress = None,
                 ratio: str = "1:1", refs: List[str] | None = None) -> List[Image.Image]:
        if ratio in DOUBAO_SIZES:
            size_str = DOUBAO_SIZES[ratio]
        else:
            if int(size) * int(size) < 921600:
                _log(progress, f"豆包最小需要 960×960，已自动把 {size} 调整为 1024")
                size = 1024
            size_str = f"{size}x{size}"
        _log(progress, f"请求豆包 Seedream（{self.model}，{size_str}）…")
        payload = {
            "model": self.model,
            "prompt": prompt if not negative else f"{prompt}\n负面提示：{negative}",
            "size": size_str,
            "n": max(1, count),
            "response_format": "b64_json",
            "watermark": False,
        }
        if refs:
            _log(progress, f"图生图：传入 {len(refs)} 张参考图")
            payload["image"] = [_ref_data_url(p) for p in refs]
        r = requests.post(f"{self.base}/images/generations",
                          headers={"Authorization": f"Bearer {self.api_key}",
                                   "Content-Type": "application/json"},
                          json=payload, timeout=180)
        if r.status_code >= 400:
            raise RuntimeError(f"豆包返回 {r.status_code}: {r.text[:300]}")
        data = r.json().get("data") or []
        imgs: List[Image.Image] = []
        for item in data:
            if item.get("b64_json"):
                imgs.append(Image.open(io.BytesIO(base64.b64decode(item["b64_json"]))).convert("RGB"))
            elif item.get("url"):
                b = requests.get(item["url"], timeout=120).content
                imgs.append(Image.open(io.BytesIO(b)).convert("RGB"))
        if not imgs:
            raise RuntimeError("豆包没有返回图片")
        return imgs


def build_provider(cfg: dict):
    kind = (cfg.get("provider") or "mock").lower()
    if kind == "mock":
        return MockProvider()
    if kind == "doubao":
        return DoubaoProvider(cfg.get("doubao_api_key", ""), cfg.get("doubao_model", ""),
                              cfg.get("doubao_base", ""))
    if kind == "dashscope":
        return DashScopeProvider(cfg.get("dashscope_api_key", ""), cfg.get("dashscope_model", ""))
    if kind == "openai":
        return OpenAICompatProvider(cfg.get("openai_base", ""), cfg.get("openai_key", ""),
                                    cfg.get("openai_model", ""))
    raise RuntimeError(f"未知 provider: {kind}")





DASHSCOPE_MODELS = [
    "wanx2.1-t2i-turbo", "wanx2.1-t2i-plus", "wanx-v1",
    "qwen-image", "qwen-image-edit",
]


def static_models(cfg: dict) -> list:
    kind = (cfg.get("provider") or "mock").lower()
    return {
        "mock": ["mock"],
        "doubao": ["doubao-seedream-4-0-20260415", "doubao-seedream-4-0-250828",
                   "doubao-seedream-5-0-pro-260628", "doubao-seedream-5-0-flash-260915"],
        "dashscope": list(DASHSCOPE_MODELS),
        "openai": [],
    }.get(kind, [])


def list_models(cfg: dict) -> list:
    """返回当前 provider 可选的图片模型；失败时回退静态列表。"""
    kind = (cfg.get("provider") or "mock").lower()
    try:
        if kind == "doubao":
            import requests
            base = (cfg.get("doubao_base") or "").rstrip("/")
            r = requests.get(base + "/models",
                             headers={"Authorization": "Bearer " + cfg.get("doubao_api_key", "")},
                             timeout=25)
            if r.status_code < 400:
                ids = [m.get("id", "") for m in (r.json().get("data") or [])]
                out = [i for i in ids if "seedream" in i or "seededit" in i]
                if out:
                    return out
        elif kind == "openai":
            import requests
            base = (cfg.get("openai_base") or "").rstrip("/")
            r = requests.get(base + "/models",
                             headers={"Authorization": "Bearer " + cfg.get("openai_key", "")},
                             timeout=25)
            if r.status_code < 400:
                ids = [m.get("id", "") for m in (r.json().get("data") or [])]
                if ids:
                    return ids
        elif kind == "dashscope":
            return list(DASHSCOPE_MODELS)
    except Exception:
        pass
    fallback = {
        "mock": ["mock"],
        "doubao": ["doubao-seedream-4-0-20260415", "doubao-seedream-4-0-250828",
                   "doubao-seedream-5-0-pro-260628"],
        "dashscope": list(DASHSCOPE_MODELS),
        "openai": [],
    }
    return fallback.get(kind, [])

