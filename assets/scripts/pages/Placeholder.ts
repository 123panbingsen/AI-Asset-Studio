/**
 * Placeholder —— M2/P1 系统的占位页（宠物 / 蓝图），保证 5 Tab 导航可点击。
 */
import { C, S, txt, btn } from '../framework/UI';
import type { PageCtx } from '../framework/Types';

function buildComingSoon(ctx: PageCtx, title: string, desc: string) {
  const H = S.h - S.top - S.tab;
  const root = ctx.root;
  root.addChild(txt(title, 40, C.goldHi, true));
  root.children[root.children.length - 1].setPosition(0, H / 2 - 120, 0);
  const d = txt(desc, 24, C.sub, false);
  d.setPosition(0, H / 2 - 190, 0);
  root.addChild(d);
  const back = btn('返回主城', 240, 72, () => ctx.go('home'), { fs: 28, skin: 'btn_primary' });
  back.setPosition(0, -H / 2 + 200, 0);
  root.addChild(back);
}

/** 宠物页占位。 */
export function buildPetPlaceholder(ctx: PageCtx) {
  buildComingSoon(ctx, '宠物', '收留、训练与羁绊技将在 M2 开放');
}

/** 蓝图页占位。 */
export function buildBlueprintPlaceholder(ctx: PageCtx) {
  buildComingSoon(ctx, '蓝图', '个人技能工坊将在 M3 开放');
}
