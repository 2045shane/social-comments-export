/**
 * Reads public comments already rendered on the open YouTube watch / Shorts page.
 * Runs only after the user clicks export. Stop conditions are all bounded:
 * HARD_MAX_SCROLL_ROUNDS, HARD_MAX_COMMENTS, the passed deadline, or no new rows.
 * Missing limits fall back to the free caps. Hard ceilings match the paid caps
 * in src/lib/constants.js. Keep the numeric literals aligned with that file.
 */
(() => {
  if (globalThis.__SCE_COMMENTS_EXPORT__) return;
  globalThis.__SCE_COMMENTS_EXPORT__ = true;

  const FREE_MAX_SCROLL_ROUNDS = 8;
  const FREE_MAX_COMMENTS = 200;
  const HARD_MAX_SCROLL_ROUNDS = 40;
  const HARD_MAX_COMMENTS = 1000;
  const EXPORT_DEADLINE_MS = 45000;
  const HARD_EXPORT_DEADLINE_MS = 150000;
  const ROUND_TIMEOUT_MS = 3200;
  const INITIAL_LOAD_TIMEOUT_MS = 6000;
  const MAX_TEXT_CHARS = 8000;

  function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  function oneLine(value) {
    return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function cleanBlock(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function clampRounds(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return FREE_MAX_SCROLL_ROUNDS;
    return Math.min(HARD_MAX_SCROLL_ROUNDS, Math.max(0, Math.floor(number)));
  }

  function clampComments(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return FREE_MAX_COMMENTS;
    return Math.min(HARD_MAX_COMMENTS, Math.max(1, Math.floor(number)));
  }

  function clampDeadline(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return EXPORT_DEADLINE_MS;
    return Math.min(HARD_EXPORT_DEADLINE_MS, Math.max(1000, Math.floor(number)));
  }

  function pageKind() {
    const host = location.hostname;
    if (host !== 'www.youtube.com' && host !== 'm.youtube.com' && host !== 'youtube.com') return 'other';
    const url = new URL(location.href);
    if (url.pathname === '/watch' && url.searchParams.get('v')) return 'watch';
    if (/^\/shorts\/[^/?#]+/.test(url.pathname)) return 'shorts';
    return 'other';
  }

  function videoId() {
    const url = new URL(location.href);
    if (url.pathname === '/watch') return url.searchParams.get('v') || '';
    if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/').filter(Boolean)[1] || '';
    return '';
  }

  function canonicalUrl() {
    const id = videoId();
    if (!id) return location.origin + location.pathname;
    if (location.pathname === '/watch') return `${location.origin}/watch?v=${encodeURIComponent(id)}`;
    return `${location.origin}/shorts/${encodeURIComponent(id)}`;
  }

  function videoTitle() {
    const selectors = [
      'ytd-watch-metadata h1 yt-formatted-string',
      'ytd-watch-metadata h1',
      'h1 yt-formatted-string',
      'yt-shorts-video-title-view-model',
    ];
    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        const text = oneLine(node.textContent);
        if (text) return text.slice(0, 300);
      }
    }
    return document.title.replace(/\s+-\s+YouTube\s*$/i, '').trim();
  }

  function countThreads() {
    return document.querySelectorAll('ytd-comment-thread-renderer').length;
  }

  function commentsRoot() {
    return document.querySelector('ytd-comments') || document.querySelector('#comments') || null;
  }

  function detectDisabled() {
    const root = commentsRoot();
    const message = root?.querySelector('ytd-message-renderer, yt-formatted-string#message');
    const text = oneLine(message?.innerText || message?.textContent || '');
    if (!text) return false;
    return /comments are turned off|commenting is turned off|评论已关闭|评论功能已关闭|已关闭评论/i.test(text);
  }

  function detectConsentWall() {
    if (countThreads() > 0) return false;
    const text = oneLine(document.body?.innerText?.slice(0, 1800) || '');
    return /before you continue|sign in to confirm|同意并继续|确认您不是机器人|确认你不是机器人/i.test(text);
  }

  function queryIn(root, selector) {
    if (!root) return null;
    const direct = root.querySelector?.(selector);
    if (direct) return direct;
    const nodes = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (const node of nodes) {
      if (!node.shadowRoot) continue;
      const hit = node.shadowRoot.querySelector(selector);
      if (hit) return hit;
    }
    return null;
  }

function fieldText(root, selector, block) {
  const el = queryIn(root, selector);
  if (!el) return '';
  const visible = el.innerText || '';
  const raw = visible.trim() ? visible : (el.textContent || '');
  return block ? cleanBlock(raw) : oneLine(raw);
}

  function extractOne(root, isReply) {
    const commentText = fieldText(root, '#content-text', true);
    if (!commentText || commentText.length > MAX_TEXT_CHARS) return null;
    const replySource = isReply ? null : root.closest('ytd-comment-thread-renderer')?.querySelector('#more-replies');
    const replyText = oneLine(replySource?.innerText || replySource?.textContent || '');
    return {
      author_display_name: fieldText(root, '#author-text', false).slice(0, 200),
      comment_text: commentText,
      relative_time: fieldText(root, '#published-time-text', false).slice(0, 120),
      like_count: fieldText(root, '#vote-count-middle', false).slice(0, 40),
      reply_count: !isReply && /\d/.test(replyText) ? replyText.slice(0, 80) : '',
      is_reply: isReply ? 'yes' : 'no',
    };
  }

  function rowKey(row) {
    return [row.is_reply, row.author_display_name, row.relative_time, row.comment_text].join('\u0001');
  }

  function collectVisible() {
    const rows = [];
    const threads = document.querySelectorAll('ytd-comment-thread-renderer');
    for (const thread of threads) {
      const main = thread.querySelector('#comment') || thread.querySelector('ytd-comment-view-model, ytd-comment-renderer');
      const mainRow = main ? extractOne(main, false) : null;
      if (mainRow) rows.push(mainRow);
      const replies = thread.querySelectorAll('#replies ytd-comment-view-model, #replies ytd-comment-renderer');
      for (const reply of replies) {
        if (reply === main) continue;
        const replyRow = extractOne(reply, true);
        if (replyRow) rows.push(replyRow);
      }
    }
    return rows;
  }

  function scrollableAncestor(element) {
    let node = element;
    while (node && node !== document.body && node !== document.documentElement) {
      const style = getComputedStyle(node);
      const overflow = `${style.overflowY} ${style.overflow}`;
      if (/(auto|scroll)/.test(overflow) && node.scrollHeight > node.clientHeight + 40) return node;
      node = node.parentElement;
    }
    return null;
  }

function scrollForMore() {
  const thread = document.querySelector('ytd-comment-thread-renderer');
  const panel = thread?.closest('ytd-engagement-panel-section-list-renderer');
  if (panel || pageKind() === 'shorts') {
    // Window scrolling on a Short moves to the next video. Stay inside the panel.
    const host = panel || document.querySelector('ytd-engagement-panel-section-list-renderer');
    const scroller = host ? (scrollableAncestor(host) || host) : null;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    host?.querySelector('ytd-continuation-item-renderer')?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    return;
  }
  const continuation = document.querySelector('ytd-comments ytd-continuation-item-renderer, ytd-continuation-item-renderer');
  continuation?.scrollIntoView({ block: 'center', behavior: 'instant' });
  const scroller = document.scrollingElement || document.documentElement;
  scroller.scrollTop = scroller.scrollHeight;
}

function findShortsCommentsButton() {
  const nodes = [...document.querySelectorAll('button, [role="button"]')];
  return nodes.find((node) => {
    const label = `${node.getAttribute('aria-label') || ''} ${node.innerText || ''}`;
    return /comment|评论/i.test(label) && !/like|dislike|share|remix|订阅|分享/i.test(label);
  }) || null;
}

async function clickShortsComments() {
  if (countThreads() > 0) return false;
  const target = findShortsCommentsButton();
  if (!target) return false;
  target.click();
  await sleep(600);
  return true;
}

async function revealComments(kind) {
  let shortsClicks = 0;
  if (kind !== 'shorts') commentsRoot()?.scrollIntoView({ block: 'center', behavior: 'instant' });
  const started = Date.now();
  while (Date.now() - started < INITIAL_LOAD_TIMEOUT_MS) {
    if (countThreads() > 0) return 'ready';
    if (detectDisabled()) return 'disabled';
    // Shorts keeps comments behind one button. A few tries, then stop.
    if (kind === 'shorts' && shortsClicks < 4) {
      const clicked = await clickShortsComments();
      if (clicked) shortsClicks += 1;
    }
    await sleep(300);
  }
  if (countThreads() > 0) return 'ready';
  if (detectDisabled()) return 'disabled';
  if (detectConsentWall()) return 'consent';
  return 'empty';
}

function notify(scrollRounds, maxScrollRounds, count) {
  try {
    chrome.runtime.sendMessage({
      type: 'EXPORT_PROGRESS',
      scrollRounds,
      maxScrollRounds,
      count,
    }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // The popup can close mid-export. Collection still finishes.
  }
}

async function waitForGrowth(seen, before, maxComments, timeoutMs, startedAt, deadlineMs) {
  const begin = Date.now();
  while (Date.now() - begin < timeoutMs) {
    if (Date.now() - startedAt > deadlineMs) return false;
    absorb(seen, maxComments);
    if (seen.size > before) return true;
    await sleep(200);
  }
  absorb(seen, maxComments);
  return seen.size > before;
}

  function absorb(seen, maxComments) {
    for (const row of collectVisible()) {
      if (seen.size >= maxComments) break;
      const key = rowKey(row);
      if (!seen.has(key)) seen.set(key, row);
    }
    return seen.size;
  }

  async function exportLoaded(limits) {
    const maxScrollRounds = clampRounds(limits?.maxScrollRounds);
    const maxComments = clampComments(limits?.maxComments);
    const deadlineMs = clampDeadline(limits?.deadlineMs);
    const kind = pageKind();
    if (kind !== 'watch' && kind !== 'shorts') return { ok: false, error: 'NOT_VIDEO_PAGE' };

    const startedAt = Date.now();
    const revealed = await revealComments(kind);
    if (countThreads() === 0 && revealed === 'disabled') {
      return { ok: false, error: 'COMMENTS_DISABLED', videoTitle: videoTitle(), videoUrl: canonicalUrl(), videoId: videoId() };
    }
    if (countThreads() === 0 && revealed === 'consent') return { ok: false, error: 'CONSENT_WALL' };

    const seen = new Map();
    let stopReason = 'no_new_comments';
    let scrollRounds = 0;

    for (let round = 0; round <= maxScrollRounds; round += 1) {
      if (Date.now() - startedAt > deadlineMs) {
        stopReason = 'deadline';
        break;
      }
      const size = absorb(seen, maxComments);
      notify(scrollRounds, maxScrollRounds, size);
      if (size >= maxComments) {
        stopReason = 'max_comments';
        break;
      }
      if (round === maxScrollRounds) {
        stopReason = 'max_rounds';
        break;
      }
      const before = seen.size;
      scrollForMore();
      scrollRounds += 1;
      const grew = await waitForGrowth(seen, before, maxComments, ROUND_TIMEOUT_MS, startedAt, deadlineMs);
      if (seen.size >= maxComments) {
        stopReason = 'max_comments';
        break;
      }
      if (!grew) {
        stopReason = Date.now() - startedAt > deadlineMs ? 'deadline' : 'no_new_comments';
        break;
      }
    }

    const comments = [...seen.values()].slice(0, maxComments);
    if (comments.length === 0) {
      if (detectDisabled()) {
        return { ok: false, error: 'COMMENTS_DISABLED', videoTitle: videoTitle(), videoUrl: canonicalUrl(), videoId: videoId() };
      }
      return { ok: false, error: 'NO_COMMENTS', videoTitle: videoTitle(), videoUrl: canonicalUrl(), videoId: videoId() };
    }
    return {
      ok: true,
      comments,
      stopReason,
      scrollRounds,
      videoTitle: videoTitle(),
      videoUrl: canonicalUrl(),
      videoId: videoId(),
    };
  }

  function pageInfo() {
    return {
      ok: true,
      kind: pageKind(),
      videoTitle: videoTitle(),
      videoUrl: canonicalUrl(),
      videoId: videoId(),
      threadCount: countThreads(),
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') return undefined;
    if (message.type === 'GET_PAGE_INFO') {
      sendResponse(pageInfo());
      return undefined;
    }
    if (message.type === 'EXPORT_LOADED_COMMENTS') {
      exportLoaded(message.limits).then(sendResponse, () => sendResponse({ ok: false, error: 'NO_COMMENTS' }));
      return true;
    }
    return undefined;
  });
})();
