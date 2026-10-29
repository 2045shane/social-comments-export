import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  EXPORT_DEADLINE_MS,
  HARD_MAX_COMMENTS,
  HARD_MAX_SCROLL_ROUNDS,
  INITIAL_LOAD_TIMEOUT_MS,
  MAX_COMMENTS,
  MAX_SCROLL_ROUNDS,
  PAID_EXPORT_DEADLINE_MS,
  PAID_MAX_COMMENTS,
  PAID_MAX_SCROLL_ROUNDS,
  ROUND_TIMEOUT_MS,
} from '../src/lib/constants.js';

const root = path.resolve(import.meta.dirname, '..');

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.(js|json|html|css|md)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function readConst(source, name) {
  const match = source.match(new RegExp(`const ${name} = (\\d+);`));
  return match ? Number(match[1]) : null;
}

test('manifest is MV3 with YouTube hosts only and no all-sites access', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'storage']);
  assert.deepEqual([...manifest.host_permissions].sort(), [
    'https://api.openai.com/*',
    'https://m.youtube.com/*',
    'https://www.youtube.com/*',
  ]);
  assert.equal(manifest.optional_host_permissions, undefined);
  const blob = JSON.stringify(manifest).toLowerCase();
  assert.equal(blob.includes('all_urls'), false);
  assert.equal(blob.includes('tiktok'), false);
  assert.equal(blob.includes('instagram'), false);
  assert.equal(manifest.permissions.includes('tabs'), false);
  assert.equal(manifest.content_scripts[0].all_frames, false);
});

test('source does not hardcode a provider key or call any host except YouTube and OpenAI', () => {
  const files = walk(path.join(root, 'src')).concat(path.join(root, 'manifest.json'));
  const text = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.equal(/sk-[A-Za-z0-9]{10,}/.test(text), false);
  assert.equal(/api[_-]?key\s*[:=]\s*['"][A-Za-z0-9_-]{16,}['"]/i.test(text), false);
  const urls = text.match(/https:\/\/[a-z0-9.-]+/gi) || [];
  const hosts = new Set(urls.map((item) => new URL(item).host));
  assert.deepEqual([...hosts].sort(), ['api.openai.com', 'github.com', 'm.youtube.com', 'www.youtube.com']);
  assert.equal(text.toLowerCase().includes('tiktok'), false);
  assert.equal(text.toLowerCase().includes('instagram'), false);
  assert.equal(text.includes('all_urls'), false);
  assert.equal(text.includes('chrome.alarms'), false);
});

test('content script scroll loop is hard-capped and does not run on a timer', () => {
  const source = fs.readFileSync(path.join(root, 'src/content/youtube-comments.js'), 'utf8');
  assert.equal(readConst(source, 'FREE_MAX_SCROLL_ROUNDS'), MAX_SCROLL_ROUNDS);
  assert.equal(readConst(source, 'FREE_MAX_COMMENTS'), MAX_COMMENTS);
  assert.equal(readConst(source, 'HARD_MAX_SCROLL_ROUNDS'), HARD_MAX_SCROLL_ROUNDS);
  assert.equal(readConst(source, 'HARD_MAX_COMMENTS'), HARD_MAX_COMMENTS);
  assert.equal(HARD_MAX_SCROLL_ROUNDS, PAID_MAX_SCROLL_ROUNDS);
  assert.equal(HARD_MAX_COMMENTS, PAID_MAX_COMMENTS);
  assert.equal(readConst(source, 'EXPORT_DEADLINE_MS'), EXPORT_DEADLINE_MS);
  assert.equal(readConst(source, 'HARD_EXPORT_DEADLINE_MS'), PAID_EXPORT_DEADLINE_MS);
  assert.equal(readConst(source, 'ROUND_TIMEOUT_MS'), ROUND_TIMEOUT_MS);
  assert.equal(readConst(source, 'INITIAL_LOAD_TIMEOUT_MS'), INITIAL_LOAD_TIMEOUT_MS);
  assert.match(source, /if \(!Number\.isFinite\(number\)\) return FREE_MAX_SCROLL_ROUNDS;/);
  assert.match(source, /if \(!Number\.isFinite\(number\)\) return FREE_MAX_COMMENTS;/);
  assert.match(source, /if \(!Number\.isFinite\(number\)\) return EXPORT_DEADLINE_MS;/);
  assert.equal(source.includes('while (true)'), false);
  assert.equal(source.includes('setInterval'), false);
  assert.equal(source.includes('fetch('), false);
  assert.match(source, /for \(let round = 0; round <= maxScrollRounds; round \+= 1\)/);
});

test('repo has no provider key, Shane key, payment SDK, or server quota client', () => {
  const files = walk(path.join(root, 'src'))
    .concat(path.join(root, 'manifest.json'))
    .concat(path.join(root, 'package.json'));
  const text = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.equal(/sk-[A-Za-z0-9]{8,}/.test(text), false);
  assert.equal(/sk-proj-/.test(text), false);
  assert.equal(/AKIA[0-9A-Z]{16}/.test(text), false);
  assert.equal(/shane[_-]?api[_-]?key/i.test(text), false);
  assert.equal(/api[_-]?key\s*[:=]\s*['"][A-Za-z0-9_-]{16,}['"]/i.test(text), false);
  const lowered = text.toLowerCase();
  for (const word of ['stripe', 'paypal', 'chrome.payments', 'buy.stripe.com']) {
    assert.equal(lowered.includes(word), false, word);
  }
});
