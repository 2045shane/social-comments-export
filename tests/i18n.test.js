import assert from 'node:assert/strict';
import test from 'node:test';
import { STRINGS, translate } from '../src/lib/i18n.js';

test('chinese and english expose the same keys', () => {
  assert.deepEqual(Object.keys(STRINGS.zh).sort(), Object.keys(STRINGS.en).sort());
});

test('default copy is chinese and the locked contact lines are present', () => {
  assert.equal(translate('zh', 'title'), '评论导出');
  assert.equal(translate('en', 'ctaContact'), '有问题请联系我');
  assert.match(translate('zh', 'ctaChannel'), /珊哥爱读书/);
  assert.match(translate('en', 'ctaChannel'), /珊哥爱读书/);
  assert.match(translate('zh', 'licenseResult'), /珊哥爱读书/);
  assert.match(translate('zh', 'quotaLine', { limit: 3, remaining: 2 }), /每天 3 次/);
  assert.equal(translate('nope', 'title'), '评论导出');
});
