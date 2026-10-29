import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAILY_FREE_EXPORT_LIMIT,
  MAX_COMMENTS,
  MAX_SCROLL_ROUNDS,
  PAID_MAX_COMMENTS,
  PAID_MAX_SCROLL_ROUNDS,
  tierCaps,
} from '../src/lib/constants.js';
import { issueLicense, verifyLicense } from '../src/lib/license.js';

test('paid per-export caps are five times the free caps and the daily free limit stays 3', () => {
  assert.equal(DAILY_FREE_EXPORT_LIMIT, 3);
  assert.equal(PAID_MAX_COMMENTS, MAX_COMMENTS * 5);
  assert.equal(PAID_MAX_SCROLL_ROUNDS, MAX_SCROLL_ROUNDS * 5);
  assert.deepEqual(tierCaps(false), {
    maxComments: MAX_COMMENTS,
    maxScrollRounds: MAX_SCROLL_ROUNDS,
    exportDeadlineMs: 45000,
  });
  assert.equal(tierCaps(true).maxComments, PAID_MAX_COMMENTS);
  assert.equal(tierCaps(true).maxScrollRounds, PAID_MAX_SCROLL_ROUNDS);
  assert.ok(tierCaps(true).exportDeadlineMs > tierCaps(false).exportDeadlineMs);
});

test('a minted license verifies and junk input does not', async () => {
  const token = await issueLicense();
  assert.equal(await verifyLicense(token), true);
  assert.equal(await verifyLicense(`  ${token}  `), true);
  assert.equal(await verifyLicense(''), false);
  assert.equal(await verifyLicense('not-a-license'), false);
  assert.equal(await verifyLicense('SCE1.not-valid'), false);
  assert.equal(await verifyLicense(`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`), false);
  assert.equal(token.startsWith('sk-'), false);
});
