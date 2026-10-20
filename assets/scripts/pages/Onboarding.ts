/**
 * Onboarding —— 开局页：永久流派三选一 + 六维属性分配，确认后写入存档并进入主城。
 */
import { Label, Node, UIOpacity } from 'cc';
import { C, S, anchor, btn, hex, rect, size, txt } from '../framework/UI';
import { getGameplayConfig } from '../framework/Config';
import { permanentSkills } from '../framework/skills/SkillDefs';
import { defaultAttributes, validateAttributes } from '../framework/attributes/Attributes';
import type { AttrKey } from '../framework/Save';
import { flushSave, saveData } from '../framework/GameSave';
import type { PageCtx } from '../framework/Types';

/** 六维属性顺序与中文名。 */
const ATTR_DEFS: { key: AttrKey; label: string }[] = [
  { key: 'str', label: '力量' },
  { key: 'int', label: '智商' },
  { key: 'spd', label: '速度' },
  { key: 'vit', label: '体力' },
  { key: 'hp', label: '生命' },
  { key: 'res', label: '抗性' },
];

/** 流派标签中文名。 */
const TAG_LABELS: { [k: string]: string } = { dps: '输出', tank: '生存', idle: '挂机' };

/** 定宽换行文本：顶部锚点，高度随内容向下扩展。 */
function wrapText(s: string, fs: number, color: string, w: number): Node {
  const n = txt(s, fs, color, false, 'left');
  const l = n.getComponent(Label);
  if (l) {
    l.overflow = Label.Overflow.RESIZE_HEIGHT;
    l.enableWrapText = true;
  }
  size(n, w, fs + 10);
  anchor(n, 0.5, 1);
  return n;
}

