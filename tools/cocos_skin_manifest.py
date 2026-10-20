"""
cocos_skin_manifest.py — 从 game-ui-design-workflow 的 Cocos JSON 派生运行时皮肤清单。

输入:
  specs/eclipsedblade/exports/cocos/ui-main.json   (capInsets / originalSize)
  specs/eclipsedblade/assets/sprites/darkgold/items/*.png

输出:
  assets/resources/skin/darkgold/<semantic>.png    (语义命名副本)
  assets/resources/skin/darkgold/manifest.json     (运行时 manifest v2)

用法:
  python tools/cocos_skin_manifest.py
"""
import json
import shutil
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
SPEC = PROJECT / 'specs' / 'eclipsedblade'
COCOS_JSON = SPEC / 'exports' / 'cocos' / 'ui-main.json'
ITEMS_DIR = SPEC / 'assets' / 'sprites' / 'darkgold' / 'items'
OUT_DIR = PROJECT / 'assets' / 'resources' / 'skin' / 'darkgold'

# 皮肤层的 tint（视觉层级，不属于切图契约）
TINTS = {
    'btn-primary': '#ffe7b8',
    'btn-secondary': '#cfd6e0',
}


def to_runtime_slice(cap):
    """契约 margins = [left, right, top, bottom] -> 运行时 [left, top, right, bottom]"""
    if not cap or len(cap) != 4:
        return None
    return [cap[0], cap[2], cap[1], cap[3]]


def main() -> int:
    if not COCOS_JSON.is_file():
        print(f'ERROR: missing {COCOS_JSON}')
        return 1

    data = json.loads(COCOS_JSON.read_text(encoding='utf-8'))
    frames = data.get('frames', {})
    if not frames:
        print('ERROR: no frames in cocos export')
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    keys = {}
    copied = 0
    for name, frame in frames.items():
        png = ITEMS_DIR / f'{name}.png'
        if not png.is_file():
            print(f'WARN: missing sprite {png}')
            continue
        target = OUT_DIR / f'{name}.png'
        if not target.exists() or target.stat().st_mtime < png.stat().st_mtime:
            shutil.copy2(png, target)
            copied += 1

        cap = frame.get('capInsets') or [0, 0, 0, 0]
        size = frame.get('originalSize') or {}
        nine = bool(cap and any(int(v) > 0 for v in cap))
        entry = {
            'tex': f'skin/darkgold/{name}',
            'tint': TINTS.get(name, '#ffffff'),
        }
        if nine:
            entry['nine'] = True
            entry['slice'] = to_runtime_slice(cap)
        else:
            entry['nine'] = False
            entry['slice'] = [0, 0, 0, 0]
        keys[name.replace('-', '_')] = entry
        print(f"  {name:16s} {size.get('width')}x{size.get('height')} nine={nine}")

    manifest = {
        'set': 'darkgold',
        'version': 2,
        'source': 'specs/eclipsedblade/exports/cocos/ui-main.json',
        'keys': keys,
    }
    out = OUT_DIR / 'manifest.json'
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'OK: {len(keys)} keys -> {out} (copied {copied} png)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
