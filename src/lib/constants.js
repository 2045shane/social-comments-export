/** Free local exports per browser calendar day. Product lock for this cut. */
export const DAILY_FREE_EXPORT_LIMIT = 3;

/** Scroll attempts during one user-initiated export. Not a background crawl. */
export const MAX_SCROLL_ROUNDS = 8;

/** Public comments kept from the current video page in one export. */
export const MAX_COMMENTS = 200;

/** Hard ceiling inside the content script. Keep equal to MAX_SCROLL_ROUNDS. */
export const HARD_MAX_SCROLL_ROUNDS = 8;

/** Hard ceiling inside the content script. Keep equal to MAX_COMMENTS. */
export const HARD_MAX_COMMENTS = 200;

/** Stop the export even if a round timeout misbehaves. */
export const EXPORT_DEADLINE_MS = 45000;

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
  openaiApiKey: 'sceOpenaiApiKey',
};
