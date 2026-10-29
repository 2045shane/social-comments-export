import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function walkJs(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkJs(full));
    else if (entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

test('the free daily limit is assigned once', () => {
  const files = walkJs(path.join(root, 'src'));
  const hits = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const found = text.match(/DAILY_FREE_EXPORT_LIMIT\s*=/g) || [];
    if (found.length) hits.push(path.relative(root, file));
  }
  assert.deepEqual(hits, ['src/lib/constants.js']);
});

test('a saved license is verified before it is stored', () => {
  const source = read('src/background/service-worker.js');
  const body = source.slice(source.indexOf('async function saveLicense'), source.indexOf('async function clearLicense'));
  const verifyAt = body.indexOf('verifyLicense');
  const storeAt = body.indexOf('chrome.storage.local.set');
  assert.ok(verifyAt > 0);
  assert.ok(storeAt > verifyAt);
  assert.match(source, /STORAGE_KEYS\.license/);
  assert.match(source, /case 'CLEAR_LICENSE'/);
});

test('popup and options no longer treat the license field as a no-op', () => {
  const popupHtml = read('src/popup/popup.html');
  const popupJs = read('src/popup/popup.js');
  const optionsHtml = read('src/options/options.html');
  const optionsJs = read('src/options/options.js');
  const i18n = read('src/lib/i18n.js');
  assert.match(popupHtml, /id="quota-block"[\s\S]*id="license-form"[\s\S]*id="license-save"/);
  assert.match(popupHtml, /id="cta-contact"/);
  assert.match(popupJs, /SAVE_LICENSE/);
  assert.match(optionsHtml, /id="license-clear"/);
  assert.match(optionsJs, /CLEAR_LICENSE/);
  const combined = [popupHtml, popupJs, optionsHtml, optionsJs, i18n].join('\n');
  for (const phrase of [
    '不会开通次数',
    'does not add exports',
    'does not validate paid',
    'The typed code is not stored',
  ]) {
    assert.equal(combined.includes(phrase), false, phrase);
  }
});

test('CSV download and BYOK sentiment are not behind the license flag', () => {
  const popup = read('src/popup/popup.js');
  const worker = read('src/background/service-worker.js');
  const downloadAt = popup.indexOf('downloadTextFile(');
  const recordAt = popup.indexOf("type: 'RECORD_EXPORT'");
  const analyzeAt = popup.indexOf("type: 'ANALYZE_SENTIMENT'");
  assert.ok(downloadAt > 0);
  assert.ok(analyzeAt > 0);
  assert.ok(downloadAt < recordAt);
  assert.equal(/if\s*\([^)]*unlocked[^)]*\)\s*\{[^}]*ANALYZE_SENTIMENT/.test(popup), false);
  assert.equal(/if\s*\([^)]*unlocked[^)]*\)\s*\{[^}]*downloadTextFile/.test(popup), false);
  const analyzeBody = worker.slice(worker.indexOf('async function analyze'), worker.indexOf('async function handle'));
  assert.equal(analyzeBody.includes('verifyLicense'), false);
  assert.equal(analyzeBody.includes('readUnlock'), false);
});

test('CI runs npm test on pull requests', () => {
  const workflow = read('.github/workflows/test.yml');
  assert.match(workflow, /pull_request/);
  assert.match(workflow, /npm test/);
});
