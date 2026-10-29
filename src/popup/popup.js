import {
  DAILY_FREE_EXPORT_LIMIT,
  MAX_COMMENTS,
  MAX_SCROLL_ROUNDS,
  MAX_SENTIMENT_COMMENTS,
  PAID_MAX_COMMENTS,
  PAID_MAX_SCROLL_ROUNDS,
  PAID_EXPORT_DEADLINE_MS,
  EXPORT_DEADLINE_MS,
  STORAGE_KEYS,
} from '../lib/constants.js';
import { buildCsv, csvFilename } from '../lib/csv.js';
import { downloadTextFile } from '../lib/download.js';
import { translate } from '../lib/i18n.js';
import { canonicalVideoUrl, classifyYouTubeUrl, cleanYouTubeTitle, videoIdFromUrl } from '../lib/youtube-url.js';

const $ = (id) => document.getElementById(id);

let lang = 'zh';
let exporting = false;

function t(key, vars) {
  return translate(lang, key, vars);
}

function setStatus(text, tone) {
  const node = $('status');
  node.textContent = text || '';
  if (tone) node.dataset.tone = tone;
  else delete node.dataset.tone;
}

async function loadLang() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.lang);
  lang = stored[STORAGE_KEYS.lang] === 'en' ? 'en' : 'zh';
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
}

function paintChrome() {
  document.title = t('title');
  $('title').textContent = t('title');
  $('subtitle').textContent = t('subtitle');
  $('lang-zh').setAttribute('aria-pressed', lang === 'zh' ? 'true' : 'false');
  $('lang-en').setAttribute('aria-pressed', lang === 'en' ? 'true' : 'false');
  $('export').textContent = t('exportBtn');
  $('open-options').textContent = t('openSettings');
  $('sentiment-title').textContent = t('sentimentTitle');
  $('quota-kicker').textContent = t('pageKickerBlocked');
  $('license-label').textContent = t('licenseLabel');
  $('license-code').placeholder = t('licensePlaceholder');
  $('license-save').textContent = t('licenseSave');
}

function activeCaps(quota) {
  if (quota?.unlocked) {
    return {
      rounds: PAID_MAX_SCROLL_ROUNDS,
      max: PAID_MAX_COMMENTS,
      deadline: PAID_EXPORT_DEADLINE_MS,
    };
  }
  return {
    rounds: MAX_SCROLL_ROUNDS,
    max: MAX_COMMENTS,
    deadline: EXPORT_DEADLINE_MS,
  };
}

function renderQuota(quota) {
  const caps = activeCaps(quota);
  if (quota?.unlocked) {
    $('quota-line').textContent = t('quotaLineUnlocked', { count: quota.count ?? 0 });
    $('limits').textContent = t('limitsUnlocked', {
      rounds: caps.rounds,
      max: caps.max,
      freeRounds: MAX_SCROLL_ROUNDS,
      freeMax: MAX_COMMENTS,
    });
    $('pips').replaceChildren();
    return;
  }
  const limit = quota?.limit ?? DAILY_FREE_EXPORT_LIMIT;
  const remaining = quota?.remaining ?? limit;
  const count = quota?.count ?? Math.max(0, limit - remaining);
  $('quota-line').textContent = t('quotaLine', { limit, remaining });
  $('limits').textContent = t('limits', {
    rounds: MAX_SCROLL_ROUNDS,
    max: MAX_COMMENTS,
    paidRounds: PAID_MAX_SCROLL_ROUNDS,
    paidMax: PAID_MAX_COMMENTS,
  });
  const pips = $('pips');
  pips.replaceChildren();
  for (let index = 0; index < limit; index += 1) {
    const pip = document.createElement('span');
    pip.className = index < count ? 'pip used' : 'pip';
    pips.append(pip);
  }
}

function renderSentiment(keyStatus) {
  if (keyStatus?.hasKey && keyStatus?.providerPermission) {
    $('sentiment-body').textContent = t('sentimentOn', { cap: MAX_SENTIMENT_COMMENTS });
    return;
  }
  if (keyStatus?.hasKey) {
    $('sentiment-body').textContent = t('sentimentNoPerm');
    return;
  }
  $('sentiment-body').textContent = t('sentimentOff');
}

function renderPage(page) {
  const kicker = $('page-kicker');
  const title = $('page-title');
  const detail = $('page-detail');
  if (page.kind === 'watch' || page.kind === 'shorts') {
    kicker.textContent = page.kind === 'shorts' ? t('pageKickerShorts') : t('pageKickerWatch');
    title.textContent = page.title || t('untitled');
    detail.textContent = t('pageWatchDetail');
    return;
  }
  kicker.textContent = t('pageKickerBlocked');
  if (page.kind === 'youtube-other') {
    title.textContent = t('pageYoutubeOtherTitle');
    detail.textContent = t('pageYoutubeOtherDetail');
    return;
  }
  if (page.kind === 'other') {
    title.textContent = t('pageOtherTitle');
    detail.textContent = t('pageOtherDetail');
    return;
  }
  title.textContent = t('pageUnknownTitle');
  detail.textContent = t('pageUnknownDetail');
}

