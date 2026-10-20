/**
 * GameSave —— 存档适配层：localStorage 读写、首次进入种子资源、手动 flush。
 */
import { sys } from 'cc';
import { createSave, SaveStore } from './Save';

const adapter = {
  read(key: string): string | null {
    return sys.localStorage.getItem(key);
  },
  write(key: string, value: string): void {
    sys.localStorage.setItem(key, value);
  },
};

export const GameSave: SaveStore = createSave(adapter);

/** 获取当前存档（懒加载）。 */
export function saveData() {
  return GameSave.get();
}

/** 立即把存档写入存储（购买/通关/升级后调用）。 */
export function flushSave(): void {
  GameSave.flush();
}

/** 首次进入时给一份初始资源，方便试玩购买/升级 */
export function ensureSeed(): void {
  const d = GameSave.get();
  if (d.coins === 0 && d.gems === 0 && d.tickets === 0 && d.shards === 0 && d.cleared.length === 0) {
    GameSave.update((s) => {
      s.coins = 12000;
      s.gems = 800;
      s.tickets = 3210;
      s.shards = 40;
    });
  }
}

