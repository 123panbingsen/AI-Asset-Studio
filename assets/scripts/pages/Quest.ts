/**
 * Quest —— 任务页：任务进度展示与奖励领取（幂等）。
 */
import { Node } from 'cc';
import { C, S, rect, txt, bar, btn, anchor } from '../framework/UI';
import { DATA } from '../framework/GameData';
import { claimQuest } from '../framework/Inventory';
import { saveData, flushSave } from '../framework/GameSave';
import type { PageCtx } from '../framework/Types';

/** 构建任务页。 */
export function buildQuest(ctx: PageCtx) {
  const root = ctx.root;
  const H = S.h - S.top - S.tab;

  const title = txt('任务', 34, C.goldHi, true);
  title.setPosition(0, H / 2 - 36, 0);
  root.addChild(title);

  DATA.quests.forEach((q, i) => {
    const y = H / 2 - 150 - i * 130;

    const row = rect('row', 700, 116, C.panel2, 14, C.line, 1);
    row.setPosition(0, y, 0);
    root.addChild(row);

    const nm = txt(q.name, 24, C.text, true, 'left');
    nm.setPosition(-310, 36, 0);
    anchor(nm, 0, 0.5);
    row.addChild(nm);

    const ds = txt(q.desc, 24, C.sub, false, 'left');
    ds.setPosition(-310, 4, 0);
    anchor(ds, 0, 0.5);
    row.addChild(ds);

    const b = bar(320, 16, q.progress / q.target, q.done ? C.green : C.gold);
    b.setPosition(-190, -30, 0);
    row.addChild(b);

    const pg = txt(`${q.progress}/${q.target}`, 24, C.sub, false, 'right');
    pg.setPosition(40, -30, 0);
    anchor(pg, 1, 0.5);
    row.addChild(pg);

    const rw = txt('奖励 ' + q.reward, 24, C.goldHi, false, 'right');
    rw.setPosition(180, 36, 0);
    anchor(rw, 1, 0.5);
    row.addChild(rw);

    if (q.done) {
      const b1 = btn('已完成', 130, 54, () => ctx.toast('已领取'), { fs: 20, fill: C.panel, color: C.sub, stroke: C.line, skin: 'none' });
      b1.setPosition(270, 0, 0);
      row.addChild(b1);
    } else {
      const b1 = btn('领取', 130, 54, () => {
        const res = claimQuest(saveData(), { id: q.id, coins: q.coins ?? 0, gems: q.gems ?? 0 });
        if (res.ok) {
          flushSave();
          ctx.refresh?.();
          q.done = true;
          ctx.toast('领取成功：' + q.reward);
          ctx.go('quest');
        } else {
          ctx.toast('已领取');
        }
      }, { fs: 20, skin: 'none' });
      b1.setPosition(270, 0, 0);
      row.addChild(b1);
    }
  });
}
