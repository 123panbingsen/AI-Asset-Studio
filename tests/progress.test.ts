import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyStageWin, stageStates } from '../assets/scripts/framework/Progress';
import { STAGES, stageById } from '../assets/scripts/framework/Stages';
import type { SaveData } from '../assets/scripts/framework/Save';

function newSave(): SaveData {
  return {
    v: 1, coins: 0, gems: 0, tickets: 0, shards: 0,
    heroLevels: {}, cleared: [] as string[],
    items: {} as Record<string, number>, claimed: [] as string[],
    stars: {} as Record<string, number>,
    updatedAt: 0,
    attributes: { str: 0, int: 0, spd: 0, vit: 0, hp: 0, res: 0 },
    permanentSkill: null,
    skills: [],
    protectedSkills: [],
    idleMode: 'safe',
    lastSeenAt: 0,
    trialStats: { attempts: 0, fails: 0, pity: 0 },
    storyAct: 1,
  };
}

test('first stage unlocked, others locked initially', () => {
  const states = stageStates(STAGES, []);
  assert.equal(states[0].unlocked, true);
  assert.equal(states[1].unlocked, false);
  assert.equal(states[2].unlocked, false);
});

test('clearing a stage unlocks the next one', () => {
  const states = stageStates(STAGES, ['1-1']);
  assert.equal(states[1].unlocked, true);
  assert.equal(states[2].unlocked, false);
  assert.equal(states[0].cleared, true);
});

test('first clear grants first-clear bonus and records progress', () => {
  const save = newSave();
  const stage = stageById('1-1')!;
  const reward = applyStageWin(save, stage);
  assert.equal(reward.first, true);
  assert.equal(reward.coins, stage.firstCoins);
  assert.equal(save.coins, stage.firstCoins);
  assert.deepEqual(save.cleared, ['1-1']);
});

test('repeat clear grants base reward only once per run', () => {
  const save = newSave();
  const stage = stageById('1-1')!;
  applyStageWin(save, stage);
  const coinsAfterFirst = save.coins;
  const reward = applyStageWin(save, stage);
  assert.equal(reward.first, false);
  assert.equal(reward.coins, stage.coins);
  assert.equal(save.coins, coinsAfterFirst + stage.coins);
  assert.equal(save.cleared.filter((id) => id === '1-1').length, 1);
});

test('stage stars keep the best result', () => {
  const save = newSave();
  const stage = stageById('1-1')!;
  applyStageWin(save, stage, 3);
  assert.equal(save.stars['1-1'], 3);
  applyStageWin(save, stage, 1);
  assert.equal(save.stars['1-1'], 3);
});

test('locked stage can still be cleared into progress', () => {
  const save = newSave();
  const stage = stageById('1-3')!;
  applyStageWin(save, stage);
  assert.deepEqual(save.cleared, ['1-3']);
});
