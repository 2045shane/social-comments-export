import {
  MAX_SENTIMENT_COMMENTS,
  SENTIMENT_BATCH_SIZE,
  SENTIMENT_ENDPOINT,
  SENTIMENT_MODELS_ENDPOINT,
  SENTIMENT_MODEL,
  SENTIMENT_TEXT_CHARS,
} from './constants.js';
import { translate } from './i18n.js';

const ALLOWED = new Set(['positive', 'neutral', 'negative', 'mixed']);

export function sentimentBatches(texts) {
  const capped = (texts || []).slice(0, MAX_SENTIMENT_COMMENTS);
  const batches = [];
  for (let start = 0; start < capped.length; start += SENTIMENT_BATCH_SIZE) {
    const batch = [];
    const end = Math.min(capped.length, start + SENTIMENT_BATCH_SIZE);
    for (let index = start; index < end; index += 1) {
      batch.push({
        i: index,
        text: String(capped[index] ?? '').slice(0, SENTIMENT_TEXT_CHARS),
      });
    }
    batches.push(batch);
  }
  return batches;
}

export function buildSentimentRequest(apiKey, batch) {
  return {
    url: SENTIMENT_ENDPOINT,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: SENTIMENT_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Label public comment sentiment. Reply with JSON only: {"labels":[{"i":0,"sentiment":"positive|neutral|negative|mixed"}]}. One label per input i. No other keys.',
          },
          { role: 'user', content: JSON.stringify({ comments: batch }) },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    },
  };
}

export function parseLabelMap(content) {
  if (typeof content !== 'string' || !content.trim()) return null;
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let data;
  try {
    data = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const list = Array.isArray(data?.labels) ? data.labels : Array.isArray(data) ? data : null;
  if (!list) return null;
  const labels = {};
  for (const item of list) {
    const index = Number(item?.i ?? item?.index);
    const sentiment = String(item?.sentiment || '').trim().toLowerCase();
    if (!Number.isInteger(index) || index < 0 || index >= MAX_SENTIMENT_COMMENTS) continue;
    if (!ALLOWED.has(sentiment)) continue;
    labels[index] = sentiment;
  }
  return labels;
}

export async function runSentiment(apiKey, texts, fetchImpl = globalThis.fetch) {
  const labels = {};
  let failed = false;
  let status = 0;
  for (const batch of sentimentBatches(texts)) {
    const request = buildSentimentRequest(apiKey, batch);
    let response;
    try {
      response = await fetchImpl(request.url, request.init);
    } catch {
      failed = true;
      break;
    }
    if (!response?.ok) {
      failed = true;
      status = Number(response?.status) || 0;
      break;
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      failed = true;
      break;
    }
    const parsed = parseLabelMap(payload?.choices?.[0]?.message?.content);
    if (!parsed) {
      failed = true;
      break;
    }
    Object.assign(labels, parsed);
  }
  let outcome = 'ok';
  if (failed && Object.keys(labels).length === 0) outcome = 'provider_error';
  else if (failed) outcome = 'partial';
  return { outcome, labels, status };
}

export async function testProviderKey(apiKey, fetchImpl = globalThis.fetch) {
  try {
    const response = await fetchImpl(SENTIMENT_MODELS_ENDPOINT, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20000),
    });
    if (response?.ok) return { ok: true, status: response.status, error: '' };
    const status = Number(response?.status) || 0;
    return { ok: false, status, error: status === 401 || status === 403 ? 'REJECTED' : 'FAILED' };
  } catch {
    return { ok: false, status: 0, error: 'FAILED' };
  }
}

export function annotateComments(count, { lang = 'zh', outcome, labels = {}, status = 0 } = {}) {
  const safeLang = lang === 'en' ? 'en' : 'zh';
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    if (outcome === 'no_key') {
      rows.push({ sentiment: 'skipped', sentiment_note: translate(safeLang, 'noteNoKey') });
      continue;
    }
    if (outcome === 'no_permission') {
      rows.push({ sentiment: 'skipped', sentiment_note: translate(safeLang, 'noteNoPermission') });
      continue;
    }
    if (index >= MAX_SENTIMENT_COMMENTS) {
      rows.push({
        sentiment: 'skipped',
        sentiment_note: translate(safeLang, 'noteOverCap', { cap: MAX_SENTIMENT_COMMENTS }),
      });
      continue;
    }
    const label = labels[index];
    if (label) {
      rows.push({ sentiment: label, sentiment_note: '' });
      continue;
    }
    if (outcome === 'provider_error' || outcome === 'partial') {
      rows.push({
        sentiment: 'error',
        sentiment_note: status
          ? translate(safeLang, 'noteProvider', { status })
          : translate(safeLang, 'noteProviderNoStatus'),
      });
      continue;
    }
    rows.push({ sentiment: 'error', sentiment_note: translate(safeLang, 'noteMissing') });
  }
  return rows;
}
