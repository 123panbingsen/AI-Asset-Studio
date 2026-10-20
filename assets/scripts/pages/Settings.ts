/**
 * Settings —— 设置页：音乐/音效等开关与关闭。
 */
import { Node } from 'cc';
import { C, panel, rect, txt, btn, anchor } from '../framework/UI';

/** 构建设置页。 */
export function buildSettingsPopup(onClose: () => void): Node {
  const card = panel(560, 580, C.panel2, 'panel_dark');
  card.setPosition(0, 0, 0);

  const t = txt('设 置', 38, C.goldHi, true);
  t.setPosition(0, 230, 0);
  card.addChild(t);

  const rows: [string, boolean][] = [['音乐', true], ['音效', true], ['震动', false]];
  rows.forEach((r, i) => {
    const y = 120 - i * 84;

    const lb = txt(r[0], 24, C.text, false, 'left');
    lb.setPosition(-210, y, 0);
    anchor(lb, 0, 0.5);
    card.addChild(lb);

    const box = new Node('sw');
    box.setPosition(180, y, 0);
    card.addChild(box);

    let on = r[1];
    const onB = rect('on', 96, 42, C.gold, 21, '#f2dc9b', 1);
    onB.addChild(txt('开', 20, '#241a09', true));
    const offB = rect('off', 96, 42, C.panel3, 21, C.line, 1);
    offB.addChild(txt('关', 20, C.sub, true));
    onB.active = on;
    offB.active = !on;
    box.addChild(onB);
    box.addChild(offB);

    box.on(Node.EventType.TOUCH_END, () => {
      on = !on;
      onB.active = on;
      offB.active = !on;
    }, box);
  });

  const close = btn('关闭', 220, 62, () => onClose(), { fs: 26, skin: 'btn_primary' });
  close.setPosition(0, -220, 0);
  card.addChild(close);

  return card;
}
