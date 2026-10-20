/**
 * ConfigLoad —— 从 resources/data 加载 JSON 配置，失败时保留 fallback。
 */
import { JsonAsset, resources } from 'cc';
import { normalizeConfig, normalizeGameplay, setConfig, setGameplayConfig } from './Config';

function loadJson(name: string): Promise<any> {
  return new Promise((resolve) => {
    resources.load('data/' + name, JsonAsset, (err, asset) => {
      resolve(err ? null : asset.json);
    });
  });
}

/** 启动时加载 resources/data/*.json 并写入 Config；失败则使用空配置（页面有兜底） */
export async function loadGameConfig(): Promise<void> {
  const [heroes, skills, enemies, stages, gameplay] = await Promise.all([
    loadJson('heroes'),
    loadJson('skills'),
    loadJson('enemies'),
    loadJson('stages'),
    loadJson('gameplay'),
  ]);
  setConfig(normalizeConfig({
    heroes: heroes ?? [],
    skills: skills ?? [],
    enemies: enemies ?? [],
    stages: stages ?? [],
  }));
  setGameplayConfig(normalizeGameplay(gameplay ?? {}));
}
