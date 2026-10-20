/**
 * Shop —— 商店页：分类页签与购买（扣货币、入背包、落盘）。
 */
import { Node } from 'cc';
import { C, S, rect, txt, circle, btn, anchor } from '../framework/UI';
import { DATA } from '../framework/GameData';
import { buy as buyGood } from '../framework/Inventory';
import { saveData, flushSave } from '../framework/GameSave';
import type { PageCtx } from '../framework/Types';

/** 构建商店页。 */
export function buildShop(ctx: PageCtx) {
  const root = ctx.root;
  const H = S.h - S.top - S.tab;

  const title = txt('商城', 34, C.goldHi, true);
  title.setPosition(0, H / 2 - 36, 0);
  root.addChild(title);

  const tabs = ['热卖', '礼包', '时装', '兑换'];
  tabs.forEach((t, i) => {
    const n = rect('tab', 110, 40, i === 0 ? C.gold : '#160f08', 20, i === 0 ? '#f2dc9b' : C.line, 1);
    n.setPosition(-180 + i * 120, H / 2 - 96, 0);
    root.addChild(n);
    n.addChild(txt(t, 20, i === 0 ? '#241a09' : C.goldHi, true));
  });

  const pos2 = [
    [-185, 120], [185, 120], [-185, -170], [185, -170],
  ];
  DATA.shop.forEach((g, i) => {
    const card = rect('good', 330, 250, C.panel2, 16, C.line, 2);
    card.setPosition(pos2[i][0], pos2[i][1], 0);
    root.addChild(card);

    const ic = circle('ic', 52, '#1b130a', g.color, 2);
    ic.setPosition(0, 52, 0);
    card.addChild(ic);
    ic.addChild(txt(g.name[0], 40, g.color, true));

    const nm = txt(g.name, 24, C.text, true);
    nm.setPosition(0, -12, 0);
    card.addChild(nm);

    const pr = txt(`${g.price} ${g.currency}`, 20, g.color, true);
    pr.setPosition(0, -50, 0);
    card.addChild(pr);

    const goBuy = btn('购买', 150, 54, () => {
      const currency = g.currency === '金币' ? 'coins' : g.currency === '勾玉' ? 'gems' : 'tickets';
      const res = buyGood(saveData(), { id: g.id, price: g.price, currency });
      if (res.ok) {
        flushSave();
        ctx.refresh?.();
        ctx.toast('购买成功：' + g.name);
      } else {
        ctx.toast('余额不足');
      }
    }, { fs: 22, skin: 'none' });
    goBuy.setPosition(0, -92, 0);
    card.addChild(goBuy);
  });
}
