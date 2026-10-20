/**
 * SkinProof —— 皮肤预览页：列出 manifest 中的皮肤键与九宫格效果。
 */
import { Node } from 'cc';
import { C, S, rect, txt, btn, anchor } from '../framework/UI';
import { Skin } from '../framework/Skin';
import type { PageCtx } from '../framework/Types';

/** 构建皮肤预览页。 */
export function buildSkinProof(ctx: PageCtx) {
  const root = ctx.root;
  const H = S.h - S.top - S.tab;

  const back = btn('‹ 返回', 120, 44, () => ctx.go('kit'), { fs: 20 });
  back.setPosition(-300, H / 2 - 36, 0);
  root.addChild(back);

  const title = txt('皮肤自检 · 9-slice', 30, C.goldHi, true);
  title.setPosition(0, H / 2 - 36, 0);
  root.addChild(title);

  Skin.load('darkgold').then((ok) => {
    const state = txt(ok ? 'manifest: darkgold 已加载' : 'manifest 加载失败', 22, ok ? C.green : C.red);
    state.setPosition(0, H / 2 - 80, 0);
    root.addChild(state);

    const keys = ['panel', 'panel_dark', 'btn_primary', 'btn_secondary', 'slot', 'btn_icon', 'frame_gold', 'scrim'];
    const sizes: [number, number][] = [[120, 44], [200, 72], [300, 104]];
    const xs = [-250, -40, 190];

    let y = H / 2 - 150;
    keys.forEach((k) => {
      const lb = txt(k, 22, C.sub, false, 'left');
      lb.setPosition(-350, y + 36, 0);
      anchor(lb, 0, 0.5);
      root.addChild(lb);

      sizes.forEach((sz, i) => {
        Skin.sprite(k, sz[0], sz[1]).then((n) => {
          if (n) {
            n.setPosition(xs[i], y, 0);
            root.addChild(n);
          } else {
            const fb = rect('fb_' + k + i, sz[0], sz[1], '#2a2115', 10, C.line, 2);
            fb.setPosition(xs[i], y, 0);
            root.addChild(fb);
            fb.addChild(txt('fallback', 18, C.sub));
          }
        });
      });

      y -= 108;
    });

    // 缺 key → Graphics 回退演示
    const fb = rect('fb_missing', 300, 60, '#2a2115', 10, C.line, 2);
    fb.setPosition(0, y - 10, 0);
    fb.addChild(txt('缺 key → Graphics 回退', 18, C.sub));
    root.addChild(fb);
  });
}
