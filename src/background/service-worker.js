import { DAILY_FREE_EXPORT_LIMIT, OPENAI_ORIGIN, STORAGE_KEYS } from '../lib/constants.js';
import { quotaAfterExport, readQuota } from '../lib/quota.js';
import { annotateComments, runSentiment, testProviderKey } from '../lib/sentiment.js';

let queue = Promise.resolve();

function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.then(() => undefined, () => undefined);
  return run;
}

function fromExtensionPage(sender, fileHint) {
  // Options is a normal tab, so sender.tab is set. Trust only our own pages.
  // Content scripts report the YouTube page URL, not a chrome-extension URL.
  const url = sender?.url || '';
  if (!url.startsWith(`chrome-extension://${chrome.runtime.id}/`)) return false;
  if (fileHint && !url.includes(fileHint)) return false;
  return true;
}

async function readStoredKey() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.openaiApiKey);
  return String(data[STORAGE_KEYS.openaiApiKey] || '').trim();
}

async function providerPermission() {
  try {
    return await chrome.permissions.contains({ origins: [OPENAI_ORIGIN] });
  } catch {
    return false;
  }
}

async function quotaStatus() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.quota);
  return { ok: true, ...readQuota(data[STORAGE_KEYS.quota], new Date(), DAILY_FREE_EXPORT_LIMIT) };
}

async function recordExport() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.quota);
  const next = quotaAfterExport(data[STORAGE_KEYS.quota], new Date(), DAILY_FREE_EXPORT_LIMIT);
  if (next.recorded) {
    await chrome.storage.local.set({ [STORAGE_KEYS.quota]: next.stored });
  }
  return {
    ok: true,
    recorded: next.recorded,
    date: next.date,
    count: next.count,
    limit: next.limit,
    remaining: next.remaining,
    allowed: next.allowed,
  };
}

async function keyStatus() {
  const apiKey = await readStoredKey();
  return { ok: true, hasKey: apiKey.length > 0, providerPermission: await providerPermission() };
}

async function saveKey(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key || key.length > 400) return { ok: false, error: 'EMPTY' };
  await chrome.storage.local.set({ [STORAGE_KEYS.openaiApiKey]: key });
  return { ok: true, hasKey: true, providerPermission: await providerPermission() };
}

async function clearKey() {
  await chrome.storage.local.remove(STORAGE_KEYS.openaiApiKey);
  return { ok: true, hasKey: false, providerPermission: await providerPermission() };
}

async function testKey(override) {
  const typed = String(override || '').trim();
  const apiKey = typed || await readStoredKey();
  if (!apiKey) return { ok: false, error: 'NO_KEY' };
  if (!(await providerPermission())) return { ok: false, error: 'NO_PERMISSION' };
  const result = await testProviderKey(apiKey);
  return { ok: result.ok, status: result.status, error: result.error };
}

async function analyze(message) {
  const lang = message?.lang === 'en' ? 'en' : 'zh';
  const texts = Array.isArray(message?.texts) ? message.texts.map((text) => String(text ?? '')) : [];
  const base = { lang, status: 0 };
  const apiKey = await readStoredKey();
  if (!apiKey) {
    return { ok: true, outcome: 'no_key', results: annotateComments(texts.length, { ...base, outcome: 'no_key' }) };
  }
  if (!(await providerPermission())) {
    return {
      ok: true,
      outcome: 'no_permission',
      results: annotateComments(texts.length, { ...base, outcome: 'no_permission' }),
    };
  }
  const ran = await runSentiment(apiKey, texts);
  return {
    ok: ran.outcome === 'ok',
    outcome: ran.outcome,
    status: ran.status || 0,
    results: annotateComments(texts.length, {
      lang,
      outcome: ran.outcome,
      labels: ran.labels,
      status: ran.status || 0,
    }),
  };
}

async function handle(message, sender) {
  switch (message?.type) {
    case 'QUOTA_STATUS':
      return quotaStatus();
    case 'RECORD_EXPORT':
      if (!fromExtensionPage(sender, '/src/popup/')) return { ok: false, error: 'FORBIDDEN' };
      return recordExport();
    case 'KEY_STATUS':
      return keyStatus();
    case 'SAVE_KEY':
      if (!fromExtensionPage(sender, '/src/options/')) return { ok: false, error: 'FORBIDDEN' };
      return saveKey(message.apiKey);
    case 'CLEAR_KEY':
      if (!fromExtensionPage(sender, '/src/options/')) return { ok: false, error: 'FORBIDDEN' };
      return clearKey();
    case 'TEST_KEY':
      if (!fromExtensionPage(sender, '/src/options/')) return { ok: false, error: 'FORBIDDEN' };
      return testKey(message.apiKey);
    case 'ANALYZE_SENTIMENT':
      if (!fromExtensionPage(sender, '/src/popup/')) return { ok: false, error: 'FORBIDDEN' };
      return analyze(message);
    default:
      return { ok: false, error: 'UNKNOWN' };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type === 'EXPORT_PROGRESS') return undefined;
  enqueue(() => handle(message, sender))
    .then((result) => sendResponse(result))
    .catch(() => sendResponse({ ok: false, error: 'INTERNAL' }));
  return true;
});
