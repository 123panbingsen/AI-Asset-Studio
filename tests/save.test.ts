import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSave, StorageLike } from '../assets/scripts/framework/Save';

function memStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    read(k: string) { return k in data ? data[k] : null; },
    write(k: string, v: string) { data[k] = v; },
  };
}

test('empty storage yields defaults', () => {
  const s = createSave(memStorage());
  const d = s.get();
  assert.equal(d.v, 1);
  assert.equal(d.coins, 0);
  assert.equal(d.gems, 0);
  assert.deepEqual(d.cleared, []);
  assert.deepEqual(d.heroLevels, {});
});

test('update + flush roundtrips through storage', () => {
  const st = memStorage();
  const a = createSave(st);
  a.update((d) => { d.coins = 123; d.cleared.push('1-1'); });
  a.flush();

  const b = createSave(st);
  const d = b.get();
  assert.equal(d.coins, 123);
  assert.deepEqual(d.cleared, ['1-1']);
});

test('corrupt json resets to defaults without throwing', () => {
  const st = memStorage();
  st.write('eb.save.v1', '{not json');
  const s = createSave(st);
  assert.equal(s.get().coins, 0);
  assert.equal(s.get().v, 1);
});
