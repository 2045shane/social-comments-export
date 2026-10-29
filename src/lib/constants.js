/** Free local exports per browser calendar day. Product lock: change this number in one place. */
export const DAILY_FREE_EXPORT_LIMIT = 3;

/** Scroll attempts during one free, user-initiated export. Not a background crawl. */
export const MAX_SCROLL_ROUNDS = 8;

/** Public comments kept from the current video page in one free export. */
export const MAX_COMMENTS = 200;

/**
 * Paid per-export caps: 5× the free caps.
 * A valid local license removes the daily count and uses these caps.
 * Chosen for PLUGIN-PAYWALL-CUT-2026-10-29-v1 (not an unlimited device cap).
 */
export const PAID_MAX_SCROLL_ROUNDS = MAX_SCROLL_ROUNDS * 5;
export const PAID_MAX_COMMENTS = MAX_COMMENTS * 5;

/** Stop a free export even if a round timeout misbehaves. */
export const EXPORT_DEADLINE_MS = 45000;

/**
 * Stop a paid export. Long enough for PAID_MAX_SCROLL_ROUNDS waits plus the first paint.
 * Hitting it still reports export_stop_reason=deadline in the CSV and the popup.
 */
export const PAID_EXPORT_DEADLINE_MS = 150000;

/** Content-script hard ceiling. Equals the paid cap so a run cannot go past the unlocked tier. */
export const HARD_MAX_SCROLL_ROUNDS = PAID_MAX_SCROLL_ROUNDS;

/** Content-script hard ceiling. Equals the paid cap so a run cannot go past the unlocked tier. */
export const HARD_MAX_COMMENTS = PAID_MAX_COMMENTS;

/** Prefix of a locally checked unlock token. Not an API key. */
export const LICENSE_TOKEN_PREFIX = 'SCE1';

export function tierCaps(unlocked) {
  if (unlocked) {
    return {
      maxComments: PAID_MAX_COMMENTS,
      maxScrollRounds: PAID_MAX_SCROLL_ROUNDS,
      exportDeadlineMs: PAID_EXPORT_DEADLINE_MS,
    };
  }
  return {
    maxComments: MAX_COMMENTS,
    maxScrollRounds: MAX_SCROLL_ROUNDS,
    exportDeadlineMs: EXPORT_DEADLINE_MS,
  };
}

/** How long to wait for newly loaded comments after one scroll. */
export const ROUND_TIMEOUT_MS = 3200;

/** How long to wait for the first comment paint after the user clicks export. */
export const INITIAL_LOAD_TIMEOUT_MS = 6000;

/** Sentiment provider for this cut. Requests go here directly from the extension. */
export const PROVIDER_NAME = 'OpenAI';

export const SENTIMENT_MODEL = 'gpt-4o-mini';

export const SENTIMENT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export const SENTIMENT_MODELS_ENDPOINT = 'https://api.openai.com/v1/models';

export const OPENAI_ORIGIN = 'https://api.openai.com/*';

export const SENTIMENT_BATCH_SIZE = 20;

/** Cap so one click cannot send the whole comment list to the user's provider. */
export const MAX_SENTIMENT_COMMENTS = 40;

export const SENTIMENT_TEXT_CHARS = 500;

export const STORAGE_KEYS = {
  lang: 'sceLang',
  quota: 'sceQuota',
  license: 'sceLicense',
  openaiApiKey: 'sceOpenaiApiKey',
};
