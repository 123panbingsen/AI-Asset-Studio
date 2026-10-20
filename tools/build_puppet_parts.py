"""
生成 2D 骨骼角色的分层部件（头/躯干/手臂/腿/武器/披风）。

输出:
  assets/resources/char/puppet_guanyu/<part>.png
  parts.json（尺寸与枢轴说明）

部件都画成透明背景，枢轴在部件底部（关节处）。
"""
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(r'C:\Users\Administrator\EclipsedBlade\assets\resources\char\puppet_guanyu')
S = 2  # 2x 超采样

RED = (138, 42, 26, 255)
RED_D = (92, 26, 16, 255)
GOLD = (201, 161, 90, 255)
GOLD_D = (150, 116, 58, 255)
SKIN = (232, 201, 160, 255)
DARK = (42, 35, 32, 255)
WHITE = (245, 240, 230, 255)
STEEL = (200, 205, 210, 255)


def canvas(w, h):
    return Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))


def sc(v):
    return int(v * S)


def draw_head():
    w, h = 100, 104
    im = canvas(w, h)
    d = ImageDraw.Draw(im)
    # 脖子
    d.rectangle([sc(42), sc(80), sc(58), sc(104)], fill=SKIN)
    # 脸
    d.ellipse([sc(12), sc(6), sc(88), sc(86)], fill=SKIN, outline=DARK, width=sc(2))
    # 头发
    d.pieslice([sc(10), sc(2), sc(90), sc(70)], 180, 360, fill=DARK)
    # 头盔金边
    d.arc([sc(10), sc(2), sc(90), sc(70)], 180, 360, fill=GOLD, width=sc(5))
    d.rectangle([sc(46), sc(0), sc(54), sc(14)], fill=GOLD)
    # 眉眼
    d.ellipse([sc(30), sc(44), sc(38), sc(52)], fill=DARK)
    d.ellipse([sc(62), sc(44), sc(70), sc(52)], fill=DARK)
    d.line([sc(28), sc(38), sc(40), sc(35)], fill=DARK, width=sc(2))
    d.line([sc(60), sc(35), sc(72), sc(38)], fill=DARK, width=sc(2))
    # 嘴
    d.arc([sc(42), sc(56), sc(58), sc(70)], 20, 160, fill=DARK, width=sc(2))
    return im


def draw_torso():
    w, h = 100, 120
    im = canvas(w, h)
    d = ImageDraw.Draw(im)
    # 躯干（上宽下窄）
    d.polygon([(sc(8), sc(20)), (sc(92), sc(20)), (sc(84), sc(104)), (sc(16), sc(104))], fill=RED, outline=DARK)
    # 胸甲
    d.rectangle([sc(18), sc(28), sc(82), sc(70)], fill=RED, outline=GOLD_D, width=sc(2))
    # 金边
    d.line([sc(8), sc(20), sc(92), sc(20)], fill=GOLD, width=sc(6))
    d.line([sc(18), sc(70), sc(82), sc(70)], fill=GOLD, width=sc(4))
    # 腰带
    d.rectangle([sc(14), sc(88), sc(86), sc(100)], fill=GOLD, outline=GOLD_D)
    d.ellipse([sc(44), sc(88), sc(56), sc(100)], fill=RED_D)
    return im


def draw_arm():
    w, h = 32, 78
    im = canvas(w, h)
    d = ImageDraw.Draw(im)
    # 袖子
    d.rounded_rectangle([sc(6), sc(0), sc(26), sc(44)], radius=sc(8), fill=RED, outline=DARK)
    # 护腕
    d.rectangle([sc(5), sc(42), sc(27), sc(52)], fill=GOLD, outline=GOLD_D)
    # 手
    d.ellipse([sc(7), sc(50), sc(25), sc(66)], fill=SKIN, outline=DARK)
    return im


def draw_hand():
    w, h = 26, 22
    im = canvas(w, h)
    d = ImageDraw.Draw(im)
    d.ellipse([sc(2), sc(2), sc(24), sc(20)], fill=SKIN, outline=DARK)
    return im


def draw_leg():
    w, h = 40, 90
    im = canvas(w, h)
    d = ImageDraw.Draw(im)
    # 裤
    d.rounded_rectangle([sc(8), sc(0), sc(32), sc(56)], radius=sc(8), fill=DARK)
    # 绑腿
    d.rectangle([sc(9), sc(54), sc(31), sc(62)], fill=GOLD_D)
    # 靴
    d.rounded_rectangle([sc(6), sc(60), sc(34), sc(88)], radius=sc(6), fill=(60, 40, 26, 255), outline=DARK)
    return im


def draw_sword():
    w, h = 30, 170
    im = canvas(w, h)
    d = ImageDraw.Draw(im)
    # 刀刃
    d.polygon([(sc(13), sc(6)), (sc(17), sc(6)), (sc(19), sc(118)), (sc(15), sc(140)), (sc(11), sc(118))], fill=STEEL, outline=DARK)
    d.line([sc(15), sc(12), sc(15), sc(120)], fill=WHITE, width=sc(2))
    # 护手
    d.rectangle([sc(2), sc(118), sc(28), sc(128)], fill=GOLD, outline=GOLD_D)
    # 剑柄
    d.rectangle([sc(11), sc(128), sc(19), sc(162)], fill=(90, 50, 30, 255), outline=DARK)
    d.ellipse([sc(10), sc(160), sc(20), sc(170)], fill=GOLD)
    return im


def draw_cape():
    w, h = 120, 150
    im = canvas(w, h)
    d = ImageDraw.Draw(im)
    d.polygon([(sc(10), sc(0)), (sc(110), sc(0)), (sc(98), sc(140)), (sc(60), sc(120)), (sc(22), sc(140))],
              fill=RED_D, outline=DARK)
    d.line([sc(60), sc(4), sc(60), sc(124)], fill=GOLD, width=sc(2))
    return im


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    parts = {
        'head': draw_head(),
        'torso': draw_torso(),
        'arm': draw_arm(),
        'hand': draw_hand(),
        'leg': draw_leg(),
        'sword': draw_sword(),
        'cape': draw_cape(),
    }
    meta = {'pivot': 'bottom-center', 'scale': S, 'parts': {}}
    for name, im in parts.items():
        im.save(OUT / f'{name}.png')
        meta['parts'][name] = {'w': im.width // S, 'h': im.height // S}
        print(name, im.size)
    (OUT / 'parts.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding='utf-8')
    print('OK ->', OUT)


if __name__ == '__main__':
    main()
