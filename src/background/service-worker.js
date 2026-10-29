import { DAILY_FREE_EXPORT_LIMIT, OPENAI_ORIGIN, STORAGE_KEYS, tierCaps } from '../lib/constants.js';
import { verifyLicense } from '../lib/license.js';
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
  if (!fileHint) return true;
  const hints = Array.isArray(fileHint) ? fileHint : [fileHint];
  return hints.some((hint) => url.includes(hint));
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

async function readUnlock() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.license);
  return verifyLicense(data[STORAGE_KEYS.license]);
}

function quotaPayload(quota, unlocked) {
  return {
    date: quota.date,
    count: quota.count,
    limit: quota.limit,
    remaining: quota.remaining,
    allowed: quota.allowed,
    unlocked: quota.unlocked,
    ...tierCaps(unlocked),
  };
}

async function quotaStatus() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.quota);
  const unlocked = await readUnlock();
  const quota = readQuota(data[STORAGE_KEYS.quota], new Date(), DAILY_FREE_EXPORT_LIMIT, unlocked);
  return { ok: true, ...quotaPayload(quota, unlocked) };
}

async function recordExport() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.quota);
  const unlocked = await readUnlock();
  const next = quotaAfterExport(data[STORAGE_KEYS.quota], new Date(), DAILY_FREE_EXPORT_LIMIT, unlocked);
  if (next.recorded) {
    await chrome.storage.local.set({ [STORAGE_KEYS.quota]: next.stored });
  }
  return {
    ok: true,
    recorded: next.recorded,
    ...quotaPayload(next, unlocked),
  };
}

async function saveLicense(token) {
  const license = String(token || '').trim();
  if (!license) return { ok: false, error: 'EMPTY' };
  if (license.length > 120) return { ok: false, error: 'INVALID' };
  if (!(await verifyLicense(license))) return { ok: false, error: 'INVALID' };
  await chrome.storage.local.set({ [STORAGE_KEYS.license]: license });
  return quotaStatus();
}

async function clearLicense() {
  await chrome.storage.local.remove(STORAGE_KEYS.license);
  return quotaStatus();
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
    case 'LICENSE_STATUS':
      return quotaStatus();
    case 'SAVE_LICENSE':
      if (!fromExtensionPage(sender, ['/src/popup/', '/src/options/'])) return { ok: false, error: 'FORBIDDEN' };
      return saveLicense(message.license);
    case 'CLEAR_LICENSE':
      if (!fromExtensionPage(sender, ['/src/popup/', '/src/options/'])) return { ok: false, error: 'FORBIDDEN' };
      return clearLicense();
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
