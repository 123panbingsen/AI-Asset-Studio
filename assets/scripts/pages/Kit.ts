/**
 * Kit —— 组件库预览页：颜色/按钮/进度条/页签等 UI 组件样例。
 */
import { Node } from 'cc';
import { C, S, rect, txt, circle, btn, bar, panel, anchor } from '../framework/UI';
import { Skin } from '../framework/Skin';
import type { PageCtx } from '../framework/Types';

/** 构建组件库预览页。 */
export function buildKit(ctx: PageCtx) {
  const root = ctx.root;
  const H = S.h - S.top - S.tab;

  const title = txt('组件库 · UI Kit', 32, C.goldHi, true);
  title.setPosition(-80, H / 2 - 36, 0);
  root.addChild(title);

  const skinBtn = btn('皮肤自检', 150, 44, () => ctx.go('skinproof'), { fs: 20 });
  skinBtn.setPosition(270, H / 2 - 36, 0);
  root.addChild(skinBtn);

  const sec = (name: string, y: number) => {
    const t = txt(name, 22, C.gold, true, 'left');
    t.setPosition(-330, y, 0);
    anchor(t, 0, 0.5);
    root.addChild(t);
  };

  // 按钮
  sec('按钮', H / 2 - 110);
  const b1 = btn('主按钮', 180, 56, () => ctx.toast('主按钮'), { fs: 24 });
  b1.setPosition(-210, H / 2 - 170, 0);
  root.addChild(b1);
  const b2 = btn('次按钮', 180, 56, () => ctx.toast('次按钮'), { fs: 24, fill: C.panel, stroke: C.line, color: C.goldHi });
  b2.setPosition(0, H / 2 - 170, 0);
  root.addChild(b2);
  const b3 = btn('禁用', 180, 56, () => {}, { fs: 24, fill: C.panel3, stroke: C.line, color: C.sub });
  b3.setPosition(210, H / 2 - 170, 0);
  root.addChild(b3);

  // 页签
  sec('页签 / 筹码', H / 2 - 240);
  ['全部', '武将', '装备', '道具'].forEach((s, i) => {
    const n = rect('chip', 110, 40, i === 0 ? C.gold : '#160f08', 20, i === 0 ? '#f2dc9b' : C.line, 1);
    n.setPosition(-180 + i * 120, H / 2 - 300, 0);
    root.addChild(n);
    n.addChild(txt(s, 20, i === 0 ? '#241a09' : C.goldHi, true));
  });

  // 进度条
  sec('进度条', H / 2 - 370);
  const bars = [[0.82, C.red, '气血'], [0.66, C.blue, '灵力'], [0.74, C.green, '经验']] as [number, string, string][];
  bars.forEach((b, i) => {
    const lb = txt(b[2], 20, C.sub, false, 'left');
    lb.setPosition(-320, H / 2 - 425 - i * 44, 0);
    anchor(lb, 0, 0.5);
    root.addChild(lb);
    const bb = bar(460, 16, b[0], b[1]);
    bb.setPosition(40, H / 2 - 425 - i * 44, 0);
    root.addChild(bb);
  });

  // 徽章
  sec('徽章', H / 2 - 530);
  [['新', C.green], ['限时', C.red], ['热', C.gold]].forEach((b, i) => {
    const n = rect('badge', 72, 32, '#00000066', 8, b[1] as string, 1);
    n.setPosition(-240 + i * 96, H / 2 - 585, 0);
    root.addChild(n);
    n.addChild(txt(b[0] as string, 18, b[1] as string, true));
  });

  // 色板
  sec('色板', H / 2 - 640);
  const colors: [string, string][] = [
    [C.gold, '鎏金'], [C.goldHi, '亮金'], [C.red, '朱砂'], [C.blue, '青蓝'],
    [C.green, '翠绿'], [C.jade, '玉白'], [C.panel2, '面板'], [C.line, '描边'],
  ];
  colors.forEach((c, i) => {
    const sw = rect('sw', 62, 62, c[0], 10, C.line, 1);
    sw.setPosition(-280 + i * 76, H / 2 - 700, 0);
    root.addChild(sw);
    const lb = txt(c[1], 16, C.sub);
    lb.setPosition(-280 + i * 76, H / 2 - 745, 0);
    root.addChild(lb);
  });

  // 面板
  sec('面板', H / 2 - 790);
  const p = panel(680, 190, C.panel2, 'panel');
  p.setPosition(0, H / 2 - 900, 0);
  root.addChild(p);
  const pt = txt('面板标题', 24, C.goldHi, true, 'left');
  pt.setPosition(-310, 60, 0);
  anchor(pt, 0, 0.5);
  p.addChild(pt);
  const pd = txt('这里是面板内容，可放列表、详情、设置等。', 20, C.sub, false, 'left');
  pd.setPosition(-310, 10, 0);
  anchor(pd, 0, 0.5);
  p.addChild(pd);
  const pb = btn('面板按钮', 180, 52, () => ctx.toast('面板按钮'), { fs: 22 });
  pb.setPosition(0, -58, 0);
  p.addChild(pb);

  // 换肤预览
  const skinLb = txt('换肤', 22, C.gold, true, 'left');
  skinLb.setPosition(-330, -480, 0);
  anchor(skinLb, 0, 0.5);
  root.addChild(skinLb);

  const cur = txt('当前：' + (Skin.active || '-'), 20, C.sub, false, 'right');
  cur.setPosition(330, -480, 0);
  anchor(cur, 1, 0.5);
  root.addChild(cur);

  const sets: [string, string][] = [['darkgold', '暗金'], ['goldred', '金红']];
  sets.forEach((s, i) => {
    const b = btn(s[1], 160, 56, () => {
      Skin.load(s[0]).then((ok) => {
        ctx.toast(ok ? '皮肤已切换：' + s[1] : '切换失败（缺 manifest）');
        ctx.go('kit');
      });
    }, { fs: 22, skin: 'btn_secondary' });
    b.setPosition(-100 + i * 180, -525, 0);
    root.addChild(b);
  });
}
