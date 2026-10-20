import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGameplayConfig, normalizeGameplay, setGameplayConfig } from '../assets/scripts/framework/Config';
import { normalizeSave } from '../assets/scripts/framework/Save';
import { eclipseActive, idleRates, offlineReport } from '../assets/scripts/framework/idle/Idle';

/** 构造本地时间戳：不依赖机器时区，`new Date(...).getHours()` 必然等于传入的 hour。 */
function localTime(day: number, hour: number, minute = 0): number {
  return new Date(2026, 0, day, hour, minute, 0, 0).getTime();
}

/** 找一个不在日蚀窗口内的本地时刻（默认配置 20–21 之外），避免倍率干扰期望值。 */
function nonEclipseTime(day: number): number {
  for (let hour = 0; hour < 24; hour++) {
    const t = localTime(day, hour);
    if (!eclipseActive(t)) return t;
  }
  return localTime(day, 0);
}

/** 默认存档 + 覆盖字段（lastSeenAt 默认 0）。 */
function makeSave(overrides: Record<string, unknown> = {}) {
  return { ...normalizeSave({}), ...overrides } as ReturnType<typeof normalizeSave>;
}

/** 临时替换玩法配置并在结束后还原，避免跨用例污染。 */
function withGameplay(patch: Record<string, unknown>, fn: () => void): void {
  const prev = getGameplayConfig();
  setGameplayConfig(normalizeGameplay(patch));
  try {
    fn();
  } finally {
    setGameplayConfig(prev);
  }
}

test('offline caps at 8 hours and reports the raw elapsed seconds', () => {
  const now = localTime(15, 12);
  const save = makeSave({ idleMode: 'adventure', lastSeenAt: now - 12 * 3600 * 1000 });
  const r = offlineReport(save, now);
  assert.equal(r.seconds, 12 * 3600);
  assert.equal(r.capped, true);
  assert.equal(r.cappedSeconds, 8 * 3600);
  assert.equal(r.cappedSeconds, getGameplayConfig().idle.offlineCapHours * 3600);
});

test('exactly the cap is not reported as capped', () => {
  const now = localTime(15, 12);
  const save = makeSave({ idleMode: 'adventure', lastSeenAt: now - 8 * 3600 * 1000 });
  const r = offlineReport(save, now);
  assert.equal(r.capped, false);
  assert.equal(r.cappedSeconds, 8 * 3600);
});

test('offline cap is read from config, not hardcoded', () => {
  const now = localTime(15, 12);
  const save = makeSave({ idleMode: 'adventure', lastSeenAt: now - 5 * 3600 * 1000 });
  withGameplay({ idle: { offlineCapHours: 2 } }, () => {
    const r = offlineReport(save, now);
    assert.equal(r.seconds, 5 * 3600);
    assert.equal(r.cappedSeconds, 2 * 3600);
    assert.equal(r.capped, true);
  });
  // 配置还原后回到默认 8h：5h 不再被裁剪
  const restored = offlineReport(save, now);
  assert.equal(restored.cappedSeconds, 5 * 3600);
  assert.equal(restored.capped, false);
});

test('capped rewards derive from cappedSeconds, not raw elapsed seconds', () => {
  const cfg = getGameplayConfig().idle;
  const capSeconds = Math.floor(cfg.offlineCapHours * 3600);
  const rate = idleRates('adventure', false);
  const now = nonEclipseTime(15);

  // 12h 离线（默认配置 8h 上限）：收益按 8h 结算，而不是 12h。
  const longRaw = 12 * 3600;
  const long = offlineReport(makeSave({ idleMode: 'adventure', lastSeenAt: now - longRaw * 1000 }), now);
  assert.equal(long.eclipse, false);
  assert.equal(long.seconds, longRaw);
  assert.equal(long.capped, longRaw > capSeconds);
  assert.equal(long.cappedSeconds, Math.min(longRaw, capSeconds));
  const longMinutes = long.cappedSeconds / 60;
  assert.equal(long.coins, Math.floor(longMinutes * rate.coinsPerMin));
  assert.equal(long.shards, Math.floor(longMinutes * rate.shardsPerMin));
  assert.equal(long.trials, Math.floor(longMinutes * rate.trialChancePerMin));
  // 默认配置基准值：8h → 28800 金币 / 960 碎片 / 48 次试炼（非 12h 的 43200/1440/72）。
  if (longRaw > capSeconds) {
    assert.notEqual(long.coins, Math.floor(((longRaw / 60) * rate.coinsPerMin)), 'must not bill raw seconds');
  }

  // 2h 离线（默认未达上限）：cappedSeconds 等于真实秒数，收益同比例。
  // 默认配置基准值：2h → 7200 金币 / 240 碎片 / 12 次试炼。
  const shortRaw = 2 * 3600;
  const shortCapped = Math.min(shortRaw, capSeconds);
  const short = offlineReport(makeSave({ idleMode: 'adventure', lastSeenAt: now - shortRaw * 1000 }), now);
  assert.equal(short.eclipse, false);
  assert.equal(short.seconds, shortRaw);
  assert.equal(short.cappedSeconds, shortCapped);
  assert.equal(short.capped, shortRaw > capSeconds);
  const shortMinutes = shortCapped / 60;
  assert.equal(short.coins, Math.floor(shortMinutes * rate.coinsPerMin));
  assert.equal(short.shards, Math.floor(shortMinutes * rate.shardsPerMin));
  assert.equal(short.trials, Math.floor(shortMinutes * rate.trialChancePerMin));
});