/** 构建开局页。 */
export function buildOnboarding(ctx: PageCtx) {
  const root = ctx.root;
  const H = S.h - S.top - S.tab;
  const cfg = getGameplayConfig().attributes;
  const skills = permanentSkills();
  const save = saveData();

  // 续玩：已有分配则沿用存档，否则全清零等待分配
  const attrs = defaultAttributes();
  const savedTotal = ATTR_DEFS.reduce((n, d) => n + (save.attributes[d.key] || 0), 0);
  if (savedTotal > 0) {
    for (const d of ATTR_DEFS) {
      const v = save.attributes[d.key];
      attrs[d.key] = typeof v === 'number' && Number.isFinite(v) ? v : 0;
    }
  }

  // 续玩：优先沿用已选流派；否则默认选中第一张卡
  let selectedId: string | null =
    save.permanentSkill && skills.some((s) => s.id === save.permanentSkill)
      ? save.permanentSkill
      : (skills.length > 0 ? skills[0].id : null);

  // ---- 标题与副标题 ----
  const title = txt('选择你的流派', 38, C.goldHi, true);
  title.setPosition(0, H / 2 - 38, 0);
  root.addChild(title);

  const sub = txt('永久流派决定初始特长，属性点可自由分配', 24, C.sub);
  sub.setPosition(0, H / 2 - 82, 0);
  root.addChild(sub);

  // ---- 三张流派卡 ----
  const CARD_W = 224;
  const CARD_H = 250;
  const CARD_GAP = 15;
  const cardFrames: { [id: string]: Node } = {};

  skills.forEach((sk, i) => {
    const x = (i - (skills.length - 1) / 2) * (CARD_W + CARD_GAP);
    const card = rect('skill_' + sk.id, CARD_W, CARD_H, C.panel2, 16, C.line, 1);
    card.setPosition(x, 319, 0);
    root.addChild(card);

    // 选中描边单独一层，切换 active 即可
    const frame = rect('frame', CARD_W, CARD_H, '#00000000', 16, C.goldHi, 4);
    card.addChild(frame);
    cardFrames[sk.id] = frame;

    const nm = txt(sk.name, 30, C.text, true);
    nm.setPosition(0, 96, 0);
    card.addChild(nm);

    const tag = rect('tag', 84, 38, C.panel3, 19, C.goldLo, 1);
    tag.setPosition(0, 60, 0);
    card.addChild(tag);
    tag.addChild(txt(TAG_LABELS[sk.tag] || sk.tag, 24, C.goldHi, true));

    const desc = wrapText(sk.desc, 24, C.sub, CARD_W - 28);
    desc.setPosition(0, 34, 0);
    card.addChild(desc);

    card.on(Node.EventType.TOUCH_END, () => {
      selectedId = sk.id;
      refresh();
    }, card);
  });

  // ---- 属性分配标题：左侧说明 + 右侧剩余点数 ----
  const head = txt('属性分配', 28, C.goldHi, true, 'left');
  head.setPosition(-S.w / 2 + S.pad, 172, 0);
  anchor(head, 0, 0.5);
  root.addChild(head);

  const remainLabel = txt('', 26, C.goldHi, true, 'right');
  remainLabel.setPosition(S.w / 2 - S.pad, 172, 0);
  anchor(remainLabel, 1, 0.5);
  root.addChild(remainLabel);

  // 校验错误提示（正常分配未满时只有“总和必须为 N”一条）
  const errLabel = txt('', 24, C.red);
  errLabel.setPosition(0, 136, 0);
  size(errLabel, S.w - S.pad * 2, 34);
  const errComp = errLabel.getComponent(Label);
  if (errComp) errComp.overflow = Label.Overflow.SHRINK;
  root.addChild(errLabel);

  // ---- 六维属性行 ----
  const rowW = S.w - S.pad * 2;
  const rowStartY = 58;
  const rowStep = 88;
  const valueLabels: { [k: string]: Node } = {};
  const minusNodes: { [k: string]: Node } = {};
  const plusNodes: { [k: string]: Node } = {};

  ATTR_DEFS.forEach((d, i) => {
    const row = rect('attr_' + d.key, rowW, 76, C.panel, 14, C.line, 1);
    row.setPosition(0, rowStartY - i * rowStep, 0);
    root.addChild(row);

    const lb = txt(d.label, 26, C.text, true, 'left');
    lb.setPosition(-rowW / 2 + 20, 0, 0);
    anchor(lb, 0, 0.5);
    row.addChild(lb);

    const value = txt('0', 30, C.goldHi, true);
    value.setPosition(215, 0, 0);
    row.addChild(value);
    valueLabels[d.key] = value;

    const minus = btn('-', 64, 56, () => {
      if (attrs[d.key] <= 0) return;
      attrs[d.key] -= 1;
      refresh();
    }, { fs: 34 });
    minus.setPosition(140, 0, 0);
    row.addChild(minus);
    minusNodes[d.key] = minus;

    const plus = btn('+', 64, 56, () => {
      if (!canPlus(d.key)) return;
      attrs[d.key] += 1;
      refresh();
    }, { fs: 34 });
    plus.setPosition(290, 0, 0);
    row.addChild(plus);
    plusNodes[d.key] = plus;
  });

  // ---- 确认按钮 ----
  const confirmBtn = btn('确认并进入', 380, 76, () => {
    const id = selectedId;
    if (!id || !validateAttributes(attrs).ok) return;
    const s = saveData();
    s.permanentSkill = id;
    s.attributes = { ...attrs };
    // 开局即开始累计离线时长，否则新档永远不会产生离线收益
    s.lastSeenAt = Date.now();
    flushSave();
    ctx.toast('流派已确定');
    ctx.go('home');
  }, { fs: 30, skin: 'btn_primary' });
  confirmBtn.setPosition(0, -482, 0);
  root.addChild(confirmBtn);

  /** 剩余可分配点数（可能为负，说明存档分配超额）。 */
  function remaining(): number {
    return cfg.points - ATTR_DEFS.reduce((n, d) => n + attrs[d.key], 0);
  }

  /** 单项未达上限且仍有剩余点数时才可加点。 */
  function canPlus(key: AttrKey): boolean {
    return attrs[key] < cfg.cap && remaining() > 0;
  }

  /** 用透明度表示按钮禁用态，点击回调内仍会二次校验。 */
  function setEnabled(n: Node, on: boolean): void {
    const op = n.getComponent(UIOpacity) || n.addComponent(UIOpacity);
    op.opacity = on ? 255 : 90;
  }

  /** 按当前选择与点数刷新剩余、错误、按钮与选中描边。 */
  function refresh(): void {
    const left = remaining();
    const check = validateAttributes(attrs);

    const rl = remainLabel.getComponent(Label);
    if (rl) {
      rl.string = '剩余点数 ' + left;
      rl.color = hex(left === 0 ? C.green : C.goldHi);
    }
    const el = errLabel.getComponent(Label);
    if (el) el.string = check.errors.join('；');

    for (const d of ATTR_DEFS) {
      const vl = valueLabels[d.key].getComponent(Label);
      if (vl) vl.string = String(attrs[d.key]);
      setEnabled(minusNodes[d.key], attrs[d.key] > 0);
      setEnabled(plusNodes[d.key], canPlus(d.key));
    }

    for (const id of Object.keys(cardFrames)) {
      cardFrames[id].active = id === selectedId;
    }
    setEnabled(confirmBtn, !!selectedId && check.ok);
  }

  refresh();
}
