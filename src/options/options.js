import {
  DAILY_FREE_EXPORT_LIMIT,
  EXPORT_DEADLINE_MS,
  MAX_COMMENTS,
  MAX_SCROLL_ROUNDS,
  MAX_SENTIMENT_COMMENTS,
  SENTIMENT_ENDPOINT,
  SENTIMENT_MODELS_ENDPOINT,
  SENTIMENT_MODEL,
  SENTIMENT_TEXT_CHARS,
  STORAGE_KEYS,
} from '../lib/constants.js';
import { translate } from '../lib/i18n.js';

const $ = (id) => document.getElementById(id);
let lang = 'zh';

function t(key, vars) {
  return translate(lang, key, vars);
}

function setStatus(id, text, tone) {
  const node = $(id);
  node.textContent = text || '';
  if (tone) node.dataset.tone = tone;
  else delete node.dataset.tone;
}

async function loadLang() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.lang);
  lang = stored[STORAGE_KEYS.lang] === 'en' ? 'en' : 'zh';
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
}

function paint() {
  document.title = t('optionsTitle');
  $('title').textContent = t('optionsTitle');
  $('lead').textContent = t('optionsLead', { limit: DAILY_FREE_EXPORT_LIMIT });
  $('lang-zh').setAttribute('aria-pressed', lang === 'zh' ? 'true' : 'false');
  $('lang-en').setAttribute('aria-pressed', lang === 'en' ? 'true' : 'false');
  $('byok-title').textContent = t('byokTitle');
  $('byok-body').textContent = t('byokBody');
  $('provider-note').textContent = t('providerNote', {
    model: SENTIMENT_MODEL,
    endpoint: SENTIMENT_ENDPOINT,
    modelsEndpoint: SENTIMENT_MODELS_ENDPOINT,
    chars: SENTIMENT_TEXT_CHARS,
    cap: MAX_SENTIMENT_COMMENTS,
  });
  $('key-label').textContent = t('keyLabel');
  $('api-key').placeholder = t('keyPlaceholder');
  $('save-key').textContent = t('saveKey');
  $('clear-key').textContent = t('clearKey');
  $('test-key').textContent = t('testKey');
  $('quota-section').textContent = t('quotaSection');
  $('quota-body').textContent = t('quotaBody', { limit: DAILY_FREE_EXPORT_LIMIT });
  $('license-title').textContent = t('licenseTitle');
  $('license-body').textContent = t('licenseBody');
  $('cta-contact').textContent = t('ctaContact');
  $('cta-channel').textContent = t('ctaChannel');
  $('license-label').textContent = t('licenseLabel');
  $('license-code').placeholder = t('licensePlaceholder');
  $('license-check').textContent = t('licenseCheck');
  $('perm-title').textContent = t('permTitle');
  $('perm-storage').textContent = t('permStorage');
  $('perm-active').textContent = t('permActiveTab');
  $('perm-youtube').textContent = t('permYouTube');
  $('perm-optional').textContent = t('permOptional');
  $('perm-no-all').textContent = t('permNoAll');
  $('limits-title').textContent = t('limitsTitle');
  $('limits-body').textContent = t('limitsBody', {
    rounds: MAX_SCROLL_ROUNDS,
    max: MAX_COMMENTS,
    seconds: Math.round(EXPORT_DEADLINE_MS / 1000),
  });
}

async function refreshKey() {
  const status = await chrome.runtime.sendMessage({ type: 'KEY_STATUS' });
  $('key-state').textContent = status?.hasKey ? t('savedStateOn') : t('savedStateOff');
  $('perm-state').textContent = status?.providerPermission ? t('permStateOn') : t('permStateOff');
  return status;
}

async function onSave(event) {
  event.preventDefault();
  const apiKey = $('api-key').value.trim();
  if (!apiKey) {
    setStatus('key-status', t('keyEmpty'), 'err');
    return;
  }
  const saved = await chrome.runtime.sendMessage({ type: 'SAVE_KEY', apiKey });
  $('api-key').value = '';
  if (!saved?.ok) {
    setStatus('key-status', t('keyEmpty'), 'err');
    return;
  }
  setStatus('key-status', saved.providerPermission ? t('keySaved') : t('keySavedNoPerm'), saved.providerPermission ? 'ok' : 'err');
  await refreshKey();
}

async function onClear() {
  await chrome.runtime.sendMessage({ type: 'CLEAR_KEY' });
  $('api-key').value = '';
  setStatus('key-status', t('keyCleared'), 'ok');
  await refreshKey();
}

async function onTest() {
  const typed = $('api-key').value.trim();
  if (typed) {
    const saved = await chrome.runtime.sendMessage({ type: 'SAVE_KEY', apiKey: typed });
    $('api-key').value = '';
    if (!saved?.ok) {
      setStatus('key-status', t('keyEmpty'), 'err');
      return;
    }
  }
  const result = await chrome.runtime.sendMessage({ type: 'TEST_KEY' });
  if (result?.error === 'NO_KEY') {
    setStatus('key-status', t('testNoKey'), 'err');
  } else if (result?.error === 'NO_PERMISSION') {
    setStatus('key-status', t('testNoPerm'), 'err');
  } else if (result?.ok) {
    setStatus('key-status', t('testOk'), 'ok');
  } else if (result?.error === 'REJECTED') {
    setStatus('key-status', t('testRejected', { status: result.status || 401 }), 'err');
  } else {
    setStatus('key-status', t('testFailed', { status: result?.status || 0 }), 'err');
  }
  await refreshKey();
}

function onLicense(event) {
  event.preventDefault();
  // The typed code is not stored and is not sent anywhere.
  $('license-code').value = '';
  setStatus('license-result', t('licenseResult'), 'err');
}

async function setLang(next) {
  lang = next === 'en' ? 'en' : 'zh';
  await chrome.storage.local.set({ [STORAGE_KEYS.lang]: lang });
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  paint();
  await refreshKey();
}

$('lang-zh').addEventListener('click', () => setLang('zh'));
$('lang-en').addEventListener('click', () => setLang('en'));
$('key-form').addEventListener('submit', onSave);
$('clear-key').addEventListener('click', onClear);
$('test-key').addEventListener('click', onTest);
$('license-form').addEventListener('submit', onLicense);
await loadLang();
paint();
await refreshKey();
