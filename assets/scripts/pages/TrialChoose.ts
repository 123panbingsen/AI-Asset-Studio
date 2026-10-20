/**
 * TrialChoose —— 试炼胜利三选一：查看候选技能、选择后替换上阵，或放弃本次奖励。
 *
 * 页面数据来自 `State.trialOffers`（Battle 胜利时写入），选择结果通过
 * `applyTrialWin` 落存档，随后清空试炼状态并跳转技能页。
 */
import { Node } from 'cc';
import { C, S, clear, rect, txt, circle, btn } from '../framework/UI';
import { getGameplayConfig } from '../framework/Config';
import { applyTrialWin } from '../framework/trial/Trial';
import { flushSave, saveData } from '../framework/GameSave';
import { State } from '../framework/State';
import type { PageCtx } from '../framework/Types';

const CARD_W = 210;
const CARD_H = 380;
const CARD_GAP = 24;

/** 品质展示：中文标签与颜色；未知品质回退普通。 */
const QUALITY_VIEW: Record<string, { label: string; color: string }> = {
  common: { label: '普通', color: C.sub },
  rare: { label: '稀有', color: C.blue },
  epic: { label: '史诗', color: '#b98bff' },
  legend: { label: '传说', color: C.goldHi },
};

function qualityView(quality: string): { label: string; color: string } {
  return QUALITY_VIEW[quality] || QUALITY_VIEW.common;
}

/** 从配置 skillPool 按 defId 取名；未知 defId 回退 defId 本身。 */
function skillName(defId: string): string {
  const id = defId.trim();
  const entry = getGameplayConfig().skillPool.find((s) => s.defId.trim() === id);
  return entry && entry.name ? entry.name : id;
}

/** 构建试炼三选一页。 */
export function buildTrialChoose(ctx: PageCtx) {
  const root = ctx.root;
  const H = S.h - S.top - S.tab;
  // 快照：选择结算后 State.trialOffers 会被清空，页面仍需要展示原候选。
  const offers = State.trialOffers.slice();

  const title = txt('试炼胜利 · 三选一', 36, C.goldHi, true);
  title.setPosition(0, H / 2 - 54, 0);
  root.addChild(title);

  // 空候选兜底：不显示卡片与结算按钮，只允许返回。
  if (offers.length === 0) {
    const empty = txt('暂无可选技能', 30, C.sub, true);
    empty.setPosition(0, 60, 0);
    root.addChild(empty);

    const back = btn('返回', 220, 64, () => {
      State.trialActive = false;
      State.trialOffers = [];
      ctx.go('home');
    }, { fs: 26, skin: 'btn_primary' });
    back.setPosition(0, -80, 0);
    root.addChild(back);
    return;
  }

  const sub = txt('选择一项技能，替换上阵或放弃', 24, C.sub, false);
  sub.setPosition(0, H / 2 - 104, 0);
  root.addChild(sub);

  const cardsBox = new Node('cards');
  cardsBox.setPosition(0, 40, 0);
  root.addChild(cardsBox);

  const actionsBox = new Node('actions');
  actionsBox.setPosition(0, -H / 2 + 96, 0);
  root.addChild(actionsBox);

  let selected = -1;
  let finished = false;

  const finish = (msg: string) => {
    if (finished) return;
    finished = true;
    flushSave();
    State.trialActive = false;
    State.trialOffers = [];
    ctx.toast(msg);
    ctx.go('skills');
  };

  const replaceSelected = () => {
    if (selected < 0 || finished) return;
    const offer = offers[selected];
    if (!offer) return;
    applyTrialWin(saveData(), { type: 'replace', skillDefId: offer.defId }, Math.random);
    finish('已获得技能');
  };

  const abandon = () => {
    if (finished) return;
    applyTrialWin(saveData(), { type: 'abandon' }, Math.random);
    finish('已放弃');
  };

  const drawActions = () => {
    clear(actionsBox);
    const ready = selected >= 0;

    const replace = btn('替换', 230, 64, replaceSelected, ready
      ? { fs: 26, skin: 'btn_primary' }
      : { fs: 26, fill: C.panel3, stroke: C.line, color: C.sub });
    replace.setPosition(-140, 0, 0);
    actionsBox.addChild(replace);

    const giveUp = btn('放弃', 230, 64, abandon, {
      fs: 26, fill: C.panel, stroke: C.line, color: C.goldHi, skin: 'btn_secondary',
    });
    giveUp.setPosition(140, 0, 0);
    actionsBox.addChild(giveUp);
  };

  const drawCards = () => {
    clear(cardsBox);
    offers.forEach((offer, i) => {
      const q = qualityView(offer.quality);
      const name = skillName(offer.defId);
      const active = selected === i;

      const card = rect(
        'card' + i, CARD_W, CARD_H,
        active ? '#2b2115' : C.panel2, 16,
        active ? C.goldHi : C.line, active ? 4 : 2,
      );
      card.setPosition((i - (offers.length - 1) / 2) * (CARD_W + CARD_GAP), 0, 0);
      cardsBox.addChild(card);

      const qBg = rect('qbg', 112, 40, '#160f08', 20, q.color, 2);
      qBg.setPosition(0, CARD_H / 2 - 44, 0);
      card.addChild(qBg);
      qBg.addChild(txt(q.label, 22, q.color, true));

      const icon = circle('icon', 56, C.panel3, q.color, 3);
      icon.setPosition(0, 44, 0);
      card.addChild(icon);
      icon.addChild(txt(name.charAt(0) || '技', 46, q.color, true));

      const nm = txt(name, 30, active ? C.goldHi : C.text, true);
      nm.setPosition(0, -52, 0);
      card.addChild(nm);

      const lv = txt('Lv.1', 22, C.sub, false);
      lv.setPosition(0, -96, 0);
      card.addChild(lv);

      const hint = txt(active ? '已选择' : '点击选择', 22, active ? C.goldHi : C.sub, active);
      hint.setPosition(0, -CARD_H / 2 + 40, 0);
      card.addChild(hint);

      if (active) {
        const check = circle('check', 24, C.gold, C.goldHi, 2);
        check.setPosition(CARD_W / 2 - 26, CARD_H / 2 - 26, 0);
        card.addChild(check);
        check.addChild(txt('✓', 26, '#241a09', true));
      }

      card.on(Node.EventType.TOUCH_END, () => {
        if (finished || selected === i) return;
        selected = i;
        drawCards();
        drawActions();
      }, card);
    });
  };

  drawCards();
  drawActions();

  const tip = txt('选择后点击「替换」上阵，或直接放弃本次奖励', 22, C.sub, false);
  tip.setPosition(0, -H / 2 + 30, 0);
  root.addChild(tip);
}
