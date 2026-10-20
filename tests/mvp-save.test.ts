import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSave,
  normalizeSave,
  SAVE_KEY,
  StorageLike,
} from '../assets/scripts/framework/Save';

function memStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    read(k: string) { return k in data ? data[k] : null; },
    write(k: string, v: string) { data[k] = v; },
  };
}

/** 旧版 v1 存档：只有既有字段，没有任何 MVP 新字段。 */
const LEGACY = {
  v: 1,
  coins: 5,
  gems: 6,
  tickets: 7,
  heroLevels: { guanyu: 3 },
  cleared: ['1-1'],
  items: { shard: 2 },
  claimed: ['q1'],
  stars: { '1-1': 3 },
  updatedAt: 123,
};

test('old v1 save without new fields gets defaults', () => {
  const save = normalizeSave(LEGACY);
  assert.deepEqual(save.attributes, { str: 0, int: 0, spd: 0, vit: 0, hp: 0, res: 0 });
  assert.equal(save.permanentSkill, null);
  assert.deepEqual(save.skills, []);
  assert.deepEqual(save.protectedSkills, []);
  assert.equal(save.idleMode, 'safe');
  assert.equal(save.lastSeenAt, 0);
  assert.deepEqual(save.trialStats, { attempts: 0, fails: 0, pity: 0 });
  assert.equal(save.storyAct, 1);
});

test('old save loaded through SaveStore keeps old data and fills defaults', () => {
  const st = memStorage();
  st.write(SAVE_KEY, JSON.stringify(LEGACY));
  const d = createSave(st).get();
  assert.equal(d.coins, 5);
  assert.deepEqual(d.cleared, ['1-1']);
  assert.deepEqual(d.attributes, { str: 0, int: 0, spd: 0, vit: 0, hp: 0, res: 0 });
  assert.equal(d.idleMode, 'safe');
  assert.equal(d.storyAct, 1);
});

test('empty storage yields full defaults including mvp fields', () => {
  const d = createSave(memStorage()).get();
  assert.equal(d.v, 1);
  assert.equal(d.coins, 0);
  assert.deepEqual(d.heroLevels, {});
  assert.deepEqual(d.attributes, { str: 0, int: 0, spd: 0, vit: 0, hp: 0, res: 0 });
  assert.equal(d.permanentSkill, null);
  assert.deepEqual(d.skills, []);
  assert.deepEqual(d.protectedSkills, []);
  assert.equal(d.idleMode, 'safe');
  assert.equal(d.lastSeenAt, 0);
  assert.deepEqual(d.trialStats, { attempts: 0, fails: 0, pity: 0 });
  assert.equal(d.storyAct, 1);
});

test('updated mvp fields round-trip through storage unchanged', () => {
  const st = memStorage();
  const a = createSave(st, () => 1000);
  a.update((d) => {
    d.attributes.str = 10;
    d.attributes.res = 4;
    d.permanentSkill = 'eclipsed_blade';
    d.skills.push({ id: 'sk1', defId: 'qinglong', quality: 'epic', level: 2, corroded: false });
    d.skills.push({ id: 'sk2', defId: 'tuodao', quality: 'rare', level: 1, corroded: true });
    d.protectedSkills.push('sk2');
    d.idleMode = 'adventure';
    d.lastSeenAt = 111;
    d.trialStats.attempts = 3;
    d.trialStats.fails = 1;
    d.trialStats.pity = 1;
    d.storyAct = 2;
  });

  const b = createSave(st).get();
  assert.deepEqual(b.attributes, { str: 10, int: 0, spd: 0, vit: 0, hp: 0, res: 4 });
  assert.equal(b.permanentSkill, 'eclipsed_blade');
  assert.deepEqual(b.skills, [
    { id: 'sk1', defId: 'qinglong', quality: 'epic', level: 2, corroded: false },
    { id: 'sk2', defId: 'tuodao', quality: 'rare', level: 1, corroded: true },
  ]);
  assert.deepEqual(b.protectedSkills, ['sk2']);
  assert.equal(b.idleMode, 'adventure');
  assert.equal(b.lastSeenAt, 111);
  assert.deepEqual(b.trialStats, { attempts: 3, fails: 1, pity: 1 });
  assert.equal(b.storyAct, 2);
  assert.equal(b.updatedAt, 1000);
});

test('invalid attributes, permanent skill and idle mode are sanitized', () => {
  const save = normalizeSave({
    v: 1,
    permanentSkill: 42,
    idleMode: 'x',
    attributes: { str: -2, int: 3.9, spd: 'x', vit: 2, nope: 9 },
  });
  assert.deepEqual(save.attributes, { str: 0, int: 3, spd: 0, vit: 2, hp: 0, res: 0 });
  assert.equal(save.permanentSkill, null);
  assert.equal(save.idleMode, 'safe');
});