test('safe mode never triggers trials', () => {
  const now = localTime(15, 12);
  const save = makeSave({ idleMode: 'safe', lastSeenAt: now - 3600 * 1000 });
  const r = offlineReport(save, now);
  assert.equal(r.trials, 0);
  assert.equal(idleRates('safe', false).trialChancePerMin, 0);
});

test('first launch (lastSeenAt 0) grants no offline rewards', () => {
  const now = localTime(15, 12);
  const r = offlineReport(makeSave({ idleMode: 'adventure', lastSeenAt: 0 }), now);
  assert.deepEqual(r, {
    seconds: 0,
    cappedSeconds: 0,
    capped: false,
    coins: 0,
    shards: 0,
    trials: 0,
    eclipse: false,
  });
});

test('clock skew (now not after lastSeenAt) grants no rewards', () => {
  const now = localTime(15, 12);
  const equal = offlineReport(makeSave({ lastSeenAt: now }), now);
  assert.equal(equal.seconds, 0);
  assert.equal(equal.coins, 0);
  assert.equal(equal.capped, false);

  const future = offlineReport(makeSave({ idleMode: 'adventure', lastSeenAt: now + 60_000 }), now);
  assert.deepEqual(future, {
    seconds: 0,
    cappedSeconds: 0,
    capped: false,
    coins: 0,
    shards: 0,
    trials: 0,
    eclipse: false,
  });
});

test('eclipse multiplies resources and trial chance from config', () => {
  const cfg = getGameplayConfig().idle;
  const mult = cfg.eclipse.resourceMult;
  const trialMult = cfg.eclipse.trialMult;

  const normal = idleRates('adventure', false);
  const during = idleRates('adventure', true);
  assert.equal(during.coinsPerMin, normal.coinsPerMin * mult);
  assert.equal(during.shardsPerMin, normal.shardsPerMin * mult);
  assert.ok(Math.abs(during.trialChancePerMin - normal.trialChancePerMin * trialMult) < 1e-9);

  // 安全模式在日蚀下同样只放大资源，试炼仍为 0
  const safeDuring = idleRates('safe', true);
  assert.equal(safeDuring.coinsPerMin, idleRates('safe', false).coinsPerMin * mult);
  assert.equal(safeDuring.trialChancePerMin, 0);
});

test('offline report doubles resources when now falls inside the eclipse window', () => {
  const cfg = getGameplayConfig().idle;
  const { startHour } = cfg.eclipse;
  const mult = cfg.eclipse.resourceMult;
  const minutes = 10;

  // 窗口内：配置起始小时；窗口外：startHour-2（默认配置下两处都合法且不同）
  const insideNow = localTime(15, startHour, 30);
  const outsideNow = localTime(15, (startHour + 22) % 24, 0);
  assert.equal(eclipseActive(insideNow), true);
  assert.equal(eclipseActive(outsideNow), false);

  const insideSave = makeSave({ idleMode: 'adventure', lastSeenAt: insideNow - minutes * 60 * 1000 });
  const outsideSave = makeSave({ idleMode: 'adventure', lastSeenAt: outsideNow - minutes * 60 * 1000 });

  const inside = offlineReport(insideSave, insideNow);
  const outside = offlineReport(outsideSave, outsideNow);

  assert.equal(inside.eclipse, true);
  assert.equal(outside.eclipse, false);
  assert.equal(outside.coins, Math.floor(minutes * idleRates('adventure', false).coinsPerMin));
  assert.equal(inside.coins, Math.floor(minutes * idleRates('adventure', true).coinsPerMin));
  assert.equal(inside.coins, outside.coins * mult);
  assert.equal(inside.shards, outside.shards * mult);
});

