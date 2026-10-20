/**
 * HeroDetail —— 武将详情页：身份、战斗属性、立绘与养成操作。
 * 布局参考角色资料卡：上方身份，中段双列属性，下段角色展示与技能摘要。
 */
import { Label, Node } from 'cc';
import { C, S, rect, txt, circle, btn, panel, anchor, img } from '../framework/UI';
import { DATA } from '../framework/GameData';
import { getConfig } from '../framework/Config';
import { heroBattleStats } from '../framework/Stats';
import { State } from '../framework/State';
import { upgradeHero, upgradeCost } from '../framework/Inventory';
import { saveData, flushSave } from '../framework/GameSave';
import type { PageCtx } from '../framework/Types';

function setLabel(node: Node, value: string): void {
  const label = node.getComponent(Label);
  if (label) label.string = value;
}

/** 构建武将详情页。 */
export function buildHeroDetail(ctx: PageCtx) {
  const root = ctx.root;
  const H = S.h - S.top - S.tab;
  const h = State.hero;
  const heroCfg = getConfig().heroes.find((item) => item.id === h.id);
  const powerValue = () => h.power + ((saveData().heroLevels[h.id] ?? 1) - 1) * 120;
  const battleStats = () => {
    const level = saveData().heroLevels[h.id] ?? 1;
    return heroCfg ? heroBattleStats(heroCfg.hp, heroCfg.atk, level) : null;
  };

  const back = btn('‹ 返回图鉴', 156, 52, () => ctx.go('heroes'), { fs: 24, skin: 'btn_secondary' });
  back.setPosition(-258, H / 2 - 38, 0);
  root.addChild(back);

  const pageTitle = txt('武将档案', 30, C.goldHi, true, 'left');
  pageTitle.setPosition(-150, H / 2 - 38, 0);
  anchor(pageTitle, 0, 0.5);
  root.addChild(pageTitle);

  // 身份卡：将姓名、称号、职业、星级和战力放在同一视觉区。
  const identity = panel(700, 150, C.panel2, 'panel_dark');
  identity.setPosition(0, H / 2 - 150, 0);
  root.addChild(identity);

  const crest = circle('crest', 48, h.color, C.gold, 3);
  crest.setPosition(-285, 0, 0);
  identity.addChild(crest);
  crest.addChild(txt(h.name[0], 42, '#ffffff', true));

  const name = txt(h.name, 38, C.text, true, 'left');
  name.setPosition(-218, 38, 0);
  anchor(name, 0, 0.5);
  identity.addChild(name);

  const title = txt(`${h.title} · ${h.cls}`, 24, C.goldHi, false, 'left');
  title.setPosition(-216, -4, 0);
  anchor(title, 0, 0.5);
  identity.addChild(title);

  const stars = txt('★'.repeat(h.stars) + '☆'.repeat(5 - h.stars), 24, C.gold, false, 'left');
  stars.setPosition(-216, -43, 0);
  anchor(stars, 0, 0.5);
  identity.addChild(stars);

  const identityPower = txt(`战力 ${powerValue()}`, 26, C.text, true, 'right');
  identityPower.setPosition(310, 38, 0);
  anchor(identityPower, 1, 0.5);
  identity.addChild(identityPower);

  const identityLevel = txt(`Lv.${saveData().heroLevels[h.id] ?? 1}`, 24, C.sub, false, 'right');
  identityLevel.setPosition(310, -3, 0);
  anchor(identityLevel, 1, 0.5);
  identity.addChild(identityLevel);

  // 属性卡使用数值而非装饰进度条，避免把未配置的属性表现成精确数据。
  const stats = panel(700, 220, C.panel2, 'panel');
  stats.setPosition(0, H / 2 - 346, 0);
  root.addChild(stats);

  const statsTitle = txt('战斗属性', 26, C.goldHi, true, 'left');
  statsTitle.setPosition(-312, 84, 0);
  anchor(statsTitle, 0, 0.5);
  stats.addChild(statsTitle);

  const statNodes: Record<string, Node> = {};
  const leftStats: [string, string][] = [
    ['等级', `Lv.${saveData().heroLevels[h.id] ?? 1}`],
    ['攻击', String(battleStats()?.atk ?? '—')],
    ['生命', String(battleStats()?.hp ?? '—')],
  ];
  const rightStats: [string, string][] = [
    ['战力', String(powerValue())],
    ['速度', String(heroCfg?.speed ?? '—')],
    ['星级', `${h.stars} / 5`],
  ];
  const addStatColumn = (rows: [string, string][], x: number, keyPrefix: string) => {
    rows.forEach(([label, value], i) => {
      const y = 38 - i * 50;
      const labelNode = txt(label, 24, C.sub, false, 'left');
      labelNode.setPosition(x, y, 0);
      anchor(labelNode, 0, 0.5);
      stats.addChild(labelNode);

      const valueNode = txt(value, 26, C.text, true, 'right');
      valueNode.setPosition(x + 300, y, 0);
      anchor(valueNode, 1, 0.5);
      stats.addChild(valueNode);
      statNodes[keyPrefix + label] = valueNode;
    });
  };
  addStatColumn(leftStats, -312, 'left:');
  addStatColumn(rightStats, 32, 'right:');

  // 角色展示区：当前仓库只有关羽的独立立绘，其余武将用职业色徽记兜底。
  const profile = panel(700, 240, C.panel2, 'panel');
  profile.setPosition(0, H / 2 - 582, 0);
  root.addChild(profile);

  const profileTitle = txt('武将定位', 26, C.goldHi, true, 'left');
  profileTitle.setPosition(-310, 82, 0);
  anchor(profileTitle, 0, 0.5);
  profile.addChild(profileTitle);

  const profileRole = txt(`${h.title} · ${h.cls}`, 28, C.text, true, 'left');
  profileRole.setPosition(-310, 36, 0);
  anchor(profileRole, 0, 0.5);
  profile.addChild(profileRole);

  const profileCopy = txt('升级可提升攻击与生命，强化战斗表现。', 24, C.sub, false, 'left');
  profileCopy.setPosition(-310, -12, 0);
  anchor(profileCopy, 0, 0.5);
  profile.addChild(profileCopy);

  const portraitFrame = rect('portraitFrame', 210, 210, '#100c08', 20, C.goldLo, 2);
  portraitFrame.setPosition(218, -2, 0);
  profile.addChild(portraitFrame);
  if (h.id === 'guanyu') {
    img('char/guanyu_art/portrait', 196, 202).then((portrait) => {
      portrait.setPosition(218, -5, 0);
      profile.addChild(portrait);
    });
  } else {
    const fallback = circle('portraitFallback', 68, h.color, C.gold, 3);
    fallback.setPosition(218, -2, 0);
    profile.addChild(fallback);
    fallback.addChild(txt(h.name[0], 64, '#ffffff', true));
  }

  // 技能摘要留在角色资料卡内，详细冷却信息由底部操作打开。
  const skills = panel(700, 140, C.panel2, 'panel_dark');
  skills.setPosition(0, H / 2 - 778, 0);
  root.addChild(skills);
  const skillsTitle = txt('战斗技能', 26, C.goldHi, true, 'left');
  skillsTitle.setPosition(-312, 48, 0);
  anchor(skillsTitle, 0, 0.5);
  skills.addChild(skillsTitle);

  DATA.skills.forEach((skill, i) => {
    const x = -220 + i * 220;
    const chip = rect('skillChip', 202, 54, '#160f08', 14, C.line, 1);
    chip.setPosition(x, -24, 0);
    skills.addChild(chip);
    const dot = circle('skillDot', 16, skill.color, C.goldLo, 1);
    dot.setPosition(-72, 0, 0);
    chip.addChild(dot);
    const skillName = txt(skill.name, 24, C.text, true, 'left');
    skillName.setPosition(-48, 0, 0);
    anchor(skillName, 0, 0.5);
    chip.addChild(skillName);
  });

  const skillAction = btn('技能详情', 190, 68, () => {
    const card = panel(600, 430, C.panel2, 'panel');
    const heading = txt(`${h.name} · 战斗技能`, 30, C.goldHi, true);
    heading.setPosition(0, 160, 0);
    card.addChild(heading);
    DATA.skills.forEach((skill, i) => {
      const rowY = 88 - i * 76;
      const row = rect('skillDetailRow', 520, 62, '#160f08', 12, C.line, 1);
      row.setPosition(0, rowY, 0);
      card.addChild(row);
      const label = txt(skill.name, 26, C.text, true, 'left');
      label.setPosition(-230, 0, 0);
      anchor(label, 0, 0.5);
      row.addChild(label);
      const cooldown = txt(`冷却 ${skill.cd} 秒`, 24, C.sub, false, 'right');
      cooldown.setPosition(230, 0, 0);
      anchor(cooldown, 1, 0.5);
      row.addChild(cooldown);
    });
    const close = btn('关闭', 180, 64, () => ctx.close(), { fs: 24, skin: 'btn_secondary' });
    close.setPosition(0, -166, 0);
    card.addChild(close);
    ctx.popup(card);
  }, { fs: 24, skin: 'btn_secondary' });
  skillAction.setPosition(0, -H / 2 + 48, 0);
  root.addChild(skillAction);

  const returnAction = btn('返回图鉴', 190, 68, () => ctx.go('heroes'), { fs: 24, skin: 'btn_secondary' });
  returnAction.setPosition(-230, -H / 2 + 48, 0);
  root.addChild(returnAction);

  let upgradeActionText: Node | null = null;
  const upgradeAction = btn(`升级 · ${upgradeCost(saveData().heroLevels[h.id] ?? 1)} 金币`, 230, 68, () => {
    const result = upgradeHero(saveData(), h.id);
    if (result.ok) {
      flushSave();
      ctx.refresh?.();
      const currentStats = battleStats();
      setLabel(identityPower, `战力 ${powerValue()}`);
      setLabel(identityLevel, `Lv.${result.nextLevel}`);
      setLabel(statNodes['left:等级'], `Lv.${result.nextLevel}`);
      setLabel(statNodes['left:攻击'], String(currentStats?.atk ?? '—'));
      setLabel(statNodes['left:生命'], String(currentStats?.hp ?? '—'));
      setLabel(statNodes['right:战力'], String(powerValue()));
      if (upgradeActionText) setLabel(upgradeActionText, `升级 · ${upgradeCost(result.nextLevel)} 金币`);
      ctx.toast(`升级成功 Lv.${result.nextLevel}（-${result.cost} 金币）`);
    } else if (result.reason === 'max') {
      ctx.toast('已满级');
    } else {
      ctx.toast(`金币不足（需要 ${result.cost}）`);
    }
  }, { fs: 24, skin: 'btn_primary' });
  upgradeAction.setPosition(230, -H / 2 + 48, 0);
  root.addChild(upgradeAction);
  upgradeActionText = upgradeAction.getChildByName('bg')?.children[0] ?? null;
}
