/**
 * StageSelect —— 选关页：章节切换、解锁状态、星级与再战。
 */
import { Node } from 'cc';
import { C, S, size, rect, txt, btn, anchor } from '../framework/UI';
import { STAGES } from '../framework/Stages';
import { getConfig } from '../framework/Config';
import { stageStates } from '../framework/Progress';
import { saveData } from '../framework/GameSave';
import { State } from '../framework/State';
import type { PageCtx } from '../framework/Types';

/** 构建选关页。 */
export function buildStageSelect(ctx: PageCtx) {
  const root = ctx.root;
  const H = S.h - S.top - S.tab;

  const title = txt('选关 · 第 ' + State.stageChapter + ' 章', 34, C.goldHi, true);
  title.setPosition(0, H / 2 - 36, 0);
  root.addChild(title);

  const back = btn('‹ 返回', 120, 44, () => ctx.go('lobby'), { fs: 20, skin: 'btn_secondary' });
  back.setPosition(-300, H / 2 - 36, 0);
  root.addChild(back);

  [1, 2].forEach((ch, i) => {
    const active = State.stageChapter === ch;
    const n = rect('chap', 140, 44, active ? C.gold : '#160f08', 22, active ? '#f2dc9b' : C.line, 1);
    n.setPosition(-90 + i * 180, H / 2 - 96, 0);
    root.addChild(n);
    n.addChild(txt('第 ' + ch + ' 章', 22, active ? '#241a09' : C.goldHi, true));
    n.on(Node.EventType.TOUCH_END, () => {
      if (State.stageChapter !== ch) {
        State.stageChapter = ch;
        ctx.go('stage-select');
      }
    }, n);
  });

  const all = getConfig().stages.length ? getConfig().stages : STAGES;
  const states = stageStates(all, saveData().cleared)
    .filter((s) => s.def.chapter === State.stageChapter);

  states.forEach((st, i) => {
    const y = H / 2 - 210 - i * 190;

    const card = rect('stage', 660, 160, C.panel2, 16, st.unlocked ? C.gold : C.line, 2);
    card.setPosition(0, y, 0);
    root.addChild(card);

    const nm = txt(st.def.name, 30, st.unlocked ? C.text : C.sub, true, 'left');
    nm.setPosition(-290, 34, 0);
    anchor(nm, 0, 0.5);
    card.addChild(nm);

    const id = txt(`第 ${st.def.chapter}-${st.def.index} 关`, 22, C.sub, false, 'left');
    id.setPosition(-290, -6, 0);
    anchor(id, 0, 0.5);
    card.addChild(id);

    const rw = txt(`首通 金币+${st.def.firstCoins}`, 20, C.goldHi, false, 'left');
    rw.setPosition(-290, -44, 0);
    anchor(rw, 0, 0.5);
    card.addChild(rw);

    if (!st.unlocked) {
      const lock = txt('未解锁', 24, C.sub, true);
      lock.setPosition(240, 0, 0);
      card.addChild(lock);
    } else if (st.cleared) {
      const gotStars = saveData().stars[st.def.id] ?? 1;
      const done = txt('★'.repeat(gotStars) + ' 已通关', 22, C.gold, true);
      done.setPosition(240, 34, 0);
      card.addChild(done);

      const retry = btn('再战', 110, 46, () => {
        State.battleStageId = st.def.id;
        ctx.go('battle');
      }, { fs: 20, skin: 'btn_secondary' });
      retry.setPosition(240, -26, 0);
      card.addChild(retry);
    } else {
      const go = btn('挑战', 140, 54, () => {
        State.battleStageId = st.def.id;
        ctx.go('battle');
      }, { fs: 24, skin: 'btn_primary' });
      go.setPosition(240, 0, 0);
      card.addChild(go);
    }

    if (st.unlocked) {
      card.on(Node.EventType.TOUCH_END, () => {
        State.battleStageId = st.def.id;
        ctx.go('battle');
      }, card);
    }
  });

  const tip = txt('通关当前关卡即可解锁下一关', 20, C.sub, false);
  tip.setPosition(0, -H / 2 + 60, 0);
  root.addChild(tip);
}
