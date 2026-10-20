/**
 * Battle —— 战斗页：多波次、技能、摇杆、飘字/闪白、8 方向精灵、星级与结算。
 */
import { _decorator, Component, EventTouch, Label, Node, UIOpacity, Vec3, tween } from 'cc';
import { C, S, size, rect, txt, circle, btn, bar, setBar, anchor } from '../framework/UI';
import { createBattleWaves, step, Actor, BattleState, SkillRuntime } from '../framework/battle/BattleCore';
import { enemyById, getConfig, heroById, stageCfgById } from '../framework/Config';
import { applyStageWin } from '../framework/Progress';
import { DirectionSprite } from '../framework/DirectionSprite';
import { saveData, flushSave } from '../framework/GameSave';
import { heroBattleStats } from '../framework/Stats';
import { State } from '../framework/State';
import { applyTrialFail, resolveTrial } from '../framework/trial/Trial';
import { buildSettlePopup } from './Settle';
import type { PageCtx } from '../framework/Types';

const { ccclass } = _decorator;
const H = S.h - S.top - S.tab;

interface EnemySlot {
  node: Node;
  bar: Node;
}

@ccclass('BattleView')
export class BattleView extends Component {
  state!: BattleState;
  input = { moveX: 0, moveY: 0, attack: false, skill: -1 };
  playerNode!: Node;
  enemyLayer!: Node;
  enemyBarsLayer!: Node;
  playerBar!: Node;
  skillLabels: Node[] = [];
  waveLabel!: Node;
  playerSprite: DirectionSprite | null = null;
  onEnd!: (win: boolean) => void;

  private slots: EnemySlot[] = [];
  private ended = false;
  private bob = 0;
  private moving = false;
  private attackTimer = 0;
  debugAuto = false;

  triggerAttack(): void {
    this.attackTimer = 0.5;
  }

  update(dt: number) {
    if (!this.state || this.ended) return;

    if (this.playerSprite) {
      this.playerSprite.setMove(this.input.moveX, this.input.moveY);
      this.moving = Math.hypot(this.input.moveX, this.input.moveY) > 0.01;
      if (this.attackTimer > 0) this.attackTimer -= dt;
      const state = this.attackTimer > 0 ? 'attack' : (this.moving ? 'walk' : 'idle');
      const fps = state === 'attack' ? 14 : state === 'walk' ? 10 : 6;
      this.playerSprite.setState(state, fps);
    }
    if (this.debugAuto) this.input.attack = true;
    this.bob += dt * (this.moving ? 10 : 0);
    const bobY = this.moving ? Math.sin(this.bob) * 2.5 : 0;

    const skill = this.input.skill >= 0 ? this.input.skill : undefined;
    const input = { moveX: this.input.moveX, moveY: this.input.moveY, attack: this.input.attack, skill };
    this.input.attack = false;
    this.input.skill = -1;

    const prevPlayerHp = this.state.player.hp;
    const prevIds = this.state.enemies.map((e) => e.id);
    const prevHp = this.state.enemies.map((e) => e.hp);

    this.state = step(this.state, Math.min(dt, 0.05), input);

    const p = this.state.player;
    this.playerNode.setPosition(p.x - S.w / 2, p.y - H / 2 + bobY, 0);
    setBar(this.playerBar, 300, 18, p.hp / p.maxHp, C.green);

    this.syncEnemies();

    // 伤害飘字 + 敌人受击闪白
    this.state.enemies.forEach((e, i) => {
      if (prevIds[i] === e.id && prevHp[i] !== undefined && e.hp < prevHp[i]) {
        const dmg = prevHp[i] - e.hp;
        this.floatDamage(e.x - S.w / 2, e.y - H / 2 + 46, dmg, '#ffd27a');
        const slot = this.slots[i];
        if (slot && e.hp > 0) this.flash(slot.node);
      }
    });
    if (this.state.player.hp < prevPlayerHp) {
      this.floatDamage(p.x - S.w / 2, p.y - H / 2 + 52, prevPlayerHp - p.hp, '#ff6a5a');
    }

    this.state.skills.forEach((sk, i) => {
      const lb = this.skillLabels[i]?.getComponent(Label);
      if (lb) lb.string = sk.cdLeft > 0 ? sk.cdLeft.toFixed(1) : sk.name;
    });

    const wl = this.waveLabel?.getComponent(Label);
    if (wl) wl.string = '第 ' + (this.state.waveIndex + 1) + '/' + this.state.waveTotal + ' 波';

    if (this.state.result !== 'running' && !this.ended) {
      this.ended = true;
      this.onEnd(this.state.result === 'win');
    }
  }