function renderQuotaBlock(quota) {
  const limit = quota?.limit ?? DAILY_FREE_EXPORT_LIMIT;
  const remaining = quota?.remaining ?? 0;
  $('quota-title').textContent = t('quotaTitle');
  $('quota-body').textContent = t('quotaUsed', { limit, remaining });
  $('cta-contact').textContent = t('ctaContact');
  $('cta-channel').textContent = t('ctaChannel');
}

function setLicenseStatus(text, tone) {
  const node = $('license-result');
  node.textContent = text || '';
  if (tone) node.dataset.tone = tone;
  else delete node.dataset.tone;
}

function isOwnExtensionTab(tab) {
  const url = tab?.url || '';
  return url.startsWith('chrome-extension://') || url.startsWith('chrome://') || url.startsWith('about:');
}

async function getActiveTab() {
  const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
  // Toolbar popup: the active tab is the page underneath.
  if (current && !isOwnExtensionTab(current)) return current;
  // Popup HTML opened as its own tab. Stay inside normal windows and skip extension pages.
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const ordered = [...windows].sort((a, b) => Number(b.focused) - Number(a.focused));
  for (const win of ordered) {
    const pages = (win.tabs || []).filter((tab) => !isOwnExtensionTab(tab));
    const active = pages.find((tab) => tab.active) || pages.at(-1);
    if (active) return active;
  }
  return current || null;
}

function describeTab(tab) {
  const url = tab?.url || '';
  const kind = url ? classifyYouTubeUrl(url) : 'unknown';
  return {
    id: tab?.id,
    url,
    kind,
    title: cleanYouTubeTitle(tab?.title || ''),
  };
}

async function refresh() {
  paintChrome();
  const page = describeTab(await getActiveTab());
  renderPage(page);
  const [quota, keyStatus] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'QUOTA_STATUS' }),
    chrome.runtime.sendMessage({ type: 'KEY_STATUS' }),
  ]);
  renderQuota(quota);
  renderSentiment(keyStatus);
  const blocked = !quota?.allowed;
  const videoPage = page.kind === 'watch' || page.kind === 'shorts';
  $('export').disabled = exporting || blocked || !videoPage || !quota?.ok;
  $('quota-block').hidden = !blocked;
  if (blocked) renderQuotaBlock(quota);
  return { page, quota, keyStatus };
}

function stopSentence(reason) {
  const key = {
    max_comments: 'stopMaxComments',
    max_rounds: 'stopMaxRounds',
    no_new_comments: 'stopNoNew',
    deadline: 'stopDeadline',
  }[reason] || 'stopNoNew';
  return t(key);
}

function errorText(code) {
  const key = {
    NOT_VIDEO_PAGE: 'notVideo',
    COMMENTS_DISABLED: 'commentsDisabled',
    NO_COMMENTS: 'noComments',
    CONSENT_WALL: 'consentWall',
    FORBIDDEN: 'internalError',
    INTERNAL: 'internalError',
  }[code] || 'noComments';
  return t(key);
}

function sentimentTail(outcome) {
  if (outcome === 'no_key') return t('successNoKey');
  if (outcome === 'no_permission') return t('successNoPerm');
  if (outcome === 'ok') return t('successSentiment');
  if (outcome === 'partial') return t('successSentimentPartial');
  return t('successSentimentFailed');
}

