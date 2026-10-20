/**
 * App —— 游戏根组件：构建顶栏/底栏、页面注册与切换、钱包刷新、调试入口；负责皮肤与配置加载。
 */
import { _decorator, Component, Node, Label, UITransform } from 'cc';
import { C, S, size, anchor, rect, txt, btn, img, img9, circle, bar, clear, hex, applySkin } from './UI';
import { Skin } from './Skin';
import { saveData, ensureSeed, flushSave } from './GameSave';
import { loadGameConfig } from './ConfigLoad';
import { getGameplayConfig } from './Config';
import { State } from './State';
import { DATA } from './GameData';
import type { PageCtx } from './Types';
import { buildLobby } from '../pages/Lobby';
import { buildHeroList } from '../pages/HeroList';
import { buildHeroDetail } from '../pages/HeroDetail';
import { buildBag } from '../pages/Bag';
import { buildShop } from '../pages/Shop';
import { buildQuest } from '../pages/Quest';
import { buildBattle } from '../pages/Battle';
import { buildStageSelect } from '../pages/StageSelect';
import { buildKit } from '../pages/Kit';
import { buildSkinProof } from '../pages/SkinProof';
import { buildPuppetProof } from '../pages/PuppetProof';
import { buildPortraitProof } from '../pages/PortraitProof';
import { buildSettingsPopup } from '../pages/Settings';
import { buildOnboarding } from '../pages/Onboarding';
import { buildHome } from '../pages/Home';
import { buildTrialChoose } from '../pages/TrialChoose';
import { buildSkills } from '../pages/Skills';
import { buildPetPlaceholder, buildBlueprintPlaceholder } from '../pages/Placeholder';

const { ccclass } = _decorator;

@ccclass('App')
export class App extends Component {
  static inst: App | null = null;

  private topNode: Node | null = null;
  private pageNode: Node | null = null;
  private tabNode: Node | null = null;
  private popupLayer: Node | null = null;
  private toastNode: Node | null = null;
  private tabItems: { id: string; lb: Node; ind: Node }[] = [];
  private curLabels: Node[] = [];
  private contentH = S.h - S.top - S.tab;

  private pages: { [k: string]: (c: PageCtx) => void } = {
    lobby: buildLobby,
    heroes: buildHeroList,
    heroDetail: buildHeroDetail,
    bag: buildBag,
    shop: buildShop,
    quest: buildQuest,
    battle: buildBattle,
    'stage-select': buildStageSelect,
    kit: buildKit,
    skinproof: buildSkinProof,
    onboarding: buildOnboarding,
    home: buildHome,
    'trial-choose': buildTrialChoose,
    skills: buildSkills,
    pet: buildPetPlaceholder,
    blueprint: buildBlueprintPlaceholder,
    puppet: buildPuppetProof,
    portrait: buildPortraitProof,
  };

/** 组件启动：加载皮肤与配置、初始化 UI、进入调试页面。 */
  onLoad() {
    App.inst = this;
    size(this.node, S.w, S.h);
    Promise.all([Skin.load('sanguo'), loadGameConfig()]).then(() => {
      this.build();
      ensureSeed();
      this.refreshWallet();
      this.go(this.debugStartPage());
    });
  }

