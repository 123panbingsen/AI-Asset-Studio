/**
 * PortraitActor —— 单张 2D 立绘的程序化动效（Live2D-lite）：
 * 待机呼吸、行走起伏、攻击前冲/回位；不切件、不破坏原画。
 */
import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, resources } from 'cc';

const { ccclass } = _decorator;

export type PortraitState = 'idle' | 'walk' | 'attack';

@ccclass('PortraitActor')
export class PortraitActor extends Component {
  private sprite: Sprite | null = null;
  private body: Node | null = null;
  private state: PortraitState = 'idle';
  private t = 0;
  private dir = 1;
  private loaded = false;
  private paused = false;

  /** 加载立绘并按目标高度布局，锚点放在脚部附近。 */
  async setup(path = 'char/guanyu_art/portrait', height = 380): Promise<boolean> {
    const sf = await new Promise<SpriteFrame | null>((resolve) => {
      resources.load(path + '/spriteFrame', SpriteFrame, (err, f) => resolve(err ? null : f));
    });
    if (!sf) return false;

    const n = new Node('portrait');
    const ut = n.addComponent(UITransform);
    const w = (sf.width / sf.height) * height;
    ut.setContentSize(w, height);
    ut.setAnchorPoint(0.5, 0.05);
    const sp = n.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.spriteFrame = sf;
    ut.setContentSize(w, height);
    this.node.addChild(n);
    this.body = n;
    this.sprite = sp;
    this.loaded = true;
    return true;
  }

  play(state: PortraitState): void {
    this.state = state;
    this.t = 0;
    this.paused = false;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  setDirection(dir: number): void {
    this.dir = dir >= 0 ? 1 : -1;
    if (this.body) this.body.setScale(this.dir, 1, 1);
  }

  seek(t: number): void {
    this.t = t;
  }

  update(dt: number): void {
    if (!this.loaded || !this.body) return;
    if (!this.paused) this.t += dt;

    let angle = 0;
    let sx = 1;
    let sy = 1;
    let dx = 0;
    let dy = 0;

    if (this.state === 'idle') {
      const b = Math.sin(this.t * 2);
      sy = 1 + b * 0.009;
      sx = 1 - b * 0.004;
      dy = b * 2;
      angle = b * 0.5;
    } else if (this.state === 'walk') {
      const p = (this.t / 0.6) * Math.PI * 2;
      const s = Math.sin(p);
      dy = Math.abs(Math.sin(p)) * 9;
      dx = s * 4;
      angle = s * 2.4;
      sy = 1 + Math.sin(p * 2) * 0.012;
      sx = 1 - Math.sin(p * 2) * 0.006;
    } else if (this.state === 'attack') {
      const p = Math.min(1, this.t / 0.5);
      const k = Math.sin(p * Math.PI);
      dx = k * 46;
      angle = -k * 6;
      sy = 1 + k * 0.035;
      sx = 1 - k * 0.02;
      if (p >= 1) this.play('idle');
    }

    this.body.angle = angle;
    this.body.setScale(this.dir * sx, sy, 1);
    this.body.setPosition(dx * this.dir, dy, 0);
  }
}