async function onExport() {
  if (exporting) return;
  exporting = true;
  setStatus(t('exporting'), 'info');
  $('export').disabled = true;
  try {
    const tab = await getActiveTab();
    const page = describeTab(tab);
    const quota = await chrome.runtime.sendMessage({ type: 'QUOTA_STATUS' });
    if (!quota?.ok) {
      setStatus(t('internalError'), 'err');
      return;
    }
    if (!quota.allowed) {
      renderQuota(quota);
      renderQuotaBlock(quota);
      $('quota-block').hidden = false;
      setStatus(t('quotaUsed', { limit: quota.limit ?? DAILY_FREE_EXPORT_LIMIT, remaining: quota.remaining ?? 0 }), 'err');
      return;
    }
    const caps = activeCaps(quota);
    if (page.kind !== 'watch' && page.kind !== 'shorts') {
      setStatus(t('notVideo'), 'err');
      return;
    }
    let response;
    try {
      response = await chrome.tabs.sendMessage(page.id, {
        type: 'EXPORT_LOADED_COMMENTS',
        limits: {
          maxScrollRounds: caps.rounds,
          maxComments: caps.max,
          deadlineMs: caps.deadline,
        },
      });
    } catch {
      setStatus(t('pageNotReady'), 'err');
      return;
    }
    if (!response?.ok || !Array.isArray(response.comments) || response.comments.length === 0) {
      setStatus(errorText(response?.error), 'err');
      return;
    }

    const quotaAgain = await chrome.runtime.sendMessage({ type: 'QUOTA_STATUS' });
    if (!quotaAgain?.allowed) {
      renderQuota(quotaAgain);
      renderQuotaBlock(quotaAgain);
      $('quota-block').hidden = false;
      setStatus(t('quotaUsed', {
        limit: quotaAgain?.limit || DAILY_FREE_EXPORT_LIMIT,
        remaining: quotaAgain?.remaining ?? 0,
      }), 'err');
      return;
    }

    const keyStatus = await chrome.runtime.sendMessage({ type: 'KEY_STATUS' });
    const videoUrl = canonicalVideoUrl(response.videoUrl || page.url);
    const videoId = response.videoId || videoIdFromUrl(videoUrl);
    const videoTitle = response.videoTitle || page.title || t('untitled');
    const exportedAt = new Date().toISOString();
    let rows = response.comments.map((comment) => ({
      video_id: videoId,
      video_title: videoTitle,
      video_url: videoUrl,
      author_display_name: comment.author_display_name || '',
      comment_text: comment.comment_text || '',
      relative_time: comment.relative_time || '',
      like_count: comment.like_count || '',
      reply_count: comment.reply_count || '',
      is_reply: comment.is_reply === 'yes' ? 'yes' : 'no',
      sentiment: '',
      sentiment_note: '',
      exported_at: exportedAt,
      export_stop_reason: response.stopReason || '',
      scroll_rounds: String(response.scrollRounds ?? ''),
    }));

    let outcome = 'no_key';
    if (!keyStatus?.hasKey) outcome = 'no_key';
    else if (!keyStatus?.providerPermission) outcome = 'no_permission';
    else {
      const analyzed = await chrome.runtime.sendMessage({
        type: 'ANALYZE_SENTIMENT',
        lang,
        texts: rows.map((row) => row.comment_text),
      });
      outcome = analyzed?.outcome || 'provider_error';
      const results = Array.isArray(analyzed?.results) ? analyzed.results : [];
      rows = rows.map((row, index) => ({
        ...row,
        sentiment: results[index]?.sentiment || 'error',
        sentiment_note: results[index]?.sentiment_note || t('noteProviderNoStatus'),
      }));
    }
    if (outcome === 'no_key' || outcome === 'no_permission') {
      const note = outcome === 'no_key' ? t('noteNoKey') : t('noteNoPermission');
      rows = rows.map((row) => ({ ...row, sentiment: 'skipped', sentiment_note: note }));
    }

    downloadTextFile(csvFilename(videoId), buildCsv(rows));
    const recorded = await chrome.runtime.sendMessage({ type: 'RECORD_EXPORT' });
    const base = t('successBase', {
      count: rows.length,
      stop: stopSentence(response.stopReason),
      rounds: response.scrollRounds ?? 0,
      maxRounds: caps.rounds,
    });
    setStatus(`${base}${sentimentTail(outcome)}`, outcome === 'ok' || outcome === 'no_key' || outcome === 'no_permission' ? 'ok' : 'err');
    if (recorded?.ok) renderQuota(recorded);
  } catch {
    setStatus(t('internalError'), 'err');
  } finally {
    exporting = false;
    await refresh();
  }
}

function onRuntimeMessage(message) {
  if (!exporting || message?.type !== 'EXPORT_PROGRESS') return undefined;
  setStatus(t('progress', {
    round: message.scrollRounds ?? 0,
    maxRounds: message.maxScrollRounds ?? MAX_SCROLL_ROUNDS,
    count: message.count ?? 0,
  }), 'info');
  return undefined;
}

async function onLicense(event) {
  event.preventDefault();
  const license = $('license-code').value.trim();
  const saved = await chrome.runtime.sendMessage({ type: 'SAVE_LICENSE', license });
  if (saved?.error === 'EMPTY') {
    setLicenseStatus(t('licenseEmpty'), 'err');
    return;
  }
  if (!saved?.ok || !saved.unlocked) {
    setLicenseStatus(saved?.error === 'INVALID' ? t('licenseResult') : t('internalError'), 'err');
    return;
  }
  $('license-code').value = '';
  setLicenseStatus(t('licenseSaved', { rounds: PAID_MAX_SCROLL_ROUNDS, max: PAID_MAX_COMMENTS }), 'ok');
  await refresh();
}

async function setLang(next) {
  lang = next === 'en' ? 'en' : 'zh';
  await chrome.storage.local.set({ [STORAGE_KEYS.lang]: lang });
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  await refresh();
}

$('lang-zh').addEventListener('click', () => setLang('zh'));
$('lang-en').addEventListener('click', () => setLang('en'));
$('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('export').addEventListener('click', onExport);
$('license-form').addEventListener('submit', onLicense);
chrome.runtime.onMessage.addListener(onRuntimeMessage);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STORAGE_KEYS.lang] || exporting) return;
  lang = changes[STORAGE_KEYS.lang].newValue === 'en' ? 'en' : 'zh';
  refresh();
});
await loadLang();
await refresh();