  private floatDamage(x: number, y: number, amount: number, color: string) {
    const n = txt(String(Math.round(amount)), 30, color, true);
    n.setPosition(x, y, 0);
    this.node.addChild(n);
    const op = n.addComponent(UIOpacity);
    tween(n)
      .by(0.6, { position: new Vec3(0, 64, 0) })
      .call(() => n.destroy())
      .start();
    tween(op).to(0.6, { opacity: 0 }).start();
  }

  private flash(node: Node) {
    tween(node)
      .to(0.06, { scale: new Vec3(1.25, 1.25, 1) })
      .to(0.14, { scale: new Vec3(1, 1, 1) })
      .start();
  }

  private makeEnemyNode(name: string, color: string, index: number, boss: boolean): EnemySlot {
    const node = circle('enemy', boss ? 44 : 30, color, C.gold, boss ? 3 : 2);
    node.addChild(txt(name[0] ?? '敌', boss ? 34 : 26, '#ffffff', true));
    this.enemyLayer.addChild(node);

    const hpBar = bar(300, 12, 1, C.red);
    hpBar.setPosition(0, H / 2 - 110 - index * 28, 0);
    this.enemyBarsLayer.addChild(hpBar);
    return { node, bar: hpBar };
  }

  private syncEnemies() {
    while (this.slots.length > this.state.enemies.length) {
      const slot = this.slots.pop();
      if (slot) {
        slot.bar.destroy();
        slot.node.destroy();
      }
    }
    while (this.slots.length < this.state.enemies.length) {
      const idx = this.slots.length;
      const e = this.state.enemies[idx];
      const cfg = enemyById(e.id);
      this.slots.push(this.makeEnemyNode(cfg ? cfg.name : e.id, cfg ? cfg.color : C.red, idx, cfg ? cfg.boss : false));
    }
    this.state.enemies.forEach((e, i) => {
      const slot = this.slots[i];
      if (!slot) return;
      slot.node.setPosition(e.x - S.w / 2, e.y - H / 2, 0);
      slot.node.active = e.hp > 0;
      slot.bar.active = e.hp > 0;
      setBar(slot.bar, 300, 12, e.maxHp > 0 ? e.hp / e.maxHp : 0, C.red);
    });
  }
}

