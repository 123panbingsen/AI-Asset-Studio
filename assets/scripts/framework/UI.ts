/**
 * UI —— 运行时 UI 构建工具集：矩形/文本/按钮/进度条/面板/皮肤应用，约束字号与触控尺寸。
 */
import {
  Node, UITransform, Label, Graphics, Sprite, SpriteFrame, Color, Button, resources, Widget,
} from 'cc';
import { C, FONT, S } from './Theme';
import { Skin } from './Skin';

export { C, S };

/** 十六进制颜色转 cc.Color（含透明度）。 */
export function hex(h: string, a = 255): Color {
  const s = h.replace('#', '');
  return new Color(
    parseInt(s.substring(0, 2), 16),
    parseInt(s.substring(2, 4), 16),
    parseInt(s.substring(4, 6), 16),
    a,
  );
}

/** 创建节点并挂到父节点。 */
export function mk(name: string, parent?: Node): Node {
  const n = new Node(name);
  if (parent) parent.addChild(n);
  return n;
}

/** 设置节点 UI 尺寸。 */
export function size(n: Node, w: number, h: number): Node {
  const t = n.getComponent(UITransform) || n.addComponent(UITransform);
  t.setContentSize(w, h);
  return n;
}

/** 设置节点锚点。 */
export function anchor(n: Node, ax: number, ay: number): Node {
  const t = n.getComponent(UITransform) || n.addComponent(UITransform);
  t.setAnchorPoint(ax, ay);
  return n;
}

/** 设置节点本地坐标。 */
export function pos(n: Node, x: number, y: number): Node {
  n.setPosition(x, y, 0);
  return n;
}

/** 创建圆角矩形（Graphics 绘制，作为皮肤加载前的兜底）。 */
export function rect(
  name: string, w: number, h: number, fill: string,
  radius = 12, stroke?: string, lw = 2,
): Node {
  const n = new Node(name);
  size(n, w, h);
  const g = n.addComponent(Graphics);
  g.fillColor = hex(fill);
  g.roundRect(-w / 2, -h / 2, w, h, radius);
  g.fill();
  if (stroke) {
    g.lineWidth = lw;
    g.strokeColor = hex(stroke);
    g.roundRect(-w / 2, -h / 2, w, h, radius);
    g.stroke();
  }
  return n;
}

/** 创建面板节点，可指定皮肤 key。 */
export function panel(w: number, h: number, color = C.panel2, key = 'none'): Node {
  const n = rect('panel', w, h, color, 18, C.line, 2);
  applySkin(n, key, w, h);
  return n;
}

/** 尝试把皮肤贴到节点上；成功则关闭该节点的 Graphics 回退 */
export function applySkin(n: Node, key: string | undefined, w: number, h: number): void {
  if (!key || key === 'none') return;
  Skin.applyTo(n, key, w, h).then((ok) => {
    if (!ok) return;
    const g = n.getComponent(Graphics);
    if (g) g.enabled = false;
  });
}

/** 创建圆形节点（头像/图标/敌人占位）。 */
export function circle(name: string, r: number, fill: string, stroke?: string, lw = 2): Node {
  const n = new Node(name);
  size(n, r * 2, r * 2);
  const g = n.addComponent(Graphics);
  g.fillColor = hex(fill);
  g.circle(0, 0, r);
  g.fill();
  if (stroke) {
    g.lineWidth = lw;
    g.strokeColor = hex(stroke);
    g.circle(0, 0, r);
    g.stroke();
  }
  return n;
}

/** 创建文本节点；正文最小 24 设计单位。 */
export function txt(
  s: string, fs: number, color: string, bold = false,
  align: 'left' | 'center' | 'right' = 'center',
): Node {
  // ui-ux-pro-max: 正文不小于 24 设计单位（750 宽下约 12.5pt）
  fs = Math.max(24, fs);
  const n = new Node('txt');
  const l = n.addComponent(Label);
  l.string = s;
  l.fontSize = fs;
  l.lineHeight = fs + 6;
  l.color = hex(color);
  l.isBold = bold;
  l.useSystemFont = true;
  l.fontFamily = FONT;
  l.horizontalAlign = align === 'left'
    ? Label.HorizontalAlign.LEFT
    : align === 'right' ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.CENTER;
  l.verticalAlign = Label.VerticalAlign.CENTER;
  l.overflow = Label.Overflow.NONE;
  size(n, s.length * fs + 12, fs + 10);
  return n;
}

