/**
 * Skills —— 技能页：永久技能、非永久技能槽、技能详情（保护 / 净化 / 洗点）与蓝图入口占位。
 *
 * 页面只消费 framework 层 API 并写存档；所有数值（槽位、费用、保护上限）均来自玩法配置。
 */
import { Node } from 'cc';
import { C, S, rect, txt, circle, btn, panel, size, anchor } from '../framework/UI';
import { DATA } from '../framework/GameData';
import { getGameplayConfig } from '../framework/Config';
import { saveData, flushSave } from '../framework/GameSave';
import { permanentSkills, skillPool, slotCount, isUnlocked } from '../framework/skills/SkillDefs';
import { canProtect, toggleProtect, purifyCost, purify, respec } from '../framework/skills/SkillState';
import { defaultAttributes, respecCost } from '../framework/attributes/Attributes';
import type { AttrKey } from '../framework/attributes/Attributes';
import type { OwnedSkill, SkillQuality } from '../framework/Save';
import type { PageCtx } from '../framework/Types';

/** 技能品质展示：中文名 + 主题色。 */
const QUALITY: Record<SkillQuality, { label: string; color: string }> = {
  common: { label: '普通', color: '#c8c2b4' },
  rare: { label: '稀有', color: C.blue },
  epic: { label: '史诗', color: '#a97fe0' },
  legend: { label: '传说', color: C.gold },
};

/** 永久技能 tag 展示（配置中只允许 dps / tank / idle）。 */
const TAG_LABEL: Record<string, string> = {
  dps: '输出',
  tank: '坦克',
  idle: '挂机',
};

/** 六维固定顺序，用于洗点后的默认分配。 */
const ATTR_KEYS: AttrKey[] = ['str', 'int', 'spd', 'vit', 'hp', 'res'];