test('invalid skill entries are dropped, duplicate ids deduped and values cleaned', () => {
  const save = normalizeSave({
    v: 1,
    skills: [
      null,
      'bad',
      { id: '', defId: 'a' },
      { id: 'a' },
      { id: '  ', defId: 'b' },
      { id: 's1', defId: 'q', quality: 'nope', level: -3, corroded: 'true' },
      { id: 's1', defId: 'q2', quality: 'epic', level: 5, corroded: true },
      { id: 's2', defId: 'w', quality: 'legend', level: 2.9, corroded: true },
    ],
    protectedSkills: ['s1', 's1', 7, '', ' s2 '],
  });
  assert.deepEqual(save.skills, [
    { id: 's1', defId: 'q', quality: 'common', level: 1, corroded: false },
    { id: 's2', defId: 'w', quality: 'legend', level: 2, corroded: true },
  ]);
  assert.deepEqual(save.protectedSkills, ['s1', 's2']);
});

test('trial stats, storyAct and lastSeenAt are clamped to non-negative ints', () => {
  const save = normalizeSave({
    v: 1,
    lastSeenAt: -9,
    trialStats: { attempts: -1, fails: 2.7, pity: 'x' },
    storyAct: 0,
  });
  assert.equal(save.lastSeenAt, 0);
  assert.deepEqual(save.trialStats, { attempts: 0, fails: 2, pity: 0 });
  assert.equal(save.storyAct, 1);

  const fractional = normalizeSave({ v: 1, storyAct: 2.9, lastSeenAt: 12.8 });
  assert.equal(fractional.storyAct, 2);
  assert.equal(fractional.lastSeenAt, 12);
});

test('existing saved fields are preserved across load and flush', () => {
  const st = memStorage();
  st.write(SAVE_KEY, JSON.stringify(LEGACY));
  createSave(st).flush();
  const d = createSave(st).get();
  assert.equal(d.coins, 5);
  assert.equal(d.gems, 6);
  assert.equal(d.tickets, 7);
  assert.deepEqual(d.heroLevels, { guanyu: 3 });
  assert.deepEqual(d.cleared, ['1-1']);
  assert.deepEqual(d.items, { shard: 2 });
  assert.deepEqual(d.claimed, ['q1']);
  assert.deepEqual(d.stars, { '1-1': 3 });
  assert.equal(d.updatedAt, 123);
});

test('corrupt or non-object json resets to defaults', () => {
  for (const raw of ['{not json', 'null', '[]', '"text"', '42']) {
    const st = memStorage();
    st.write(SAVE_KEY, raw);
    const d = createSave(st).get();
    assert.equal(d.v, 1);
    assert.equal(d.coins, 0);
    assert.deepEqual(d.skills, []);
    assert.equal(d.idleMode, 'safe');
    assert.equal(d.storyAct, 1);
  }
});

test('v0 currency migration still works and gains new defaults', () => {
  const save = normalizeSave({ v: 0, coin: 7, gem: 3 });
  assert.equal(save.v, 1);
  assert.equal(save.coins, 7);
  assert.equal(save.gems, 3);
  assert.equal(save.tickets, 0);
  assert.deepEqual(save.skills, []);
  assert.equal(save.trialStats.attempts, 0);
});

test('default arrays and objects are isolated between stores', () => {
  const a = createSave(memStorage());
  const b = createSave(memStorage());
  a.update((d) => {
    d.skills.push({ id: 'x', defId: 'qinglong', quality: 'common', level: 1, corroded: false });
    d.protectedSkills.push('x');
    d.attributes.str = 5;
    d.trialStats.attempts = 1;
  });
  assert.deepEqual(b.get().skills, []);
  assert.deepEqual(b.get().protectedSkills, []);
  assert.equal(b.get().attributes.str, 0);
  assert.equal(b.get().trialStats.attempts, 0);
});

test('update still flushes immediately and only bump updatedAt on update', () => {
  const st = memStorage();
  let now = 10;
  const s = createSave(st, () => now);
  const returned = s.update((d) => { d.coins = 1; });
  assert.equal(returned, s.get());
  let raw = JSON.parse(st.data[SAVE_KEY]);
  assert.equal(raw.updatedAt, 10);
  assert.equal(raw.coins, 1);

  now = 20;
  s.flush();
  raw = JSON.parse(st.data[SAVE_KEY]);
  assert.equal(raw.updatedAt, 10);
  assert.equal(raw.coins, 1);
  assert.equal(createSave(st).get().coins, 1);
});

test('normalizeSave is idempotent', () => {
  const once = normalizeSave({
    v: 1,
    idleMode: 'adventure',
    permanentSkill: 'night_heart',
    skills: [{ id: 's1', defId: 'q', quality: 'epic', level: 3, corroded: true }],
    protectedSkills: ['s1'],
    attributes: { str: 1, int: 2, spd: 3, vit: 4, hp: 5, res: 6 },
    trialStats: { attempts: 1, fails: 2, pity: 3 },
    storyAct: 4,
    lastSeenAt: 99,
  });
  assert.deepEqual(normalizeSave(once), once);
});
