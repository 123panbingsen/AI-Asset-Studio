/**
 * Home —— 主城挂机页：挂机模式切换、离线收益领取、日蚀时段、蚀化警告与功能入口。
 *
 * 页面只负责展示与交互：离线结算、挂机速率、日蚀判断全部来自
 * `framework/idle/Idle`，时段/上限/倍率读 `getGameplayConfig().idle`，
 * 本文件不硬编码任何平衡数值。
 */
import { Node } from 'cc';
import { C, S, rect, txt, btn, circle, anchor, panel, clear } from '../framework/UI';
import { eclipseActive, idleRates, offlineReport } from '../framework/idle/Idle';
import type { IdleMode, OfflineReport } from '../framework/idle/Idle';
import { flushSave, saveData } from '../framework/GameSave';
import { getGameplayConfig } from '../framework/Config';
import { permanentSkills } from '../framework/skills/SkillDefs';
import { State } from '../framework/State';
import type { PageCtx } from '../framework/Types';
import type { SaveData } from '../framework/Save';

/** 内容区高度（与 App 的内容区一致：设计高 - 顶栏 - 底栏）。 */
const H = S.h - S.top - S.tab;
/** 页面左右留白。 */
const PAD = 24;
/** 卡片宽度（页面满宽减去留白）。 */
const CARD_W = S.w - PAD * 2;
/** 分区之间的竖向间距。 */
const GAP = 18;

const WARN_H = 88;
const IDLE_H = 300;
const ACTION_H = 96;
const CHAR_H = 230;
const ZONE_H = 152;

/** 千分位整数。 */
function fmtInt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 速率数字：整数不带小数，非整数保留一位。 */
function fmtRate(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1);
}

/** 每分钟概率转百分比文本。 */
function fmtChance(perMin: number): string {
  if (!Number.isFinite(perMin) || perMin <= 0) return '0%';
  return fmtRate(perMin * 100) + '%';
}

