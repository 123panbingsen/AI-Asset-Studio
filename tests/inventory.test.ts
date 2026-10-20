import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buy, claimQuest, consumeItem, itemCount, upgradeHero } from '../assets/scripts/framework/Inventory';
import type { SaveData } from '../assets/scripts/framework/Save';

function newSave(): SaveData {
  return {
    v: 1, coins: 1000, gems: 50, tickets: 0, shards: 0,
    heroLevels: {} as Record<string, number>,
    cleared: [] as string[],
    items: {} as Record<string, number>,
    claimed: [] as string[],
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

test('buy deducts coins and adds item', () => {
  const save = newSave();
  const r = buy(save, { id: 'troop', price: 200, currency: 'coins' });
  assert.equal(r.ok, true);
  assert.equal(save.coins, 800);
  assert.equal(itemCount(save, 'troop'), 1);
});

test('buy with gems uses gems wallet', () => {
  const save = newSave();
  const r = buy(save, { id: 'stamina', price: 20, currency: 'gems' });
  assert.equal(r.ok, true);
  assert.equal(save.gems, 30);
  assert.equal(save.coins, 1000);
});

test('buy rejects when insufficient and changes nothing', () => {
  const save = newSave();
  const r = buy(save, { id: 'axe', price: 5000, currency: 'coins' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'insufficient');
  assert.equal(save.coins, 1000);
  assert.equal(itemCount(save, 'axe'), 0);
});

test('upgrade hero spends coins and raises level', () => {
  const save = newSave();
  const r = upgradeHero(save, 'guanyu');
  assert.equal(r.ok, true);
  assert.equal(r.level, 1);
  assert.equal(r.nextLevel, 2);
  assert.equal(r.cost, 100);
  assert.equal(save.coins, 900);
  assert.equal(save.heroLevels.guanyu, 2);
});

test('upgrade rejects at max level', () => {
  const save = newSave();
  save.heroLevels.guanyu = 60;
  const r = upgradeHero(save, 'guanyu');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'max');
  assert.equal(save.coins, 1000);
});

test('upgrade rejects when coins insufficient', () => {
  const save = newSave();
  save.coins = 10;
  const r = upgradeHero(save, 'guanyu');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'insufficient');
  assert.equal(save.heroLevels.guanyu, undefined);
});

test('claim quest grants reward once', () => {
  const save = newSave();
  const r = claimQuest(save, { id: 'q1', coins: 300, gems: 5 });
  assert.equal(r.ok, true);
  assert.equal(r.coins, 300);
  assert.equal(r.gems, 5);
  assert.equal(save.coins, 1300);
  assert.equal(save.gems, 55);
  assert.deepEqual(save.claimed, ['q1']);
});

test('consume item decrements until empty', () => {
  const save = newSave();
  save.items.troop = 2;
  assert.equal(consumeItem(save, 'troop'), true);
  assert.equal(itemCount(save, 'troop'), 1);
  assert.equal(consumeItem(save, 'troop'), true);
  assert.equal(itemCount(save, 'troop'), 0);
  assert.equal(consumeItem(save, 'troop'), false);
});

test('claim quest is idempotent', () => {
  const save = newSave();
  claimQuest(save, { id: 'q1', coins: 300 });
  const r = claimQuest(save, { id: 'q1', coins: 300 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'claimed');
  assert.equal(save.coins, 1300);
  assert.equal(save.claimed.filter((id) => id === 'q1').length, 1);
});