/** 构建战斗页。 */
export function buildBattle(ctx: PageCtx) {
  const root = ctx.root;

  const bg = rect('arenabg', S.w, H, '#0a0805', 0, C.line, 0);
  root.addChild(bg);

  const cfgStage = stageCfgById(State.battleStageId);
  const heroCfg = heroById(State.hero.id);
  const stageName = State.trialActive ? '技能试炼' : (cfgStage ? cfgStage.name : '演武场');

  // 调试：?weak=1 敌兵一击必杀；?auto=1 自动普攻，便于验证通关流程
  let qs: URLSearchParams | null = null;
  try {
    qs = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  } catch (e) {
    qs = null;
  }
  const weak = !!qs && qs.get('weak') === '1';
  const autoAtk = !!qs && qs.get('auto') === '1';

  const en = txt(stageName, 26, C.goldHi, true);
  en.setPosition(0, H / 2 - 40, 0);
  root.addChild(en);

  const waveLb = txt('第 1/1 波', 20, C.sub, false);
  waveLb.setPosition(0, H / 2 - 74, 0);
  root.addChild(waveLb);

  const skillCfg = getConfig().skills;
  const skills: SkillRuntime[] = skillCfg.map((s) => ({
    id: s.id, name: s.name, cd: s.cd, mult: s.mult, range: s.range, cdLeft: 0, type: s.type,
  }));

  // 把关卡的 waves 转成 Actor 组
  // 英雄等级影响战斗属性
  const heroHp = heroCfg ? heroCfg.hp : 100;
  const heroAtk = heroCfg ? heroCfg.atk : 10;
  const heroLv = saveData().heroLevels[State.hero.id] ?? 1;
  const stats = heroBattleStats(heroHp, heroAtk, heroLv);
  const pActor: Actor = {
    id: 'player',
    hp: stats.hp,
    maxHp: stats.hp,
    atk: stats.atk,
    speed: heroCfg ? heroCfg.speed : 300,
    x: 375,
    y: 360,
    cd: 0,
  };

  const waves: Actor[][] = [];
  if (cfgStage && cfgStage.waves.length > 0) {
    cfgStage.waves.forEach((wave, wi) => {
      const group: Actor[] = [];
      wave.forEach((spawn) => {
        const ec = enemyById(spawn.enemy);
        if (!ec) return;
        for (let k = 0; k < spawn.count; k++) {
          group.push({
            id: ec.id,
            hp: weak ? 1 : ec.hp,
            maxHp: weak ? 1 : ec.hp,
            atk: weak ? 0 : ec.atk,
            speed: ec.speed,
            x: 140 + ((wi * 2 + k) % 4) * 150,
            y: 620 + (k % 2) * 120,
            cd: 0,
            range: ec.range,
            attackCd: ec.attackCd,
            boss: ec.boss,
            specialCd: ec.boss ? 3 : undefined,
          });
        }
      });
      if (group.length > 0) waves.push(group);
    });
  }
  if (waves.length === 0) {
    waves.push([{ id: 'huangjin', hp: 60, maxHp: 60, atk: 5, speed: 120, x: 300, y: 700, cd: 0 }]);
  }

  const playerNode = new Node('player');
  size(playerNode, 150, 150);
  anchor(playerNode, 0.5, 0);
  playerNode.setPosition(pActor.x - S.w / 2, pActor.y - H / 2, 0);
  root.addChild(playerNode);

  const ds = playerNode.addComponent(DirectionSprite);
  ds.setup('char/chibi_guanyu', ['idle', 'walk', 'attack'], 8).then((ok) => {
    if (!ok) {
      const fb = circle('fb', 34, C.blue, C.gold, 2);
      playerNode.addChild(fb);
      fb.addChild(txt(State.hero.name[0], 30, '#ffffff', true));
    }
  });

  const enemyLayer = new Node('enemies');
  size(enemyLayer, S.w, H);
  root.addChild(enemyLayer);

  const enemyBars = new Node('enemybars');
  size(enemyBars, S.w, H);
  root.addChild(enemyBars);

  // 玩家血条
  const pbar = bar(300, 18, 1, C.green);
  pbar.setPosition(-160, -H / 2 + 60, 0);
  root.addChild(pbar);
  const pn = txt(State.hero.name + ' Lv.' + (saveData().heroLevels[State.hero.id] ?? 1), 22, C.text, true, 'left');
  pn.setPosition(-310, -H / 2 + 60, 0);
  anchor(pn, 0, 0.5);
  root.addChild(pn);

  // 摇杆
  const joy = circle('joy', 90, '#00000066', C.gold, 2);
  joy.setPosition(-235, -H / 2 + 230, 0);
  root.addChild(joy);
  const knob = circle('knob', 38, '#c9a15a99', C.goldHi, 2);
  joy.addChild(knob);

  // 3 技能按钮
  const skillNodes: Node[] = [];
  const skillLabels: Node[] = [];
  for (let i = 0; i < 3; i++) {
    const sk = skills[i];
    const c = circle('skill' + i, 44, C.panel2, sk ? C.gold : C.line, 3);
    c.setPosition(30 + i * 110, -H / 2 + 200, 0);
    root.addChild(c);
    const lb = txt(sk ? sk.name : '空', 20, C.goldHi, true);
    c.addChild(lb);
    skillLabels.push(lb);
    skillNodes.push(c);
    const index = i;
    c.on(Node.EventType.TOUCH_START, () => { if (skills[index]) thisInputSkill(index); }, c);
  }

  // 普攻
  const atk = circle('atk', 48, C.gold, '#f2dc9b', 3);
  atk.setPosition(300, -H / 2 + 120, 0);
  root.addChild(atk);
  atk.addChild(txt('普攻', 24, '#241a09', true));

  // 退出：试炼中途退出视为放弃本次试炼，避免下一次普通战斗误入试炼分支
  const back = btn('退出', 110, 44, () => {
    if (State.trialActive) {
      State.trialActive = false;
      State.trialOffers = [];
    }
    ctx.go('home');
  }, { fs: 20, skin: 'btn_secondary' });
  back.setPosition(-300, H / 2 - 40, 0);
  root.addChild(back);

  const viewNode = new Node('battleview');
  root.addChild(viewNode);
  const view = viewNode.addComponent(BattleView);
  view.state = createBattleWaves(pActor, waves, skills);
  view.playerNode = playerNode;
  view.enemyLayer = enemyLayer;
  view.enemyBarsLayer = enemyBars;
  view.playerBar = pbar;
  view.skillLabels = skillLabels;
  view.waveLabel = waveLb;
  view.playerSprite = ds;
  view.debugAuto = autoAtk;

  // 让技能按钮回调拿到 view（view 在上面才创建）
  function thisInputSkill(index: number) {
    view.input.skill = index;
  }

  view.onEnd = (win: boolean) => {
    // 试炼模式：战斗胜负决定流程；胜利后三选一，失败则蚀化并回主城。
    // resolveTrial 在此只用于生成 offer / 兑现稀有与保底品质（战斗胜利本身即“试炼成功”），
    // 因此不消费 outcome.win，也不进入普通关卡的星级/奖励结算。
    if (State.trialActive) {
      view.unscheduleAllCallbacks();
      ctx.close();
      if (win) {
        const outcome = resolveTrial(saveData(), Math.random);
        State.trialOffers = outcome.offers;
        State.trialActive = true;
        flushSave();
        ctx.go('trial-choose');
      } else {
        applyTrialFail(saveData());
        flushSave();
        State.trialActive = false;
        State.trialOffers = [];
        ctx.toast('试炼失败，技能被蚀化');
        ctx.go('home');
      }
      return;
    }

    const ratio = view.state.player.hp / Math.max(1, view.state.player.maxHp);
    const stars = win ? (ratio >= 0.6 ? 3 : ratio >= 0.3 ? 2 : 1) : 0;

    let reward: { coins: number; gems: number; first: boolean; stars: number } | undefined;
    if (win) {
      const stage = cfgStage;
      if (stage) {
        reward = applyStageWin(saveData(), stage, stars);
        flushSave();
      }
    }

    ctx.popup(buildSettlePopup(win, () => ctx.close(), () => {
      ctx.close();
      ctx.go('home');
    }, reward, stars, () => {
      ctx.close();
      ctx.go('battle');
    }));
  };

  // 摇杆输入
  let dragging = false;
  let sx = 0;
  let sy = 0;
  joy.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
    dragging = true;
    const ui = e.getUILocation();
    sx = ui.x;
    sy = ui.y;
  });
  joy.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
    if (!dragging) return;
    const ui = e.getUILocation();
    let dx = ui.x - sx;
    let dy = ui.y - sy;
    const len = Math.hypot(dx, dy);
    const max = 60;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    knob.setPosition(dx, dy, 0);
    view.input.moveX = dx / max;
    view.input.moveY = dy / max;
  });
  const stop = (_e: EventTouch) => {
    dragging = false;
    knob.setPosition(0, 0, 0);
    view.input.moveX = 0;
    view.input.moveY = 0;
  };
  joy.on(Node.EventType.TOUCH_END, stop);
  joy.on(Node.EventType.TOUCH_CANCEL, stop);

  atk.on(Node.EventType.TOUCH_START, () => {
    view.input.attack = true;
    view.triggerAttack();
  }, view);
}


