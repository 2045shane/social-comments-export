export const CSV_COLUMNS = [
  'video_id',
  'video_title',
  'video_url',
  'author_display_name',
  'comment_text',
  'relative_time',
  'like_count',
  'reply_count',
  'is_reply',
  'sentiment',
  'sentiment_note',
  'exported_at',
  'export_stop_reason',
  'scroll_rounds',
];

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(value) {
  let text = value == null ? '' : String(value);
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  if (/[",\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function buildCsv(rows) {
  const header = CSV_COLUMNS.join(',');
  const lines = (rows || []).map((row) => CSV_COLUMNS.map((column) => csvCell(row?.[column])).join(','));
  return `\uFEFF${[header, ...lines].join('\r\n')}\r\n`;
}

export function csvFilename(videoId, date = new Date()) {
  const safeId = String(videoId || 'video').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'video';
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `youtube-public-comments-${safeId}-${stamp}.csv`;
}
