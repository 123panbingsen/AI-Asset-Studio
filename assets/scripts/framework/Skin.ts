/**
 * Skin —— 皮肤系统：读取 manifest，异步加载 SpriteFrame，支持 9-slice 与 tint；用子节点避免 Sprite/Graphics 冲突。
 */
import { Node, Sprite, SpriteFrame, Color, UITransform, Graphics, resources, JsonAsset } from 'cc';

function hex(h: string, a = 255): Color {
  const s = h.replace('#', '');
  return new Color(
    parseInt(s.substring(0, 2), 16),
    parseInt(s.substring(2, 4), 16),
    parseInt(s.substring(4, 6), 16),
    a,
  );
}

export interface SkinDef {
  tex: string;
  slice?: number[];
  tint?: string;
  nine?: boolean;
}

interface SkinManifest {
  set: string;
  version: number;
  keys: { [k: string]: SkinDef };
}

class SkinClass {
  private manifest: SkinManifest | null = null;
  private frames: { [tex: string]: SpriteFrame | null } = {};
  active = '';

/** 加载皮肤 manifest（可切换皮肤集）。 */
  async load(set = 'darkgold'): Promise<boolean> {
    if (this.active === set && this.manifest) return true;
    const asset = await new Promise<JsonAsset | null>((resolve) => {
      resources.load('skin/' + set + '/manifest', JsonAsset, (err, a) => resolve(err ? null : a));
    });
    if (!asset) return false;
    this.manifest = asset.json as SkinManifest;
    this.active = set;
    this.frames = {};
    return true;
  }

/** 判断皮肤键是否存在。 */
  has(key: string): boolean {
    return !!(this.manifest && this.manifest.keys[key]);
  }

  /** 切换皮肤（等价于 load） */
  setActive(set: string): Promise<boolean> {
    return this.load(set);
  }

/** 读取皮肤键定义。 */
  def(key: string): SkinDef | null {
    return this.manifest ? (this.manifest.keys[key] || null) : null;
  }

  private frame(tex: string): Promise<SpriteFrame | null> {
    if (tex in this.frames) return Promise.resolve(this.frames[tex]);
    return new Promise((resolve) => {
      resources.load(tex + '/spriteFrame', SpriteFrame, (err, sf) => {
        this.frames[tex] = err ? null : sf;
        resolve(err ? null : sf);
      });
    });
  }

  private applyDef(sp: Sprite, d: SkinDef): void {
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.type = d.nine === false ? Sprite.Type.SIMPLE : Sprite.Type.SLICED;
    if (d.slice && d.nine !== false) {
      const sf = sp.spriteFrame;
      if (sf) {
        sf.insetLeft = d.slice[0];
        sf.insetTop = d.slice[1];
        sf.insetRight = d.slice[2];
        sf.insetBottom = d.slice[3];
      }
    }
    if (d.tint) sp.color = hex(d.tint);
  }

/** 按皮肤键创建独立 Sprite 节点（指定尺寸）。 */
  async sprite(key: string, w: number, h: number): Promise<Node | null> {
    const d = this.def(key);
    if (!d) return null;
    const sf = await this.frame(d.tex);
    if (!sf) return null;
    const n = new Node('skin_' + key);
    const t = n.addComponent(UITransform);
    t.setContentSize(w, h);
    const sp = n.addComponent(Sprite);
    sp.spriteFrame = sf;
    this.applyDef(sp, d);
    return n;
  }

/** 把皮肤贴到节点上：用 __skin__ 子节点承载 Sprite，避免与 Graphics 冲突。 */
  async applyTo(node: Node, key: string, w: number, h: number): Promise<boolean> {
    const d = this.def(key);
    if (!d) return false;
    const sf = await this.frame(d.tex);
    if (!sf) return false;
    const t = node.getComponent(UITransform) || node.addComponent(UITransform);
    t.setContentSize(w, h);

    // Sprite 与 Graphics 互斥且 removeComponent 是延迟销毁，
    // 因此不往原节点加 Sprite，而是用子节点承载皮肤。
    let holder = node.getChildByName('__skin__');
    if (!holder) {
      holder = new Node('__skin__');
      node.addChild(holder);
    }
    holder.setSiblingIndex(0);
    const ht = holder.getComponent(UITransform) || holder.addComponent(UITransform);
    ht.setContentSize(w, h);
    const sp = holder.getComponent(Sprite) || holder.addComponent(Sprite);
    sp.spriteFrame = sf;
    this.applyDef(sp, d);

    const g = node.getComponent(Graphics);
    if (g) g.enabled = false;
    return true;
  }
}

export const Skin = new SkinClass();
