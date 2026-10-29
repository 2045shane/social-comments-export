import assert from 'node:assert/strict';
import test from 'node:test';
import { DAILY_FREE_EXPORT_LIMIT } from '../src/lib/constants.js';
import { localDateKey, quotaAfterExport, readQuota } from '../src/lib/quota.js';

test('daily free limit is the named constant 3', () => {
  assert.equal(DAILY_FREE_EXPORT_LIMIT, 3);
});

test('quota allows three exports then blocks, and rolls over the next local day', () => {
  const day = new Date(2026, 9, 28, 22, 0, 0);
  let stored = null;
  const states = [];
  for (let i = 0; i < 4; i += 1) {
    const next = quotaAfterExport(stored, day);
    states.push(next);
    stored = next.stored;
  }
  assert.deepEqual(states.map((state) => state.recorded), [true, true, true, false]);
  assert.equal(states[2].remaining, 0);
  assert.equal(states[2].allowed, false);
  assert.equal(states[3].count, 3);
  assert.equal(readQuota(stored, day).allowed, false);

  const nextDay = new Date(2026, 9, 29, 0, 5, 0);
  const rolled = readQuota(stored, nextDay);
  assert.equal(rolled.date, '2026-10-29');
  assert.equal(rolled.count, 0);
  assert.equal(rolled.remaining, 3);
  assert.equal(rolled.allowed, true);
  assert.equal(localDateKey(day), '2026-10-28');
});

test('corrupt quota storage does not grant extra exports', () => {
  const now = new Date(2026, 9, 28, 12, 0, 0);
  assert.equal(readQuota({ date: '2026-10-28', count: -4 }, now).count, 0);
  assert.equal(readQuota({ date: '2026-10-28', count: 'nope' }, now).count, 0);
  assert.equal(readQuota({ date: '2026-10-28', count: 9 }, now).allowed, false);
  assert.equal(readQuota({ date: '2026-10-28', count: 9 }, now).remaining, 0);
  assert.equal(readQuota({ date: '2026-10-28', count: 9 }, now).unlocked, false);
});

test('a local unlock removes the daily cap and clearing it restores the free cap', () => {
  const day = new Date(2026, 9, 28, 12, 0, 0);
  let stored = null;
  for (let index = 0; index < 4; index += 1) {
    const next = quotaAfterExport(stored, day, DAILY_FREE_EXPORT_LIMIT, true);
    assert.equal(next.recorded, true);
    assert.equal(next.allowed, true);
    assert.equal(next.unlocked, true);
    assert.equal(next.limit, null);
    assert.equal(next.remaining, null);
    stored = next.stored;
  }
  assert.equal(stored.count, 4);
  const back = readQuota(stored, day, DAILY_FREE_EXPORT_LIMIT, false);
  assert.equal(back.allowed, false);
  assert.equal(back.remaining, 0);
  assert.equal(back.limit, DAILY_FREE_EXPORT_LIMIT);
  assert.equal(back.unlocked, false);
});

test('clearing a license before three exports leaves the free remainder', () => {
  const day = new Date(2026, 9, 28, 12, 0, 0);
  const once = quotaAfterExport(null, day, DAILY_FREE_EXPORT_LIMIT, true);
  const back = readQuota(once.stored, day);
  assert.equal(back.count, 1);
  assert.equal(back.remaining, 2);
  assert.equal(back.allowed, true);
  assert.equal(back.unlocked, false);
});
