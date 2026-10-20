/**
 * Bag —— 背包页：静态装备 + 商城已购道具，支持使用消耗并持久化。
 */
import { Node } from 'cc';
import { C, S, rect, txt, circle, btn, panel, anchor } from '../framework/UI';
import { DATA } from '../framework/GameData';
import { consumeItem, itemCount } from '../framework/Inventory';
import { saveData, flushSave } from '../framework/GameSave';
import type { PageCtx } from '../framework/Types';

interface BagItem {
  id: string;
  name: string;
  quality: string;
  count: number;
  color: string;
  desc: string;
}

function buildList(): BagItem[] {
  const save = saveData();
  const list: BagItem[] = DATA.items.map((it) => ({
    id: it.id,
    name: it.name,
    quality: it.quality,
    count: it.count + itemCount(save, it.id),
    color: it.color,
    desc: it.desc,
  }));

  const known = new Set(list.map((i) => i.id));
  const goods = new Map(DATA.shop.map((g) => [g.id, g]));
  for (const id of Object.keys(save.items)) {
    if (known.has(id)) continue;
    const g = goods.get(id);
    if (!g) continue;
    list.push({
      id,
      name: g.name,
      quality: '道具',
      count: save.items[id],
      color: g.color,
      desc: '商城购买的道具，可用于后续养成',
    });
  }
  return list;
}

/** 构建背包页。 */
export function buildBag(ctx: PageCtx) {
  const root = ctx.root;
  const H = S.h - S.top - S.tab;

  const title = txt('背包', 34, C.goldHi, true);
  title.setPosition(0, H / 2 - 36, 0);
  root.addChild(title);

  const tabs = ['全部', '武将', '装备', '道具'];
  tabs.forEach((t, i) => {
    const n = rect('tab', 110, 40, i === 0 ? C.gold : '#160f08', 20, i === 0 ? '#f2dc9b' : C.line, 1);
    n.setPosition(-180 + i * 120, H / 2 - 96, 0);
    root.addChild(n);
    n.addChild(txt(t, 20, i === 0 ? '#241a09' : C.goldHi, true));
  });

  const list = buildList();
  const cols = 4;
  const cellW = 160;
  const cellH = 210;
  const gapX = 20;
  const gapY = 16;
  const totalW = cols * cellW + (cols - 1) * gapX;
  const rows = Math.max(1, Math.ceil(list.length / cols));
  const totalH = rows * cellH + (rows - 1) * gapY;
  const startY = -20;

  list.forEach((it, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = -totalW / 2 + cellW / 2 + c * (cellW + gapX);
    const y = startY + totalH / 2 - cellH / 2 - r * (cellH + gapY);

    const card = rect('item', cellW, cellH, C.panel2, 14, it.color, 2);
    card.setPosition(x, y, 0);
    root.addChild(card);

    const ic = circle('ic', 36, '#1b130a', it.color, 2);
    ic.setPosition(0, 46, 0);
    card.addChild(ic);
    ic.addChild(txt(it.name[0], 28, it.color, true));

    const nm = txt(it.name, 20, C.text, true);
    nm.setPosition(0, -22, 0);
    card.addChild(nm);

    const q = txt(it.quality, 17, it.color);
    q.setPosition(0, -52, 0);
    card.addChild(q);

    if (it.count > 1) {
      const cnt = txt('x' + it.count, 18, C.goldHi, true, 'right');
      cnt.setPosition(66, 86, 0);
      card.addChild(cnt);
    }

    card.on(Node.EventType.TOUCH_END, () => showItem(ctx, it), card);
  });
}

function showItem(ctx: PageCtx, it: BagItem) {
  const card = panel(560, 540, C.panel2, 'panel_dark');
  card.setPosition(0, 0, 0);

  const ic = circle('ic', 64, '#1b130a', it.color, 3);
  ic.setPosition(0, 170, 0);
  card.addChild(ic);
  ic.addChild(txt(it.name[0], 52, it.color, true));

  const nm = txt(it.name, 32, C.text, true);
  nm.setPosition(0, 70, 0);
  card.addChild(nm);

  const q = txt(it.quality + ' · 数量 ' + it.count, 20, it.color);
  q.setPosition(0, 30, 0);
  card.addChild(q);

  const desc = txt(it.desc, 20, C.sub);
  desc.setPosition(0, -30, 0);
  card.addChild(desc);

  const b1 = btn('使用', 180, 56, () => {
    const used = consumeItem(saveData(), it.id);
    if (used) {
      flushSave();
      ctx.refresh?.();
      ctx.toast('已使用 ' + it.name);
      ctx.close();
    } else {
      ctx.toast('数量不足或不可使用');
    }
  }, { fs: 24, skin: 'none' });
  b1.setPosition(-105, -140, 0);
  card.addChild(b1);

  const b2 = btn('关闭', 180, 56, () => ctx.close(), { fs: 24, fill: C.panel, skin: 'none' });
  b2.setPosition(105, -140, 0);
  card.addChild(b2);

  ctx.popup(card);
}