test('eclipse trial count uses the trial multiplier', () => {
  const cfg = getGameplayConfig().idle;
  const insideNow = localTime(15, cfg.eclipse.startHour, 30);
  const outsideNow = localTime(15, (cfg.eclipse.startHour + 22) % 24, 15);
  const minutes = 20;

  const inside = offlineReport(
    makeSave({ idleMode: 'adventure', lastSeenAt: insideNow - minutes * 60 * 1000 }),
    insideNow,
  );
  const outside = offlineReport(
    makeSave({ idleMode: 'adventure', lastSeenAt: outsideNow - minutes * 60 * 1000 }),
    outsideNow,
  );
  assert.equal(outside.trials, Math.floor(minutes * cfg.adventure.trialChancePerMin));
  assert.equal(inside.trials, Math.floor(minutes * cfg.adventure.trialChancePerMin * cfg.eclipse.trialMult));
});

test('fractional minutes are floored per resource', () => {
  const now = localTime(15, 12);
  const save = makeSave({ idleMode: 'safe', lastSeenAt: now - 90 * 1000 });
  const r = offlineReport(save, now);
  const rate = idleRates('safe', false);
  assert.equal(r.seconds, 90);
  assert.equal(r.cappedSeconds, 90);
  assert.equal(r.coins, Math.floor((90 / 60) * rate.coinsPerMin));
  assert.equal(r.coins, 45); // 1.5 分钟 × 30
  assert.equal(r.shards, Math.floor((90 / 60) * rate.shardsPerMin));
  assert.equal(r.shards, 1);

  const subMinute = offlineReport(makeSave({ idleMode: 'safe', lastSeenAt: now - 59 * 1000 }), now);
  assert.equal(subMinute.coins, Math.floor((59 / 60) * rate.coinsPerMin));
  assert.equal(subMinute.shards, 0);
});

test('rates and rewards are config driven (no hardcoded values)', () => {
  const now = localTime(15, 12);
  const save = makeSave({ idleMode: 'adventure', lastSeenAt: now - 10 * 60 * 1000 });
  withGameplay(
    {
      idle: {
        safe: { coinsPerMin: 11, shardsPerMin: 2, trialChancePerMin: 0 },
        adventure: { coinsPerMin: 100, shardsPerMin: 3, trialChancePerMin: 0.5 },
        eclipse: { startHour: 20, endHour: 21, resourceMult: 2, trialMult: 1.5 },
      },
    },
    () => {
      assert.deepEqual(idleRates('safe', false), { coinsPerMin: 11, shardsPerMin: 2, trialChancePerMin: 0 });
      const r = offlineReport(save, now);
      assert.equal(r.eclipse, false);
      assert.equal(r.coins, 1000);
      assert.equal(r.shards, 30);
      assert.equal(r.trials, 5);
    },
  );
});

test('eclipse window wrapping across midnight is handled', () => {
  withGameplay({ idle: { eclipse: { startHour: 23, endHour: 6, resourceMult: 2, trialMult: 1.5 } } }, () => {
    assert.equal(eclipseActive(localTime(15, 23, 30)), true);
    assert.equal(eclipseActive(localTime(15, 0, 0)), true);
    assert.equal(eclipseActive(localTime(15, 5, 59)), true);
    assert.equal(eclipseActive(localTime(15, 6, 0)), false);
    assert.equal(eclipseActive(localTime(15, 12, 0)), false);
    assert.equal(eclipseActive(localTime(15, 22, 59)), false);
  });
});

test('degenerate empty eclipse window is never active', () => {
  withGameplay({ idle: { eclipse: { startHour: 10, endHour: 10, resourceMult: 2, trialMult: 1.5 } } }, () => {
    assert.equal(eclipseActive(localTime(15, 10, 0)), false);
    assert.equal(eclipseActive(localTime(15, 3, 0)), false);
  });
});
