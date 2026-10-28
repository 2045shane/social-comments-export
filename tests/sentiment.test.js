import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_SENTIMENT_COMMENTS, SENTIMENT_BATCH_SIZE, SENTIMENT_ENDPOINT } from '../src/lib/constants.js';
import {
  annotateComments,
  buildSentimentRequest,
  parseLabelMap,
  runSentiment,
  sentimentBatches,
} from '../src/lib/sentiment.js';

const KEY = 'unit-test-key-not-a-secret';

test('sentiment batches cap the run and truncate text', () => {
  const texts = Array.from({ length: 45 }, (_, index) => `${index}:${'字'.repeat(600)}`);
  const batches = sentimentBatches(texts);
  assert.equal(batches.length, MAX_SENTIMENT_COMMENTS / SENTIMENT_BATCH_SIZE);
  assert.equal(batches[0][0].text.length, 500);
  assert.equal(batches.at(-1).at(-1).i, 39);
  assert.equal(JSON.stringify(batches).includes('"i":40'), false);
});

test('sentiment request goes only to OpenAI and keeps the key in the header', () => {
  const request = buildSentimentRequest(KEY, [{ i: 0, text: 'hello' }]);
  const url = new URL(request.url);
  assert.equal(url.origin, 'https://api.openai.com');
  assert.equal(url.pathname, '/v1/chat/completions');
  assert.equal(request.url, SENTIMENT_ENDPOINT);
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers.Authorization, `Bearer ${KEY}`);
  const body = JSON.parse(request.init.body);
  assert.equal(body.model, 'gpt-4o-mini');
  assert.equal(body.temperature, 0);
  assert.equal(JSON.stringify(body).includes(KEY), false);
});

test('labels parse from JSON and fenced JSON, and unknown labels are dropped', () => {
  assert.deepEqual(parseLabelMap('{"labels":[{"i":0,"sentiment":"Positive"},{"i":1,"sentiment":"nope"}]}'), {
    0: 'positive',
  });
  assert.deepEqual(parseLabelMap('```json\n{"labels":[{"index":2,"sentiment":"mixed"}]}\n```'), { 2: 'mixed' });
  assert.equal(parseLabelMap('not json'), null);
});

test('without a key or permission, rows are skipped and still exportable', () => {
  const skipped = annotateComments(2, { lang: 'zh', outcome: 'no_key' });
  assert.deepEqual(skipped.map((row) => row.sentiment), ['skipped', 'skipped']);
  assert.match(skipped[0].sentiment_note, /未填写 OpenAI 密钥/);
  const blocked = annotateComments(1, { lang: 'en', outcome: 'no_permission' });
  assert.equal(blocked[0].sentiment, 'skipped');
  assert.match(blocked[0].sentiment_note, /api\.openai\.com/);
});

test('a direct provider response is written onto rows, and failures stay in the note', async () => {
  const fetchImpl = async (url, init) => {
    assert.equal(url, SENTIMENT_ENDPOINT);
    assert.match(init.headers.Authorization, /^Bearer /);
    return {
      ok: true,
      status: 200,
      async json() {
        return { choices: [{ message: { content: '{"labels":[{"i":0,"sentiment":"neutral"},{"i":1,"sentiment":"negative"}]}' } }] };
      },
    };
  };
  const ran = await runSentiment(KEY, ['a', 'b'], fetchImpl);
  assert.equal(ran.outcome, 'ok');
  const rows = annotateComments(3, { lang: 'zh', outcome: ran.outcome, labels: ran.labels });
  assert.equal(rows[0].sentiment, 'neutral');
  assert.equal(rows[1].sentiment, 'negative');
  assert.equal(rows[2].sentiment, 'error');

  const denied = await runSentiment(KEY, ['a'], async () => ({ ok: false, status: 401, async json() { return {}; } }));
  assert.equal(denied.outcome, 'provider_error');
  const failed = annotateComments(1, { lang: 'en', outcome: denied.outcome, status: denied.status });
  assert.equal(failed[0].sentiment, 'error');
  assert.match(failed[0].sentiment_note, /HTTP 401/);
});

test('rows past the sentiment cap are skipped even when earlier labels exist', () => {
  const rows = annotateComments(MAX_SENTIMENT_COMMENTS + 1, {
    lang: 'zh',
    outcome: 'ok',
    labels: { 0: 'positive' },
  });
  assert.equal(rows[0].sentiment, 'positive');
  assert.equal(rows[MAX_SENTIMENT_COMMENTS].sentiment, 'skipped');
  assert.match(rows[MAX_SENTIMENT_COMMENTS].sentiment_note, /40/);
});