/** 创建按钮：视觉尺寸可小，触控区域至少 88x88，支持皮肤与点击回调。 */
export function btn(
  label: string, w: number, h: number, onClick: () => void,
  opt: { fill?: string; stroke?: string; color?: string; fs?: number; radius?: number; skin?: string } = {},
): Node {
  // ui-ux-pro-max: 触控目标至少 44pt（750 设计宽下约 85 单位），视觉尺寸保持不变
  const n = new Node('btn');
  size(n, Math.max(w, 88), Math.max(h, 88));
  const v = rect('bg', w, h, opt.fill || C.panel, opt.radius ?? 12, opt.stroke || C.gold, 2);
  n.addChild(v);
  const t = txt(label, opt.fs || 28, opt.color || (opt.skin === 'btn_primary' ? '#2a1808' : C.goldHi), true);
  v.addChild(t);
  applySkin(v, opt.skin ?? 'none', w, h);
  n.on(Node.EventType.TOUCH_END, () => onClick(), n);
  const b = n.addComponent(Button);
  b.target = v;
  b.transition = Button.Transition.SCALE;
  b.zoomScale = 0.94;
  return n;
}

/** 创建进度条（血量/经验/任务进度）。 */
export function bar(w: number, h: number, ratio: number, color: string, bg = '#2a2115'): Node {
  const n = new Node('bar');
  size(n, w, h);
  n.addChild(rect('bg', w, h, bg, h / 2));
  const fw = Math.max(4, Math.min(w, w * ratio));
  const f = rect('fill', fw, h, color, h / 2);
  f.setPosition(-w / 2 + fw / 2, 0, 0);
  n.addChild(f);
  return n;
}

/** 运行时刷新进度条（重绘 fill 的 Graphics） */
export function setBar(n: Node, w: number, h: number, ratio: number, color: string): void {
  const fill = n.getChildByName('fill');
  if (!fill) return;
  const fw = Math.max(4, Math.min(w, w * ratio));
  const g = fill.getComponent(Graphics);
  if (g) {
    g.clear();
    g.fillColor = hex(color);
    g.roundRect(-fw / 2, -h / 2, fw, h, h / 2);
    g.fill();
  }
  size(fill, fw, h);
  fill.setPosition(-w / 2 + fw / 2, 0, 0);
}

/** 水平分隔线。 */
export function hline(w: number, color = C.line): Node {
  return rect('line', w, 2, color, 0);
}

/** 小徽标（数量/红点）。 */
export function badge(text: string, color: string): Node {
  const n = new Node('badge');
  const t = txt(text, 18, color, true);
  const w = Math.max(36, t.getComponent(UITransform)!.width + 16);
  n.addChild(rect('bg', w, 28, '#00000066', 8, color, 1));
  n.addChild(t);
  size(n, w, 28);
  return n;
}

/** 清空子节点。 */
export function clear(n: Node): void {
  n.removeAllChildren();
}

/** 让节点铺满设计分辨率。 */
export function fit(n: Node, w = S.w, h = S.h): Node {
  size(n, w, h);
  const t = n.getComponent(UITransform);
  if (t) t.setAnchorPoint(0.5, 0.5);
  return n;
}

/** 从 resources 异步加载图片节点。 */
export function img(path: string, w: number, h: number): Promise<Node> {
  return new Promise((resolve) => {
    const n = new Node('img');
    const sp = n.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.type = Sprite.Type.SIMPLE;
    size(n, w, h);
    resources.load(path + '/spriteFrame', SpriteFrame, (err, sf) => {
      if (!err && sf) {
        sp.spriteFrame = sf;
        size(n, w, h);
      }
      resolve(n);
    });
  });
}

/** 从 resources 加载九宫格图片节点。 */
export function img9(path: string, w: number, h: number): Promise<Node> {
  return new Promise((resolve) => {
    const n = new Node('img9');
    const sp = n.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.type = Sprite.Type.SLICED;
    size(n, w, h);
    resources.load(path + '/spriteFrame', SpriteFrame, (err, sf) => {
      if (!err && sf) {
        sp.spriteFrame = sf;
        size(n, w, h);
      }
      resolve(n);
    });
  });
}

/** 按行列创建网格布局节点集合。 */
export function grid(
  parent: Node, count: number, cols: number,
  cellW: number, cellH: number, gapX: number, gapY: number,
  make: (cell: Node, i: number) => void,
): Node {
  const rows = Math.ceil(count / cols);
  const totalW = cols * cellW + (cols - 1) * gapX;
  const totalH = rows * cellH + (rows - 1) * gapY;
  const box = new Node('grid');
  size(box, totalW, totalH);
  parent.addChild(box);
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = -totalW / 2 + cellW / 2 + c * (cellW + gapX);
    const y = totalH / 2 - cellH / 2 - r * (cellH + gapY);
    const cell = new Node('cell' + i);
    size(cell, cellW, cellH);
    cell.setPosition(x, y, 0);
    box.addChild(cell);
    make(cell, i);
  }
  return box;
}