/** 数字千分位。 */
function fmt(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 按 defId 从技能池查名字，查不到时回退 defId（技能池热更后也不至于空白）。 */
function skillName(defId: string): string {
  const def = skillPool().find((d) => d.defId === defId);
  return def ? def.name : defId;
}

/** 完整槽位表的最大数量：用于把未解锁槽也展示出来（低等级可见锁定态）。 */
function maxSlotCount(): number {
  return getGameplayConfig().slots.reduce((n, tier) => Math.max(n, tier.count), 1);
}

/** 槽位索引对应的解锁等级：取“count > index”的最低档；无此档返回 null。 */
function slotUnlockLevel(index: number): number | null {
  let best: number | null = null;
  for (const tier of getGameplayConfig().slots) {
    if (tier.count > index && (best === null || tier.level < best)) best = tier.level;
  }
  return best;
}

/**
 * 洗点后的默认属性：以 `defaultAttributes()` 为底，把配置点数轮流分配到六维（不超单项上限）。
 *
 * 注意：`respec` 内部用 `validateAttributes` 校验“总和必须等于配置点数”，
 * 因此直接传全 0 的 `defaultAttributes()` 必然返回 `invalid`；这里在默认值基础上
 * 均匀分配，既保留“重置属性”的语义，也能真正落库。
 */
function resetAttributes(): Record<AttrKey, number> {
  const cfg = getGameplayConfig().attributes;
  const out = defaultAttributes();
  let left = cfg.points;
  while (left > 0) {
    let placed = false;
    for (const k of ATTR_KEYS) {
      if (left <= 0) break;
      if (out[k] >= cfg.cap) continue;
      out[k] += 1;
      left -= 1;
      placed = true;
    }
    if (!placed) break; // 点数超过六项上限总和：剩余点数无法分配
  }
  return out;
}

/** 不可点击的置灰按钮（碎片/保护位不足时使用，不挂触摸事件）。 */
function disabledBtn(label: string, w: number, h: number): Node {
  const n = new Node('btn_disabled');
  size(n, Math.max(w, 88), Math.max(h, 88));
  const bg = rect('bg', w, h, C.panel, 12, C.line, 2);
  n.addChild(bg);
  bg.addChild(txt(label, 24, C.sub, true));
  return n;
}

/** 资源胶囊：碎片 / 金币。 */
function addResourcePill(
  root: Node, label: string, value: number, x: number, y: number, color: string,
) {
  const w = 230;
  const pill = rect('res', w, 44, '#160f08', 22, C.line, 1);
  pill.setPosition(x, y, 0);
  root.addChild(pill);

  const dot = circle('dot', 8, color);
  dot.setPosition(-w / 2 + 24, 0, 0);
  pill.addChild(dot);

  const t = txt(`${label} ${fmt(value)}`, 24, C.text, true, 'left');
  t.setPosition(-w / 2 + 44, 0, 0);
  anchor(t, 0, 0.5);
  pill.addChild(t);
}

/** 顶部永久技能卡：名字 + tag，未选择时显示“未选择”。 */
function addPermanentCard(root: Node, y: number, permanentId: string | null) {
  const defs = permanentSkills();
  const chosen = defs.find((d) => d.id === permanentId);

  const card = rect('permanent', 700, 124, C.panel2, 16, C.gold, 2);
  card.setPosition(0, y, 0);
  root.addChild(card);

  const label = txt('永久技能', 24, C.goldHi, true, 'left');
  label.setPosition(-320, 32, 0);
  anchor(label, 0, 0.5);
  card.addChild(label);

  const nm = txt(chosen ? chosen.name : '未选择', 32, chosen ? C.text : C.sub, true, 'left');
  nm.setPosition(-320, -22, 0);
  anchor(nm, 0, 0.5);
  card.addChild(nm);

  const tagText = chosen ? (TAG_LABEL[chosen.tag] ?? chosen.tag) : '—';
  const tag = rect('tag', 110, 40, '#120e08', 12, C.gold, 1);
  tag.setPosition(250, 0, 0);
  card.addChild(tag);
  tag.addChild(txt(tagText, 24, C.goldHi, true));
}

/** 已拥有技能的槽位卡：品质 / 等级 / 名字 / 蚀化与保护状态，点击进详情。 */
function addSkillCard(
  ctx: PageCtx, root: Node, skill: OwnedSkill, protectedNow: boolean,
  x: number, y: number, w: number, h: number,
) {
  const meta = QUALITY[skill.quality] ?? QUALITY.common;
  const name = skillName(skill.defId);
  const border = skill.corroded ? C.red : meta.color;

  const card = rect('skill', w, h, C.panel2, 14, border, 2);
  card.setPosition(x, y, 0);
  root.addChild(card);

  const q = rect('quality', 92, 36, '#120e08', 10, meta.color, 1);
  q.setPosition(-105, 56, 0);
  card.addChild(q);
  q.addChild(txt(meta.label, 24, meta.color, true));

  const lv = txt('Lv.' + skill.level, 24, C.goldHi, true, 'right');
  lv.setPosition(148, 56, 0);
  anchor(lv, 1, 0.5);
  card.addChild(lv);

  const nm = txt(name, 28, C.text, true);
  nm.setPosition(0, 8, 0);
  card.addChild(nm);

  const states: string[] = [];
  if (skill.corroded) states.push('已蚀化');
  if (protectedNow) states.push('保护中');
  if (states.length === 0) states.push('已装备');
  const stateColor = skill.corroded ? C.red : protectedNow ? C.gold : C.sub;
  const st = txt(states.join(' · '), 24, stateColor, true);
  st.setPosition(0, -48, 0);
  card.addChild(st);

  card.on(Node.EventType.TOUCH_END, () => openSkillDetail(ctx, skill.id), card);
}

/** 空槽位卡：已解锁但还没有技能。 */
function addEmptyCard(ctx: PageCtx, root: Node, x: number, y: number, w: number, h: number) {
  const card = rect('slot_empty', w, h, C.panel, 14, C.line, 1);
  card.setPosition(x, y, 0);
  root.addChild(card);

  const t = txt('空槽位', 26, C.sub, true);
  t.setPosition(0, 16, 0);
  card.addChild(t);

  const s = txt('通关试炼获取技能', 24, C.goldLo);
  s.setPosition(0, -38, 0);
  card.addChild(s);

  card.on(Node.EventType.TOUCH_END, () => ctx.toast('通关技能试炼即可获得技能'), card);
}

/** 未解锁槽位卡：显示“Lv.X 解锁”。 */
function addLockedCard(
  ctx: PageCtx, root: Node, index: number, x: number, y: number, w: number, h: number,
) {
  const lv = slotUnlockLevel(index);
  const card = rect('slot_locked', w, h, '#120e08', 14, C.line, 1);
  card.setPosition(x, y, 0);
  root.addChild(card);

  const t = txt(lv === null ? '槽位未解锁' : `Lv.${lv} 解锁`, 26, C.sub, true);
  t.setPosition(0, 16, 0);
  card.addChild(t);

  const s = txt('槽位未解锁', 24, C.goldLo);
  s.setPosition(0, -38, 0);
  card.addChild(s);

  card.on(Node.EventType.TOUCH_END, () => {
    ctx.toast(lv === null ? '槽位未解锁' : `达到 Lv.${lv} 解锁该槽位`);
  }, card);
}

/** 构建技能页。 */
export function buildSkills(ctx: PageCtx) {
  const save = saveData();
  const root = ctx.root;
  const H = S.h - S.top - S.tab;
  const level = DATA.player.lv;

  const title = txt('技能', 36, C.goldHi, true);
  title.setPosition(0, H / 2 - 40, 0);
  root.addChild(title);

  // 资源：碎片用于净化，金币用于洗点。
  addResourcePill(root, '碎片', save.shards, -122, H / 2 - 104, C.blue);
  addResourcePill(root, '金币', save.coins, 122, H / 2 - 104, C.gold);

  addPermanentCard(root, H / 2 - 208, save.permanentSkill);

  const unlocked = slotCount(level);
  // 渲染完整槽位表（低等级时能看到“Lv.X 解锁”），并防御性容纳超出当前槽数的存档技能。
  const total = Math.max(unlocked, maxSlotCount(), save.skills.length);
  const head = txt(`可用槽位 ${unlocked}/${total}`, 26, C.goldHi, true, 'left');
  head.setPosition(-342, H / 2 - 298, 0);
  anchor(head, 0, 0.5);
  root.addChild(head);

  const cols = 2;
  const cellW = 330;
  const cellH = 176;
  const gapX = 24;
  const gapY = 16;
  const totalW = cols * cellW + (cols - 1) * gapX;
  const top = H / 2 - 324; // 网格顶边
  const protectedSet = new Set(save.protectedSkills);

  for (let i = 0; i < total; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = -totalW / 2 + cellW / 2 + c * (cellW + gapX);
    const y = top - cellH / 2 - r * (cellH + gapY);
    const owned = i < save.skills.length ? save.skills[i] : null;

    if (owned) {
      addSkillCard(ctx, root, owned, protectedSet.has(owned.id), x, y, cellW, cellH);
    } else if (!isUnlocked(level, i)) {
      addLockedCard(ctx, root, i, x, y, cellW, cellH);
    } else {
      addEmptyCard(ctx, root, x, y, cellW, cellH);
    }
  }

  const blueprint = btn('蓝图工坊', 260, 64, () => ctx.toast('蓝图工坊即将开放'), {
    fs: 26, fill: C.panel3, color: C.goldHi, stroke: C.gold,
  });
  blueprint.setPosition(0, -430, 0);
  root.addChild(blueprint);
}

/** 技能详情弹窗：保护开关、净化（腐蚀时）、洗点与关闭。 */
function openSkillDetail(ctx: PageCtx, skillId: string) {
  const save = saveData();
  const skill = save.skills.find((s) => s.id === skillId);
  if (!skill) {
    ctx.toast('技能不存在');
    return;
  }

  const meta = QUALITY[skill.quality] ?? QUALITY.common;
  const name = skillName(skill.defId);
  const protectedNow = save.protectedSkills.indexOf(skill.id) >= 0;

  const card = panel(640, 720, C.panel2, 'panel_dark');

  const nm = txt(name, 38, C.text, true);
  nm.setPosition(0, 292, 0);
  card.addChild(nm);

  const sub = txt(`${meta.label} · Lv.${skill.level}`, 26, meta.color, true);
  sub.setPosition(0, 240, 0);
  card.addChild(sub);

  const stateText = skill.corroded
    ? (protectedNow ? '已蚀化 · 保护中' : '已蚀化')
    : (protectedNow ? '保护中' : '状态正常');
  const state = txt(stateText, 24, skill.corroded ? C.red : protectedNow ? C.gold : C.green, true);
  state.setPosition(0, 188, 0);
  card.addChild(state);

  // 保护开关：保护中 → 取消；未保护且有名额 → 保护；已满 → 置灰。
  if (protectedNow) {
    const off = btn('保护中（点击取消）', 440, 64, () => {
      const r = toggleProtect(save, skill.id);
      if (!r.ok) {
        ctx.toast('取消保护失败');
        return;
      }
      flushSave();
      ctx.refresh?.();
      ctx.toast(`已取消保护：${name}`);
      ctx.close();
      ctx.go('skills');
    }, { fs: 24, fill: C.panel3, color: C.gold, stroke: C.gold });
    off.setPosition(0, 112, 0);
    card.addChild(off);
  } else if (canProtect(save, skill.id)) {
    const on = btn('保护', 440, 64, () => {
      const r = toggleProtect(save, skill.id);
      if (!r.ok) {
        ctx.toast(r.reason === 'full' ? '保护位已满' : '保护失败');
        return;
      }
      flushSave();
      ctx.refresh?.();
      ctx.toast(`已保护：${name}`);
      ctx.close();
      ctx.go('skills');
    }, { fs: 24, fill: C.panel3, color: C.goldHi, stroke: C.gold });
    on.setPosition(0, 112, 0);
    card.addChild(on);
  } else {
    const full = disabledBtn(`保护位已满（${getGameplayConfig().trial.protectMax}）`, 440, 64);
    full.setPosition(0, 112, 0);
    card.addChild(full);
  }

  // 净化：只在蚀化时出现；碎片不足置灰。
  const cost = purifyCost(save, skill.id);
  if (cost.ok) {
    const enough = save.shards >= cost.shards;
    const label = enough
      ? `净化（消耗 ${cost.shards} 碎片）`
      : `净化（碎片不足 ${fmt(save.shards)}/${fmt(cost.shards)}）`;
    if (enough) {
      const clean = btn(label, 440, 64, () => {
        const r = purify(save, skill.id);
        if (!r.ok) {
          ctx.toast(r.reason === 'insufficient' ? '碎片不足' : '该技能无需净化');
          return;
        }
        flushSave();
        ctx.refresh?.();
        ctx.toast(`已净化：${name}`);
        ctx.close();
        ctx.go('skills');
      }, { fs: 24, fill: C.panel3, color: C.blue, stroke: C.blue });
      clean.setPosition(0, 20, 0);
      card.addChild(clean);
    } else {
      const clean = disabledBtn(label, 440, 64);
      clean.setPosition(0, 20, 0);
      card.addChild(clean);
    }
  } else {
    const normal = txt('无需净化', 24, C.green);
    normal.setPosition(0, 20, 0);
    card.addChild(normal);
  }

  // 洗点：先二次确认，再写回默认分配。
  const price = respecCost(DATA.player.lv);
  const respecBtn = btn(price > 0 ? `洗点（${fmt(price)} 金币）` : '洗点（免费）', 440, 64, () => {
    openRespecConfirm(ctx, skill.id, price);
  }, { fs: 24, fill: C.gold, color: '#241a09', stroke: '#f2dc9b' });
  respecBtn.setPosition(0, -78, 0);
  card.addChild(respecBtn);

  const close = btn('关闭', 200, 56, () => ctx.close(), {
    fs: 24, fill: C.panel, color: C.sub, stroke: C.line,
  });
  close.setPosition(0, -190, 0);
  card.addChild(close);

  ctx.popup(card);
}

/** 洗点二次确认弹窗（破坏性操作必须确认）。 */
function openRespecConfirm(ctx: PageCtx, skillId: string, price: number) {
  const card = panel(620, 380, C.panel2, 'panel_dark');

  const title = txt('洗点确认', 34, C.goldHi, true);
  title.setPosition(0, 126, 0);
  card.addChild(title);

  const msg = txt(`洗点会重置属性，消耗 ${fmt(price)} 金币`, 26, C.text);
  msg.setPosition(0, 52, 0);
  card.addChild(msg);

  const tip = txt(price > 0 ? '金币不足时无法洗点' : '当前等级洗点免费', 24, C.sub);
  tip.setPosition(0, 6, 0);
  card.addChild(tip);

  const cancel = btn('取消', 220, 60, () => openSkillDetail(ctx, skillId), {
    fs: 24, fill: C.panel, color: C.sub, stroke: C.line,
  });
  cancel.setPosition(-130, -112, 0);
  card.addChild(cancel);

  const ok = btn('确认洗点', 220, 60, () => doRespec(ctx, skillId), {
    fs: 24, fill: C.gold, color: '#241a09', stroke: '#f2dc9b',
  });
  ok.setPosition(130, -112, 0);
  card.addChild(ok);

  ctx.popup(card);
}

/** 执行洗点：扣费 + 写回默认分配 + 落盘 + 重建页面。 */
function doRespec(ctx: PageCtx, skillId: string) {
  const save = saveData();
  const r = respec(save, resetAttributes(), DATA.player.lv);

  if (!r.ok) {
    ctx.toast(r.reason === 'insufficient'
      ? `金币不足（需要 ${fmt(r.cost)} 金币）`
      : '属性分配非法，无法洗点');
    openSkillDetail(ctx, skillId);
    return;
  }

  flushSave();
  ctx.refresh?.();
  ctx.toast(r.cost > 0 ? `洗点完成（-${fmt(r.cost)} 金币）` : '洗点完成（免费）');
  ctx.close();
  ctx.go('skills');
}
