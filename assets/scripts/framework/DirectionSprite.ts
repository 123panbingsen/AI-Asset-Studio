/**
 * DirectionSprite —— 8 方向角色精灵组件：按移动向量选方向，按状态播放帧（跳过缺失帧）。
 */
import { _decorator, Component, Sprite, SpriteFrame, resources } from 'cc';

const { ccclass } = _decorator;

export type Dir8 = 'E' | 'NE' | 'N' | 'NW' | 'W' | 'SW' | 'S' | 'SE';

const DIRS: Dir8[] = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];

/**
 * 八方向角色精灵：按移动向量选方向，按状态播放帧。
 * 资源路径约定：resources/char/<id>/<state>/<dir>/<frame>.png
 */
@ccclass('DirectionSprite')
export class DirectionSprite extends Component {
  private sprite: Sprite | null = null;
  private frames: { [key: string]: SpriteFrame[] } = {};
  private dir: Dir8 = 'S';
  private state = 'idle';
  private frameTime = 0;
  private frameIndex = 0;
  private fps = 8;
  private loaded = false;

/** 异步加载 8 方向 x 状态的帧资源，路径：char/<id>/<state>/<dir>/<frame>。 */
  async setup(basePath: string, states: string[], frameCount = 8): Promise<boolean> {
    this.sprite = this.getComponent(Sprite) || this.addComponent(Sprite);
    if (this.sprite) this.sprite.sizeMode = Sprite.SizeMode.CUSTOM;

    const jobs: Promise<void>[] = [];
    for (const st of states) {
      for (const d of DIRS) {
        const key = st + '/' + d;
        this.frames[key] = [];
        for (let i = 0; i < frameCount; i++) {
          const idx = i;
          const frameName = i < 10 ? '0' + i : String(i);
          const path = basePath + '/' + st + '/' + d + '/' + frameName + '/spriteFrame';
          jobs.push(new Promise<void>((resolve) => {
            resources.load(path, SpriteFrame, (err, sf) => {
              if (!err && sf && this.frames[key]) this.frames[key][idx] = sf;
              resolve();
            });
          }));
        }
      }
    }
    await Promise.all(jobs);
    this.loaded = true;
    this.apply();
    return true;
  }

/** 切换动作状态并设置播放帧率。 */
  setState(state: string, fps = 8): void {
    if (this.state !== state) {
      this.state = state;
      this.frameIndex = 0;
      this.frameTime = 0;
    }
    this.fps = Math.max(1, fps);
  }

  /** 传入移动向量（屏幕坐标，y 向上）；长度为 0 时保持当前方向 */
  setMove(vx: number, vy: number): void {
    if (Math.abs(vx) < 0.001 && Math.abs(vy) < 0.001) return;
    const deg = (Math.atan2(vy, vx) * 180) / Math.PI;
    const idx = Math.round(((deg + 360) % 360) / 45) % 8;
    this.dir = DIRS[idx];
  }

  update(dt: number): void {
    if (!this.loaded) return;
    const list = this.frames[this.state + '/' + this.dir];
    if (!list || list.length === 0) return;
    this.frameTime += dt;
    const step = 1 / this.fps;
    if (this.frameTime >= step) {
      this.frameTime -= step;
      this.frameIndex = (this.frameIndex + 1) % list.length;
      this.apply();
    }
  }

  private apply(): void {
    if (!this.sprite) return;
    const list = this.frames[this.state + '/' + this.dir];
    if (!list) return;
    for (let k = 0; k < list.length; k++) {
      const sf = list[(this.frameIndex + k) % list.length];
      if (sf) {
        this.sprite.spriteFrame = sf;
        return;
      }
    }
  }
}
