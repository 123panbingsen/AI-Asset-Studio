/**
 * Puppet2D —— 轻量 2D 骨骼动画：分层部件 + 关节层级 + 程序化关键帧。
 *
 * 结构对齐 DragonBones 的 bone/slot/animation 概念：
 *  root → hips → torso → head / armL / armR → weapon
 *                    └ legs
 * 资源：char/puppet_guanyu/head|torso|arm|hand|leg|sword|cape.png
 */
import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, resources } from 'cc';

const { ccclass } = _decorator;

export type PuppetState = 'idle' | 'walk' | 'attack';

interface PartSpec {
  name: string;
  w: number;
  h: number;
  ax: number; // anchor x
  ay: number; // anchor y
}

const PARTS: PartSpec[] = [
  { name: 'cape', w: 120, h: 150, ax: 0.5, ay: 1 },
  { name: 'head', w: 100, h: 104, ax: 0.5, ay: 0 },
  { name: 'torso', w: 100, h: 120, ax: 0.5, ay: 0 },
  { name: 'armL', w: 32, h: 78, ax: 0.5, ay: 1 },
  { name: 'armR', w: 32, h: 78, ax: 0.5, ay: 1 },
  { name: 'legL', w: 40, h: 90, ax: 0.5, ay: 1 },
  { name: 'legR', w: 40, h: 90, ax: 0.5, ay: 1 },
  { name: 'sword', w: 30, h: 170, ax: 0.5, ay: 0 },
];

const SOURCES: Record<string, string> = {
  cape: 'cape', head: 'head', torso: 'torso',
  armL: 'arm', armR: 'arm', legL: 'leg', legR: 'leg', sword: 'sword',
};

/** 关节层级：[子, 父] */
const TREE: [string, string][] = [
  ['torso', 'hips'],
  ['head', 'torso'],
  ['cape', 'torso'],
  ['armL', 'torso'],
  ['armR', 'torso'],
  ['legL', 'hips'],
  ['legR', 'hips'],
  ['sword', 'armR'],
];

/** 初始关节位置 */
const REST: Record<string, [number, number]> = {
  hips: [0, 0],
  torso: [0, 8],
  head: [0, 112],
  cape: [0, 108],
  armL: [-52, 100],
  armR: [52, 100],
  legL: [-20, 0],
  legR: [20, 0],
  sword: [0, -74],
};

function easeOut(p: number): number {
  const x = Math.max(0, Math.min(1, p));
  return 1 - Math.pow(1 - x, 3);
}

@ccclass('Puppet2D')
export class Puppet2D extends Component {
  private nodes: Record<string, Node> = {};
  private sprites: Record<string, Sprite> = {};
  private state: PuppetState = 'idle';
  private t = 0;
  private dir = 1;
  private loaded = false;
  private paused = false;

  /** 异步加载部件并搭骨骼层级；失败返回 false。 */
  async setup(basePath = 'char/puppet_guanyu'): Promise<boolean> {
    const frames: Record<string, SpriteFrame> = {};
    await Promise.all(PARTS.map((p) => new Promise<void>((resolve) => {
      const src = SOURCES[p.name];
      resources.load(basePath + '/' + src + '/spriteFrame', SpriteFrame, (err, sf) => {
        if (!err && sf) frames[p.name] = sf;
        resolve();
      });
    })));
    if (Object.keys(frames).length < PARTS.length) return false;

    const root = new Node('puppet-root');
    this.node.addChild(root);

    const hips = new Node('hips');
    hips.setPosition(0, 0, 0);
    root.addChild(hips);
    this.nodes.hips = hips;

    for (const [child, parent] of TREE) {
      const spec = PARTS.find((p) => p.name === child) as PartSpec;
      const n = new Node(child);
      const t = n.addComponent(UITransform);
      t.setContentSize(spec.w, spec.h);
      t.setAnchorPoint(spec.ax, spec.ay);
      const sp = n.addComponent(Sprite);
      sp.spriteFrame = frames[child];
      sp.sizeMode = Sprite.SizeMode.CUSTOM;
      const [x, y] = REST[child];
      n.setPosition(x, y, 0);
      this.nodes[parent].addChild(n);
      this.nodes[child] = n;
      this.sprites[child] = sp;
      // 披风在躯干后面
      if (child === 'cape') n.setSiblingIndex(0);
    }

    this.loaded = true;
    return true;
  }

  play(state: PuppetState): void {
    this.state = state;
    this.t = 0;
    this.paused = false;
  }

  /** 跳到指定时间（用于截图/调试）。 */
  seek(t: number): void {
    this.t = t;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  setDirection(dir: number): void {
    this.dir = dir >= 0 ? 1 : -1;
  }

  getState(): PuppetState {
    return this.state;
  }

  update(dt: number): void {
    if (!this.loaded) return;
    if (!this.paused) this.t += dt;
    const n = this.nodes;
    const root = this.node.getChildByName('puppet-root');
    if (!root) return;
    root.setScale(this.dir, 1, 1);

    // 复位
    const setAngle = (name: string, deg: number) => {
      const node = n[name];
      if (node) node.angle = deg;
    };
    const setPos = (name: string, x: number, y: number) => {
      const node = n[name];
      if (node) node.setPosition(x, y, 0);
    };

    let hipY = 0;
    let torsoDeg = 0;
    let headDeg = 0;
    let armLDeg = 0;
    let armRDeg = 0;
    let legLDeg = 0;
    let legRDeg = 0;
    let capeDeg = 0;
    let lunge = 0;

    if (this.state === 'walk') {
      const phase = (this.t / 0.8) * Math.PI * 2;
      const s = Math.sin(phase);
      hipY = Math.abs(Math.sin(phase * 2)) * 4;
      legLDeg = s * 32;
      legRDeg = -s * 32;
      armLDeg = -s * 22;
      armRDeg = s * 22;
      torsoDeg = s * 3;
      headDeg = -s * 2;
      capeDeg = -s * 8;
    } else if (this.state === 'attack') {
      const p = Math.min(1, this.t / 0.55);
      // 前摇 → 挥砍
      const swing = p < 0.35 ? -140 * easeOut(p / 0.35) : -140 + 190 * easeOut((p - 0.35) / 0.65);
      armRDeg = swing;
      torsoDeg = p < 0.35 ? -8 : -8 + 18 * easeOut((p - 0.35) / 0.65);
      lunge = Math.sin(Math.min(1, p) * Math.PI) * 10;
      hipY = -Math.sin(Math.min(1, p) * Math.PI) * 3;
      capeDeg = 10 + Math.sin(p * Math.PI) * 10;
      if (p >= 1) this.play('idle');
    } else {
      const s = Math.sin(this.t * 2);
      hipY = s * 2;
      armLDeg = -6 + s * 3;
      armRDeg = 6 - s * 3;
      torsoDeg = s * 1.5;
      capeDeg = s * 4;
    }

    setPos('hips', lunge, hipY);
    setAngle('torso', torsoDeg);
    setAngle('head', headDeg);
    setAngle('armL', armLDeg);
    setAngle('armR', armRDeg);
    setAngle('legL', legLDeg);
    setAngle('legR', legRDeg);
    setAngle('cape', capeDeg);
    setAngle('sword', 0);
  }
}
