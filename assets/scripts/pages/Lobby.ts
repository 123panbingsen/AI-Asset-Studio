/**
 * Lobby —— 主城页：英雄展示、出战入口、武将快捷入口与活动横幅。
 */
import { Label, LabelOutline, Node, Color } from 'cc';
import { C, S, size, rect, txt, circle, btn, anchor, img, applySkin } from '../framework/UI';
import { PortraitActor } from '../framework/PortraitActor';
import { DATA } from '../framework/GameData';
import { getConfig } from '../framework/Config';
import { State } from '../framework/State';
import type { PageCtx } from '../framework/Types';

/** 给文本加描边，提升深色背景上的辨识度。 */
function outline(n: Node, color = '#1a0f05', width = 2): Node {
  const lb = n.getComponent(Label);
  if (lb) {
    const o = n.getComponent(LabelOutline) || n.addComponent(LabelOutline);
    const c = color.replace('#', '');
    o.color = new Color(parseInt(c.substring(0, 2), 16), parseInt(c.substring(2, 4), 16), parseInt(c.substring(4, 6), 16), 255);
    o.width = width;
  }
  return n;
}

/** 构建主城页。 */
export function buildLobby(ctx: PageCtx) {
  const root = ctx.root;
  const H = S.h - S.top - S.tab;

  // 背景
  const bg = new Node('lobbybg');
  size(bg, S.w, H);
  root.addChild(bg);
  img('ui/backdrop/backdrop-menu@2x', S.w, H).then((n) => bg.addChild(n));

  // 公告
  const banner = rect('banner', 680, 46, '#1a1208', 10, C.line, 1);
  banner.setPosition(0, H / 2 - 40, 0);
  root.addChild(banner);
  banner.addChild(txt('新皮肤「青龙偃月」限时上线 · 武圣再临', 20, C.goldHi, false));

  const heroes = getConfig().heroes.length ? getConfig().heroes : DATA.heroes;

  // ===== 主展示：真实关羽立绘（程序化动效） =====
  const stage = new Node('hero-stage');
  size(stage, 380, 440);
  stage.setPosition(0, 215, 0);
  root.addChild(stage);

  const glow = circle('glow', 110, '#0d0906', '#3a2c14', 1);
  glow.setPosition(0, -200, 0);
  stage.addChild(glow);

  const heroNode = new Node('hero');
  size(heroNode, 300, 400);
  heroNode.setPosition(0, -195, 0);
  stage.addChild(heroNode);

  const pa = heroNode.addComponent(PortraitActor);
  pa.setup('char/guanyu_art/portrait', 400).then((ok) => {
    if (!ok) {
      const fb = circle('fb', 120, '#00000000', C.gold, 2);
      stage.addChild(fb);
      fb.addChild(txt('武', 96, C.goldHi, true));
    }
  });

  // 武圣印
  const seal = rect('seal', 52, 52, C.red, 6);
  seal.setPosition(170, -172, 0);
  stage.addChild(seal);
  seal.addChild(txt('武圣', 19, '#f7e7d8', true));

  // ===== 武将信息 =====
  const nm = outline(txt('关羽 · 云长', 44, C.jade, true), '#07130b', 3);
  nm.setPosition(0, -30, 0);
  root.addChild(nm);

  const tt = txt('蜀汉五虎上将 · 青龙偃月刀', 21, C.sub, false);
  tt.setPosition(0, -72, 0);
  root.addChild(tt);

  ['战士', '爆发', '斩将'].forEach((s, i) => {
    const chip = rect('chip', 100, 34, '#160f08', 17, C.line, 1);
    chip.setPosition(-112 + i * 112, -114, 0);
    root.addChild(chip);
    chip.addChild(txt(s, 19, C.goldHi));
  });

  // ===== 出征 =====
  const cta = rect('cta', 270, 72, C.gold, 14, '#f2dc9b', 3);
  cta.setPosition(0, -192, 0);
  root.addChild(cta);
  applySkin(cta, 'btn_primary', 270, 72);
  cta.addChild(txt('出 征', 36, '#2a1808', true));
  cta.on(Node.EventType.TOUCH_END, () => ctx.go('stage-select'), cta);

  // ===== 快捷武将：3 张卡 + 全部武将卡 =====
  const rowY = -350;
  const cardW = 165;
  const cardH = 200;
  const xs = [-268, -88, 92, 272];

  heroes.slice(0, 3).forEach((h, i) => {
    const card = rect('hero-card', cardW, cardH, '#1a1208', 14, C.line, 1);
    card.setPosition(xs[i], rowY, 0);
    root.addChild(card);

    const av = circle('av', 46, '#241a09', C.gold, 2);
    av.setPosition(0, 48, 0);
    card.addChild(av);
    av.addChild(outline(txt(h.name[0], 36, C.goldHi, true), '#1a0f05', 3));

    const name = txt(h.name, 23, C.text, true);
    name.setPosition(0, -10, 0);
    card.addChild(name);

    const p = txt('战力 ' + h.power, 18, C.goldHi, false);
    p.setPosition(0, -44, 0);
    card.addChild(p);

    card.on(Node.EventType.TOUCH_END, () => {
      State.hero = h;
      ctx.go('heroDetail');
    }, card);
  });

  const moreCard = rect('more-card', cardW, cardH, '#2a1e0c', 14, C.goldHi, 2);
  moreCard.setPosition(xs[3], rowY, 0);
  root.addChild(moreCard);
  const arrow = txt('›', 58, C.goldHi, true);
  arrow.setPosition(0, 58, 0);
  moreCard.addChild(arrow);
  const moreLb = txt('全部武将', 23, C.goldHi, true);
  moreLb.setPosition(0, -14, 0);
  moreCard.addChild(moreLb);
  const moreSub = txt('查看图鉴', 18, C.sub, false);
  moreSub.setPosition(0, -46, 0);
  moreCard.addChild(moreSub);
  moreCard.on(Node.EventType.TOUCH_END, () => ctx.go('heroes'), moreCard);
}