/** 秒数转“X 小时 Y 分”。 */
function fmtDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分钟`;
  return `${total} 秒`;
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

/** 日蚀时段文案（配置驱动）。 */
function eclipseWindowText(): string {
  const e = getGameplayConfig().idle.eclipse;
  return `每日 ${pad2(e.startHour)}:00-${pad2(e.endHour)}:00`;
}

/** 永久技能标签的中文名。 */
function tagText(tag: string | undefined): string {
  if (tag === 'dps') return '输出';
  if (tag === 'tank') return '防御';
  if (tag === 'idle') return '挂机';
  return '待定';
}

/**
 * 在父节点上创建一行文本。
 * `align` 同时决定锚点：left 以 x 为左边缘，right 以 x 为右边缘。
 */
function label(
  parent: Node, s: string, fs: number, color: string, x: number, y: number,
  bold = false, align: 'left' | 'center' | 'right' = 'center',
): Node {
  const t = txt(s, fs, color, bold, align);
  anchor(t, align === 'left' ? 0 : align === 'right' ? 1 : 0.5, 0.5);
  t.setPosition(x, y, 0);
  parent.addChild(t);
  return t;
}

/** 水平分隔线。 */
function divider(parent: Node, w: number, y: number): void {
  const n = rect('divider', w, 2, '#2a2115', 0);
  n.setPosition(0, y, 0);
  parent.addChild(n);
}

/** 冒险挂机二次确认弹窗。 */
function buildAdventureConfirm(onOk: () => void, onCancel: () => void): Node {
  const cardH = 380;
  const card = panel(580, cardH, C.panel2, 'panel_dark');
  const top = cardH / 2;

  label(card, '冒险挂机', 34, C.goldHi, 0, top - 62, true);
  label(card, '收益更高，但有概率触发试炼。', 24, C.text, 0, top - 128);
  label(card, '试炼失败会使技能蚀化，需要碎片净化。', 24, C.sub, 0, top - 172);

  const ok = btn('确认', 240, 88, onOk, { fs: 28, skin: 'btn_primary' });
  ok.setPosition(-130, -top + 100, 0);
  card.addChild(ok);

  const cancel = btn('取消', 240, 88, onCancel, { fs: 28, skin: 'btn_secondary' });
  cancel.setPosition(130, -top + 100, 0);
  card.addChild(cancel);

  return card;
}

/** 离线收益弹窗：展示本次结算明细，领取后重置离线计时。 */
function buildOfflineReport(ctx: PageCtx, report: OfflineReport, onClaimed: () => void): Node {
  const cardH = 660;
  const card = panel(620, cardH, C.panel2, 'panel_dark');
  const top = cardH / 2;
  const idleCfg = getGameplayConfig().idle;

  label(card, '离线收益', 38, C.goldHi, 0, top - 62, true);

  const rows: [string, string, string][] = [
    ['离线时长', fmtDuration(report.seconds), C.text],
    ['金币', `+${fmtInt(report.coins)}`, C.goldHi],
    ['碎片', `+${fmtInt(report.shards)}`, C.goldHi],
    ['试炼 / 蚀化', `${fmtInt(report.trials)} 次 / ${saveData().skills.filter((s) => s.corroded).length} 个`, C.text],
    ['日蚀加成', report.eclipse ? `有 · 产出 ×${fmtRate(idleCfg.eclipse.resourceMult)}` : '无', report.eclipse ? C.goldHi : C.sub],
    ['结算封顶', report.capped ? `已达 ${idleCfg.offlineCapHours} 小时上限` : `未封顶（上限 ${idleCfg.offlineCapHours} 小时）`, report.capped ? C.red : C.sub],
  ];
  rows.forEach((r, i) => {
    const y = top - 140 - i * 62;
    label(card, r[0], 26, C.sub, -262, y, false, 'left');
    label(card, r[1], 28, r[2], 262, y, true, 'right');
    if (i < rows.length - 1) divider(card, 520, y - 31);
  });

  label(card, '领取后离线计时将重新开始', 24, C.sub, 0, top - 508);

  let claimed = false;
  const claim = btn('领取收益', 320, 88, () => {
    if (claimed) return;
    claimed = true;
    const save = saveData();
    save.coins += report.coins;
    save.shards += report.shards;
    save.lastSeenAt = Date.now();
    flushSave();
    if (ctx.refresh) ctx.refresh();
    ctx.toast('已领取离线收益');
    ctx.close();
    onClaimed();
  }, { fs: 30, skin: 'btn_primary' });
  claim.setPosition(0, -top + 78, 0);
  card.addChild(claim);

  return card;
}

/** 挂机模式卡：模式切换、当前速率、日蚀状态。 */
function buildIdleCard(
  card: Node, mode: IdleMode, eclipse: boolean, onPick: (m: IdleMode) => void,
): void {
  const top = IDLE_H / 2;
  const rates = idleRates(mode, eclipse);
  const idleCfg = getGameplayConfig().idle;

  label(card, '挂机模式', 30, C.goldHi, -CARD_W / 2 + 28, top - 32, true, 'left');

  const chip = rect('mode-chip', 190, 44, '#160f08', 22, C.gold, 1);
  chip.setPosition(CARD_W / 2 - 125, top - 32, 0);
  card.addChild(chip);
  chip.addChild(txt(mode === 'adventure' ? '当前 · 冒险' : '当前 · 安全', 24, C.goldHi, true));

  const modes: { key: IdleMode; name: string }[] = [
    { key: 'safe', name: '安全挂机' },
    { key: 'adventure', name: '冒险挂机' },
  ];
  modes.forEach((m, i) => {
    const active = mode === m.key;
    const b = btn(m.name, 300, 88, () => onPick(m.key), {
      fs: 28,
      skin: active ? 'btn_primary' : 'btn_secondary',
      fill: active ? C.gold : C.panel3,
      color: active ? '#2a1808' : C.goldHi,
    });
    b.setPosition(-160 + i * 320, 68, 0);
    card.addChild(b);
  });

  const cells: [string, string][] = [
    ['金币/分', fmtRate(rates.coinsPerMin)],
    ['碎片/分', fmtRate(rates.shardsPerMin)],
    ['试炼概率', fmtChance(rates.trialChancePerMin)],
  ];
  cells.forEach((c, i) => {
    const box = rect('rate', 196, 78, '#160f08', 12, C.line, 1);
    box.setPosition(-214 + i * 214, -8, 0);
    card.addChild(box);
    label(box, c[0], 24, C.sub, 0, 18);
    label(box, c[1], 30, C.goldHi, 0, -16, true);
  });

  const strip = rect(
    'eclipse', 646, 54,
    eclipse ? C.gold : '#160f08', 12, eclipse ? '#f2dc9b' : C.line, 2,
  );
  strip.setPosition(0, -63, 0);
  card.addChild(strip);
  strip.addChild(txt(
    eclipse
      ? `日蚀时刻进行中 · 产出 ×${fmtRate(idleCfg.eclipse.resourceMult)}`
      : `${eclipseWindowText()} · 日蚀产出 ×${fmtRate(idleCfg.eclipse.resourceMult)}`,
    26, eclipse ? '#2a1808' : C.sub, eclipse,
  ));

  // 距离下次日蚀的倒计时（构建时计算一次）
  const nowH = new Date().getHours() + new Date().getMinutes() / 60;
  const st = idleCfg.eclipse.startHour;
  const en = idleCfg.eclipse.endHour;
  let cd = '';
  if (nowH >= st && nowH < en) {
    cd = `日蚀剩余 ${Math.max(1, Math.ceil((en - nowH) * 60))} 分钟`;
  } else {
    const delta = nowH < st ? st - nowH : 24 - nowH + st;
    cd = `距下次日蚀 ${Math.floor(delta)} 小时 ${Math.round((delta - Math.floor(delta)) * 60)} 分`;
  }
  label(card, cd, 23, C.sub, 0, -99);

  label(card, '冒险收益更高，但可能触发试炼；失败会蚀化技能', 21, C.sub, 0, -128);
}

/** 主页焦点卡：展示当前探索区域和挂机状态。 */
function buildZoneCard(card: Node, mode: IdleMode, eclipse: boolean): void {
  const top = ZONE_H / 2;
  const glow = circle('zone-sigil', 38, eclipse ? '#5b3512' : '#241a09', C.gold, 2);
  glow.setPosition(-CARD_W / 2 + 68, 4, 0);
  card.addChild(glow);
  glow.addChild(txt(eclipse ? '蚀' : '旅', 38, C.goldHi, true));

  label(card, '蚀雾边境', 34, C.text, -CARD_W / 2 + 124, top - 45, true, 'left');
  label(card, eclipse ? '日蚀时刻 · 资源增益生效' : '探索中 · 挂机自动积累资源', 23, C.sub, -CARD_W / 2 + 124, top - 88, false, 'left');

  const status = rect('zone-status', 164, 48, mode === 'adventure' ? '#4a2115' : '#1c2819', 24, mode === 'adventure' ? C.red : C.green, 1);
  status.setPosition(CARD_W / 2 - 104, 4, 0);
  card.addChild(status);
  status.addChild(txt(mode === 'adventure' ? '冒险中' : '安全中', 23, C.goldHi, true));
}

/** 养成摘要：聚焦永久技能和需要处理的蚀化状态。 */
function buildCharCard(
  card: Node, save: SaveData, permList: { id: string; name: string; desc: string; tag: string }[], onSkills: () => void,
): void {
  const top = CHAR_H / 2;

  label(card, '养成状态', 29, C.goldHi, -CARD_W / 2 + 28, top - 34, true, 'left');
  label(card, `碎片 ${fmtInt(save.shards)}`, 23, C.sub, CARD_W / 2 - 28, top - 34, false, 'right');

  const permBox = rect('perm', 646, 94, '#160f08', 14, C.line, 1);
  permBox.setPosition(0, 8, 0);
  card.addChild(permBox);

  const icon = circle('perm-icon', 30, C.panel3, C.gold, 2);
  icon.setPosition(-271, 0, 0);
  permBox.addChild(icon);
  icon.addChild(txt('永', 24, C.goldHi, true));

  label(permBox, '永久技能', 24, C.sub, -231, 22, false, 'left');

  const permId = save.permanentSkill;
  const perm = permId ? permList.filter((p) => p.id === permId)[0] : undefined;
  label(
    permBox,
    perm ? perm.name : (permId || '尚未选择'),
    30, perm ? C.goldHi : C.sub, -231, -20, true, 'left',
  );

  const tag = rect('tag', 120, 44, '#241a09', 22, C.line, 1);
  tag.setPosition(239, 0, 0);
  permBox.addChild(tag);
  tag.addChild(txt(tagText(perm ? perm.tag : undefined), 24, C.goldHi, true));

  const corrodedCount = save.skills.filter((s) => s.corroded).length;
  const corrosionText = corrodedCount > 0 ? `待净化技能 ${corrodedCount} 个` : '技能状态良好';
  const corrosionColor = corrodedCount > 0 ? C.red : C.green;
  const corrosion = rect('corrosion-status', 360, 48, '#160f08', 22, corrosionColor, 1);
  corrosion.setPosition(-144, -68, 0);
  card.addChild(corrosion);
  corrosion.addChild(txt(corrosionText, 22, corrodedCount > 0 ? C.goldHi : C.sub, true));

  const skills = btn('管理技能', 190, 64, onSkills, { fs: 23, skin: 'btn_secondary' });
  skills.setPosition(224, -68, 0);
  card.addChild(skills);
}

/** 构建主城挂机页。 */
export function buildHome(ctx: PageCtx) {
  const root = ctx.root;

  // 首次进入初始化 lastSeenAt，之后每次进入按它结算离线；0 不再出现（否则永远没有离线收益）。
  const bootSave = saveData();
  if (bootSave.lastSeenAt === 0) {
    bootSave.lastSeenAt = Date.now();
    flushSave();
  }
  const report = bootSave.lastSeenAt > 0 ? offlineReport(bootSave, Date.now()) : null;

  /** 写入挂机模式并重建页面（速率、高亮与提示随模式变化）。 */
  function applyMode(next: IdleMode, tip: string): void {
    const save = saveData();
    if (save.idleMode !== next) {
      save.idleMode = next;
      flushSave();
    }
    ctx.toast(tip);
    render();
  }

  /** 挂机模式按钮：安全立即生效；冒险需二次确认。 */
  function pickMode(next: IdleMode): void {
    const save = saveData();
    if (next === 'safe') {
      if (save.idleMode === 'safe') {
        ctx.toast('当前已是安全挂机');
        return;
      }
      applyMode('safe', '已切换为安全挂机');
      return;
    }
    if (save.idleMode === 'adventure') {
      ctx.toast('当前已是冒险挂机');
      return;
    }
    ctx.popup(buildAdventureConfirm(
      () => {
        ctx.close();
        applyMode('adventure', '已切换为冒险挂机');
      },
      () => ctx.close(),
    ));
  }

  /** 进入试炼：标记试炼模式后复用战斗页（Battle 据此走试炼分支）。 */
  function startTrial(): void {
    State.trialActive = true;
    State.battleStageId = '1-1';
    ctx.go('battle');
  }

  function render(): void {
    clear(root);

    const save = saveData();
    const mode: IdleMode = save.idleMode === 'adventure' ? 'adventure' : 'safe';
    const eclipse = eclipseActive(Date.now());
    const idleCfg = getGameplayConfig().idle;
    const corrodedCount = save.skills.filter((s) => s.corroded).length;
    const permList = permanentSkills();

    let cursor = H / 2 - PAD;

    // ===== 蚀化警告条：置顶显示，点击进入技能页修复 =====
    if (corrodedCount > 0) {
      const warn = rect('corrode-warn', CARD_W, WARN_H, '#7a1f16', 14, C.goldHi, 2);
      warn.setPosition(0, cursor - WARN_H / 2, 0);
      root.addChild(warn);

      const mark = circle('warn-icon', 20, C.gold, '#f7dc9a', 2);
      mark.setPosition(-CARD_W / 2 + 44, 0, 0);
      warn.addChild(mark);
      mark.addChild(txt('!', 24, '#2a1808', true));

      label(warn, '有技能被蚀化 · 点击修复', 28, C.goldHi, 6, 0, true);
      label(warn, `${corrodedCount} 个`, 24, C.goldHi, CARD_W / 2 - 30, 0, true, 'right');
      warn.on(Node.EventType.TOUCH_END, () => ctx.go('skills'), warn);

      cursor -= WARN_H + GAP;
    }

    // ===== 标题 =====
    label(root, '主城', 42, C.goldHi, -CARD_W / 2, cursor - 28, true, 'left');
    label(root, '日蚀边境', 23, C.sub, CARD_W / 2, cursor - 29, false, 'right');
    cursor -= 58 + 12;

    // ===== 当前探索区域：建立主城视觉焦点 =====
    const zoneCard = panel(CARD_W, ZONE_H, C.panel2, 'panel_dark');
    zoneCard.setPosition(0, cursor - ZONE_H / 2, 0);
    root.addChild(zoneCard);
    buildZoneCard(zoneCard, mode, eclipse);
    cursor -= ZONE_H + GAP;

    // ===== 挂机模式卡 =====
    const idleCard = panel(CARD_W, IDLE_H, C.panel2, 'panel_dark');
    idleCard.setPosition(0, cursor - IDLE_H / 2, 0);
    root.addChild(idleCard);
    buildIdleCard(idleCard, mode, eclipse, pickMode);
    cursor -= IDLE_H + GAP;

    // ===== 主行动：开始试炼；技能管理作为已开放的次级入口 =====
    const trialAction = btn('开始技能试炼', 430, ACTION_H, startTrial, { fs: 30, skin: 'btn_primary' });
    trialAction.setPosition(-124, cursor - ACTION_H / 2, 0);
    root.addChild(trialAction);

    const rosterAction = btn('武将图鉴', 210, ACTION_H, () => ctx.go('heroes'), { fs: 24, skin: 'btn_secondary' });
    rosterAction.setPosition(208, cursor - ACTION_H / 2, 0);
    root.addChild(rosterAction);
    cursor -= ACTION_H + GAP;

    // ===== 角色卡 =====
    const charCard = panel(CARD_W, CHAR_H, C.panel2, 'panel_dark');
    charCard.setPosition(0, cursor - CHAR_H / 2, 0);
    root.addChild(charCard);
    buildCharCard(charCard, save, permList, () => ctx.go('skills'));
    cursor -= CHAR_H;

    // ===== 底部说明 =====
    label(root, `离线收益上限 ${idleCfg.offlineCapHours} 小时`, 21, C.sub, 0, cursor - 24);
  }

  render();

  // 离线报告只在进入页面时结算一次；不足 1 分钟不弹，避免空报告反复打断。
  if (report && report.seconds >= 60) {
    ctx.popup(buildOfflineReport(ctx, report, render));
  }
}
