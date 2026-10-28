const YOUTUBE_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com']);

export function classifyYouTubeUrl(raw) {
  if (!raw || typeof raw !== 'string') return 'unknown';
  let url;
  try {
    url = new URL(raw);
  } catch {
    return 'unknown';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'unknown';
  if (!YOUTUBE_HOSTS.has(url.hostname)) return 'other';
  if (url.pathname === '/watch' && url.searchParams.get('v')) return 'watch';
  if (/^\/shorts\/[^/?#]+/.test(url.pathname)) return 'shorts';
  return 'youtube-other';
}

export function videoIdFromUrl(raw) {
  const kind = classifyYouTubeUrl(raw);
  if (kind !== 'watch' && kind !== 'shorts') return '';
  const url = new URL(raw);
  if (kind === 'watch') return url.searchParams.get('v') || '';
  return url.pathname.split('/').filter(Boolean)[1] || '';
}

export function canonicalVideoUrl(raw) {
  const kind = classifyYouTubeUrl(raw);
  if (kind !== 'watch' && kind !== 'shorts') return '';
  const url = new URL(raw);
  const id = videoIdFromUrl(raw);
  if (!id) return '';
  if (kind === 'watch') return `https://${url.hostname}/watch?v=${encodeURIComponent(id)}`;
  return `https://${url.hostname}/shorts/${encodeURIComponent(id)}`;
}

export function cleanYouTubeTitle(title) {
  return String(title || '').replace(/\s+-\s+YouTube\s*$/i, '').trim();
}
