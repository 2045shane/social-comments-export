import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { CSV_COLUMNS, buildCsv, csvCell, csvFilename } from '../src/lib/csv.js';

test('csv columns stay in the documented order', () => {
  assert.deepEqual(CSV_COLUMNS, [
    'video_id',
    'video_title',
    'video_url',
    'author_display_name',
    'comment_text',
    'relative_time',
    'like_count',
    'reply_count',
    'is_reply',
    'sentiment',
    'sentiment_note',
    'exported_at',
    'export_stop_reason',
    'scroll_rounds',
  ]);
  const sampleHeader = fs.readFileSync(new URL('../docs/sample-columns.csv', import.meta.url), 'utf8').split(/\r?\n/)[0].replace(/^\uFEFF/, '');
  assert.equal(sampleHeader, CSV_COLUMNS.join(','));
});

test('csv escapes quotes, newlines, and spreadsheet formulas and ignores extra fields', () => {
  const csv = buildCsv([{
    author_display_name: '=cmd',
    comment_text: '他说 "你好",\n下一行',
    like_count: '4.8M',
    reply_count: '',
    is_reply: 'no',
    sentiment: 'skipped',
    apiKey: 'should-not-appear',
    openaiApiKey: 'should-not-appear',
  }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.equal(csv.includes('should-not-appear'), false);
  assert.equal(csv.includes('apiKey'), false);
  assert.match(csv, /,'=cmd,/);
  assert.match(csv, /"他说 ""你好"",\n下一行"/);
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('@sum'), "'@sum");
});

test('csv filename keeps only a safe video id', () => {
  const name = csvFilename('abc_12', new Date('2026-10-28T01:02:03.000Z'));
  assert.equal(name, 'youtube-public-comments-abc_12-20261028T010203Z.csv');
  assert.match(csvFilename('../etc/passwd'), /^youtube-public-comments-etcpasswd-/);
});