  /** 调试入口：?page=stage-select / battle / kit，可带 chapter=1|2、stage=2-3 */
  private debugStartPage(): string {
    try {
      if (typeof window !== 'undefined' && window.location && window.location.search) {
        const params = new URLSearchParams(window.location.search);
        const page = params.get('page');
        const chapter = Number(params.get('chapter'));
        if (chapter === 1 || chapter === 2) State.stageChapter = chapter;
        const stage = params.get('stage');
        if (stage) State.battleStageId = stage;
        // 演示/截图种子：?demo=offline 注入 2 小时离线；?demo=corroded 注入蚀化技能
        const demo = params.get('demo');
        if (demo === 'offline') {
          const s = saveData();
          s.lastSeenAt = Date.now() - 2 * 3600 * 1000;
          s.idleMode = 'adventure';
          s.shards = 0;
          flushSave();
        } else if (demo === 'corroded') {
          const s = saveData();
          s.shards = 0;
          s.skills = [
            { id: 'demo1', defId: 'qinglong', quality: 'epic', level: 1, corroded: true },
            { id: 'demo2', defId: 'tuodao', quality: 'rare', level: 1, corroded: false },
          ];
          flushSave();
        }
        if (page === 'trial-choose') {
          State.trialActive = true;
          if (State.trialOffers.length === 0) {
            State.trialOffers = getGameplayConfig().skillPool.slice(0, 3).map((s) => ({ defId: s.defId, quality: s.quality }));
          }
        }
        if (page && this.pages[page]) return page;
      }
    } catch (e) { /* ignore */ }
    return saveData().permanentSkill ? 'home' : 'onboarding';
  }

/** 构建根 UI：背景、顶栏、内容区、底栏。 */
  private build() {
    const root = new Node('root');
    size(root, S.w, S.h);
    this.node.addChild(root);

    const bg = new Node('bg');
    size(bg, S.w, S.h);
    root.addChild(bg);
    img('ui/bg', S.w, S.h).then((n) => bg.addChild(n));

    const vig = new Node('vig');
    size(vig, S.w, S.h);
    root.addChild(vig);
    img9('ui/backdrop/vignette@2x', S.w, S.h).then((n) => vig.addChild(n));

    const top = new Node('top');
    size(top, S.w, S.top);
    top.setPosition(0, S.h / 2 - S.top / 2, 0);
    root.addChild(top);
    const topbg = rect('topbg', S.w, S.top, '#0b0805', 0, '#3a2c15', 1);
    top.addChild(topbg);
    applySkin(topbg, 'panel_dark', S.w, S.top);
    this.topNode = top;
    this.buildTop(top);

    const content = new Node('content');
    size(content, S.w, this.contentH);
    content.setPosition(0, (S.tab - S.top) / 2, 0);
    root.addChild(content);
    this.pageNode = content;

    const tab = new Node('tab');
    size(tab, S.w, S.tab);
    tab.setPosition(0, -S.h / 2 + S.tab / 2, 0);
    root.addChild(tab);
    const tabbg = rect('tabbg', S.w, S.tab, '#0b0805', 0, '#3a2c15', 1);
    tab.addChild(tabbg);
    applySkin(tabbg, 'panel_dark', S.w, S.tab);
    this.tabNode = tab;
    this.buildTabs(tab);

    const pop = new Node('popup');
    size(pop, S.w, S.h);
    root.addChild(pop);
    this.popupLayer = pop;

    const toast = new Node('toast');
    size(toast, 600, 60);
    toast.setPosition(0, -S.h / 2 + 240, 0);
    root.addChild(toast);
    this.toastNode = toast;
    this.buildToast(toast);
    toast.active = false; // 初始隐藏，避免空黑条常驻
  }

/** 构建顶栏：玩家信息、货币、设置/组件库按钮。 */
  private buildTop(top: Node) {
    const av = circle('avatar', 34, C.panel3, C.gold, 2);
    av.setPosition(-330, 22, 0);
    top.addChild(av);
    av.addChild(txt('赵', 28, C.goldHi, true));

    const nm = txt(DATA.player.name, 26, C.text, true, 'left');
    nm.setPosition(-284, 30, 0);
    anchor(nm, 0, 0.5);
    top.addChild(nm);

    const lv = txt(`Lv.${DATA.player.lv} · ${DATA.player.title}`, 18, C.sub, false, 'left');
    lv.setPosition(-284, 2, 0);
    anchor(lv, 0, 0.5);
    top.addChild(lv);

    const exp = bar(190, 8, DATA.player.exp, C.gold);
    exp.setPosition(-190, -12, 0);
    top.addChild(exp);

    const st = btn('设置', 88, 40, () => this.openSettings(), { fs: 20 });
    st.setPosition(195, 22, 0);
    top.addChild(st);

    const kit = btn('组件库', 104, 40, () => this.go('kit'), { fs: 20 });
    kit.setPosition(305, 22, 0);
    top.addChild(kit);

    DATA.currencies.forEach((c, i) => {
      const pill = rect('cur', 120, 32, '#160f08', 16, C.line, 1);
      pill.setPosition(-150 + 62 + i * 126, -40, 0);
      top.addChild(pill);
      const iconKeys = ['icon_coin', 'icon_gem', 'icon_ticket'];
      const iconKey = iconKeys[i] || 'icon_coin';
      Skin.sprite(iconKey, 22, 22).then((sp) => {
        if (sp) {
          sp.setPosition(-46, 0, 0);
          pill.addChild(sp);
        } else {
          const dot = circle('dot', 8, c.color);
          dot.setPosition(-46, 0, 0);
          pill.addChild(dot);
        }
      });
      const v = txt(c.value, 18, C.text, true, 'right');
      v.setPosition(52, 0, 0);
      anchor(v, 1, 0.5);
      pill.addChild(v);
      this.curLabels.push(v);
    });
  }

/** 数字千分位格式化。 */
  private fmt(n: number): string {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** 购买/升级/领取/结算后刷新顶栏钱包 */
  refreshWallet(): void {
    const d = saveData();
    const values = [d.coins, d.gems, d.tickets];
    this.curLabels.forEach((node, i) => {
      const lb = node.getComponent(Label);
      if (lb) lb.string = this.fmt(values[i] ?? 0);
    });
  }

/** 构建底部页签。 */
  private buildTabs(tab: Node) {
    const defs: [string, string, string][] = [
      ['home', '主城', '城'],
      ['skills', '技能', '技'],
      ['pet', '宠物', '宠'],
      ['blueprint', '蓝图', '图'],
      ['shop', '商城', '商'],
    ];
    defs.forEach((d, i) => {
      const n = new Node('tab_' + d[0]);
      size(n, 150, S.tab);
      n.setPosition(-300 + i * 150, 0, 0);
      tab.addChild(n);
      n.on(Node.EventType.TOUCH_END, () => this.go(d[0]), n);

      const icon = circle('icon', 22, C.panel, C.gold, 2);
      icon.setPosition(0, 16, 0);
      n.addChild(icon);
      icon.addChild(txt(d[2], 22, C.goldHi, true));

      const lb = txt(d[1], 22, C.sub, false);
      lb.setPosition(0, -24, 0);
      n.addChild(lb);

      const ind = rect('ind', 40, 4, C.gold, 2);
      ind.setPosition(0, -46, 0);
      n.addChild(ind);

      this.tabItems.push({ id: d[0], lb, ind });
    });
  }

/** 构建轻提示节点（懒创建）。 */
  private buildToast(t: Node) {
    t.addChild(rect('toastbg', 520, 60, '#000000b8', 12, C.line, 1));
    const lb = txt('', 24, C.text);
    lb.name = 'toastlb';
    t.addChild(lb);
  }

/** 切换页面：清空内容区并构建目标页面。 */
  go(name: string, _data?: any) {
    const fn = this.pages[name];
    if (!fn || !this.pageNode) return;
    clear(this.pageNode);
    const page = new Node('page_' + name);
    size(page, S.w, this.contentH);
    this.pageNode.addChild(page);

    const ctx: PageCtx = {
      root: page,
      go: (p, d) => this.go(p, d),
      popup: (n) => this.showPopup(n),
      close: () => this.closePopup(),
      toast: (m) => this.toast(m),
      refresh: () => this.refreshWallet(),
    };
    fn(ctx);

    // 试炼/开局隐藏底部 Tab；离开试炼相关页面时清理试炼态
    const hideTab = name === 'battle' || name === 'onboarding' || name === 'trial-choose';
    if (this.tabNode) this.tabNode.active = !hideTab;
    if (name !== 'battle' && name !== 'trial-choose') {
      State.trialActive = false;
      State.trialOffers = [];
    }
    // heroDetail 属于「武将」Tab，避免进入详情后底部无高亮
    const tabFor = name === 'heroDetail' ? 'heroes' : name;
    this.tabItems.forEach((t) => {
      const on = t.id === tabFor;
      t.ind.active = on;
      const lc = t.lb.getComponent(Label);
      if (lc) lc.color = hex(on ? C.goldHi : C.sub);
    });
  }

/** 显示弹窗（带遮罩）。 */
  showPopup(card: Node) {
    if (!this.popupLayer) return;
    clear(this.popupLayer);
    const scrim = rect('scrim', S.w, S.h, '#00000099', 0);
    scrim.on(Node.EventType.TOUCH_END, () => this.closePopup(), this);
    this.popupLayer.addChild(scrim);
    this.popupLayer.addChild(card);
  }

/** 关闭当前弹窗。 */
  closePopup() {
    if (this.popupLayer) clear(this.popupLayer);
  }

/** 显示轻提示文字。 */
  toast(msg: string) {
    if (!this.toastNode) return;
    this.toastNode.active = true;
    const lb = this.toastNode.getChildByName('toastlb');
    if (lb) {
      const comp = lb.getComponent(Label);
      if (comp) comp.string = msg;
    }
    this.scheduleOnce(() => {
      if (this.toastNode) this.toastNode.active = false;
    }, 1.6);
  }

/** 打开设置弹窗。 */
  openSettings() {
    this.showPopup(buildSettingsPopup(() => this.closePopup()));
  }
}






