/**
 * Settle —— 战斗结算弹窗：胜负、星级、奖励与重试/关闭。
 */
import { Node } from 'cc';
import { C, panel, rect, txt, circle, btn, anchor } from '../framework/UI';

export interface SettleReward {
  coins: number;
  gems: number;
  first: boolean;
}

/** 构建战斗结算弹窗。 */
export function buildSettlePopup(
  win: boolean,
  onClose: () => void,
  onLobby?: () => void,
  reward?: SettleReward,
  starCount = 0,
  onRetry?: () => void,
): Node {
  const card = panel(620, 660, C.panel2, 'panel_dark');
  card.setPosition(0, 0, 0);

  const t = txt(win ? '胜 利' : '失 败', 52, win ? C.goldHi : C.red, true);
  t.setPosition(0, 250, 0);
  card.addChild(t);

  const n = Math.max(0, Math.min(3, Math.round(starCount)));
  const st = txt('★'.repeat(n) + '☆'.repeat(3 - n), 40, C.gold);
  st.setPosition(0, 180, 0);
  card.addChild(st);

  const sub = txt(win ? '击败 5 名敌将 · 用时 3:24' : '再接再厉', 22, C.sub);
  sub.setPosition(0, 130, 0);
  card.addChild(sub);

  const line = rect('line', 500, 2, C.line, 0);
  line.setPosition(0, 90, 0);
  card.addChild(line);

  if (!win) {
    const hint = txt('再接再厉，下次再来', 26, C.sub);
    hint.setPosition(0, 20, 0);
    card.addChild(hint);
  } else {
    const rw = reward
      ? [`金币 +${reward.coins}`, `勾玉 +${reward.gems}`, reward.first ? '首通奖励' : '通关奖励']
      : ['金币 ×800', '勾玉 ×60', '经验 ×1200'];
    rw.forEach((s, i) => {
      const c = circle('rw', 44, C.panel2, C.gold, 2);
      c.setPosition(-180 + i * 180, 20, 0);
      card.addChild(c);
      c.addChild(txt('奖', 30, C.goldHi, true));
      const lb = txt(s, 19, C.text);
      lb.setPosition(-180 + i * 180, -50, 0);
      card.addChild(lb);
    });
  }

  const again = btn(win ? '返回大厅' : '重新挑战', 200, 60, () => {
    if (win) {
      if (onLobby) onLobby();
    } else if (onRetry) {
      onRetry();
    } else if (onLobby) {
      onLobby();
    }
  }, { fs: 24, skin: 'btn_primary' });
  again.setPosition(-110, -180, 0);
  card.addChild(again);

  const ok = btn('关闭', 200, 60, () => onClose(), { fs: 24, fill: C.panel, skin: 'btn_secondary' });
  ok.setPosition(110, -180, 0);
  card.addChild(ok);

  return card;
}
