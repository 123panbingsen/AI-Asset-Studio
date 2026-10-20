/**
 * Stages —— 离线兜底关卡定义（配置加载失败时使用）。
 */
import type { StageDef } from './Progress';

export const STAGES: StageDef[] = [
  { id: '1-1', chapter: 1, index: 1, name: '黄巾之乱', coins: 300, firstCoins: 600, gems: 10 },
  { id: '1-2', chapter: 1, index: 2, name: '虎牢关', coins: 400, firstCoins: 800, gems: 15 },
  { id: '1-3', chapter: 1, index: 3, name: '汜水关', coins: 500, firstCoins: 1000, gems: 20 },
];

export function stageById(id: string): StageDef | undefined {
  return STAGES.find((s) => s.id === id);
}
