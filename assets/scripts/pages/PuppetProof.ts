/**
 * PuppetProof —— 2D 骨骼动画演示页（idle / walk / attack / 朝向切换）。
 */
import { Node } from 'cc';
import { C, S, size, rect, txt, btn } from '../framework/UI';
import { Puppet2D } from '../framework/Puppet2D';
import type { PageCtx } from '../framework/Types';

/** 构建 2D 骨骼演示页。 */
export function buildPuppetProof(ctx: PageCtx) {
  const root = ctx.root;
  const H = S.h - S.top - S.tab;

  const bg = rect('bg', S.w, H, '#0d1220', 0);
  root.addChild(bg);

  const title = txt('2D 骨骼演示', 34, C.goldHi, true);
  title.setPosition(0, H / 2 - 46, 0);
  root.addChild(title);

  const sub = txt('分层部件 · 骨骼层级 · idle / walk / attack', 20, C.sub);
  sub.setPosition(0, H / 2 - 86, 0);
  root.addChild(sub);

  const stage = new Node('puppet');
  size(stage, 360, 420);
  stage.setPosition(0, -20, 0);
  root.addChild(stage);

  const shadow = rect('shadow', 200, 26, '#00000066', 13);
  shadow.setPosition(0, -232, 0);
  root.addChild(shadow);

  const puppet = stage.addComponent(Puppet2D);

  // 调试参数：?anim=walk&t=0.25&dir=-1&freeze=1
  let qs: URLSearchParams | null = null;
  try {
    qs = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  } catch (e) {
    qs = null;
  }
  const anim = (qs && qs.get('anim')) || 'idle';
  const t = qs && qs.get('t') ? Number(qs.get('t')) : 0;
  const dir = qs && qs.get('dir') === '-1' ? -1 : 1;
  const freeze = !!qs && qs.get('freeze') === '1';

  puppet.setup('char/puppet_guanyu').then((ok) => {
    if (!ok) {
      root.addChild(txt('部件加载失败', 24, C.red));
      return;
    }
    puppet.setDirection(dir);
    puppet.play(anim as any);
    if (t > 0) puppet.seek(t);
    if (freeze) puppet.pause();
  });

  // 按钮
  const defs: [string, string, number][] = [
    ['待机', 'idle', -270],
    ['行走', 'walk', -90],
    ['攻击', 'attack', 90],
    ['翻转', 'flip', 270],
  ];
  defs.forEach(([label, key, x]) => {
    const b = btn(label, 140, 56, () => {
      if (key === 'flip') {
        puppet.setDirection(-1);
        if (label === '翻转') { /* 再点翻回 */ }
      } else {
        puppet.play(key as any);
      }
    }, { fs: 24, skin: 'btn_secondary' });
    b.setPosition(x, -H / 2 + 90, 0);
    root.addChild(b);
  });
}
