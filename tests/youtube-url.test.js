import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalVideoUrl, classifyYouTubeUrl, cleanYouTubeTitle, videoIdFromUrl } from '../src/lib/youtube-url.js';

test('classifies youtube watch and shorts, and rejects other sites', () => {
  assert.equal(classifyYouTubeUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw&t=4'), 'watch');
  assert.equal(classifyYouTubeUrl('https://m.youtube.com/shorts/abc_12?feature=share'), 'shorts');
  assert.equal(classifyYouTubeUrl('https://www.youtube.com/feed/trending'), 'youtube-other');
  assert.equal(classifyYouTubeUrl('https://example.com/watch?v=jNQXAC9IVRw'), 'other');
  assert.equal(classifyYouTubeUrl('https://music.youtube.com/watch?v=jNQXAC9IVRw'), 'other');
  assert.equal(classifyYouTubeUrl('https://www.tiktok.com/@user/video/1'), 'other');
  assert.equal(classifyYouTubeUrl(''), 'unknown');
  assert.equal(classifyYouTubeUrl('not a url'), 'unknown');
});

test('canonical url drops tracking params', () => {
  assert.equal(
    canonicalVideoUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PL&lc=abc'),
    'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  );
  assert.equal(videoIdFromUrl('https://www.youtube.com/shorts/abc_12?si=1'), 'abc_12');
  assert.equal(canonicalVideoUrl('https://m.youtube.com/shorts/abc_12?si=1'), 'https://m.youtube.com/shorts/abc_12');
  assert.equal(cleanYouTubeTitle('Me at the zoo - YouTube'), 'Me at the zoo');
});
