/**
 * PortraitProof —— 单张 2D 立绘的程序化动效演示（idle / walk / attack / 翻转）。
 */
import { Node } from 'cc';
import { C, S, size, rect, txt, btn } from '../framework/UI';
import { PortraitActor } from '../framework/PortraitActor';
import type { PageCtx } from '../framework/Types';

/** 构建立绘动效演示页。 */
export function buildPortraitProof(ctx: PageCtx) {
  const root = ctx.root;
  const H = S.h - S.top - S.tab;

  const bg = rect('bg', S.w, H, '#0d1220', 0);
  root.addChild(bg);

  const title = txt('2D 立绘动效演示', 34, C.goldHi, true);
  title.setPosition(0, H / 2 - 46, 0);
  root.addChild(title);

  const sub = txt('单张静图 · 呼吸 / 行走 / 攻击', 20, C.sub);
  sub.setPosition(0, H / 2 - 86, 0);
  root.addChild(sub);

  const stage = new Node('stage');
  size(stage, 420, 520);
  stage.setPosition(0, -10, 0);
  root.addChild(stage);

  const shadow = rect('shadow', 220, 26, '#00000066', 13);
  shadow.setPosition(0, -245, 0);
  stage.addChild(shadow);

  const actor = stage.addComponent(PortraitActor);

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

  actor.setup('char/guanyu_art/portrait', 400).then((ok) => {
    if (!ok) {
      root.addChild(txt('立绘加载失败', 24, C.red));
      return;
    }
    actor.setDirection(dir);
    actor.play(anim as any);
    if (t > 0) actor.seek(t);
    if (freeze) actor.pause();
  });

  const defs: [string, string, number][] = [
    ['待机', 'idle', -270],
    ['行走', 'walk', -90],
    ['攻击', 'attack', 90],
    ['翻转', 'flip', 270],
  ];
  defs.forEach(([label, key, x]) => {
    const b = btn(label, 140, 56, () => {
      if (key === 'flip') actor.setDirection(-1);
      else actor.play(key as any);
    }, { fs: 24, skin: 'btn_secondary' });
    b.setPosition(x, -H / 2 + 90, 0);
    root.addChild(b);
  });
}
