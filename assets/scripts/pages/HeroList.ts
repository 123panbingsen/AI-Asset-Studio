/**
 * HeroList —— 武将图鉴页：按职业筛选与进入详情。
 */
import { Node } from 'cc';
import { C, S, size, rect, txt, circle, anchor } from '../framework/UI';
import { DATA } from '../framework/GameData';
import { getConfig } from '../framework/Config';
import { State } from '../framework/State';
import type { PageCtx } from '../framework/Types';

/** 构建武将图鉴页。 */
export function buildHeroList(ctx: PageCtx) {
  const root = ctx.root;
  const H = S.h - S.top - S.tab;

  const title = txt('武将图鉴', 34, C.goldHi, true);
  title.setPosition(0, H / 2 - 36, 0);
  root.addChild(title);

  const filters = ['全部', '战士', '刺客', '法师', '坦克', '射手'];
  filters.forEach((f, i) => {
    const n = rect('f', 96, 36, i === 0 ? C.gold : '#160f08', 18, i === 0 ? '#f2dc9b' : C.line, 1);
    n.setPosition(-300 + i * 108, H / 2 - 92, 0);
    root.addChild(n);
    n.addChild(txt(f, 18, i === 0 ? '#241a09' : C.goldHi, true));
  });

  const cols = 4;
  const cellW = 160;
  const cellH = 210;
  const gapX = 20;
  const gapY = 16;
  const totalW = cols * cellW + (cols - 1) * gapX;
  const totalH = 2 * cellH + gapY;
  const startY = -10;

  const heroes = getConfig().heroes.length ? getConfig().heroes : DATA.heroes;
  heroes.forEach((h, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = -totalW / 2 + cellW / 2 + c * (cellW + gapX);
    const y = startY + totalH / 2 - cellH / 2 - r * (cellH + gapY);

    const card = rect('card', cellW, cellH, C.panel2, 14, C.line, 1);
    card.setPosition(x, y, 0);
    root.addChild(card);

    const av = circle('av', 38, h.color, C.gold, 2);
    av.setPosition(0, 48, 0);
    card.addChild(av);
    av.addChild(txt(h.name[0], 30, '#ffffff', true));

    const nm = txt(h.name, 24, C.text, true);
    nm.setPosition(0, -18, 0);
    card.addChild(nm);

    const stars = '★'.repeat(h.stars) + '☆'.repeat(5 - h.stars);
    const st = txt(stars, 16, C.gold);
    st.setPosition(0, -52, 0);
    card.addChild(st);

    const pw = txt('战力 ' + h.power, 17, C.sub);
    pw.setPosition(0, -82, 0);
    card.addChild(pw);

    card.on(Node.EventType.TOUCH_END, () => {
      State.hero = h;
      ctx.go('heroDetail');
    }, card);
  });
}
