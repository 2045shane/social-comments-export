import { DAILY_FREE_EXPORT_LIMIT } from './constants.js';

export function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function storedCount(stored, date) {
  if (!stored || stored.date !== date) return 0;
  const count = Number(stored.count);
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.floor(count);
}

export function readQuota(stored, now = new Date(), limit = DAILY_FREE_EXPORT_LIMIT) {
  const date = localDateKey(now);
  const count = storedCount(stored, date);
  return {
    date,
    count,
    limit,
    remaining: Math.max(0, limit - count),
    allowed: count < limit,
  };
}

export function quotaAfterExport(stored, now = new Date(), limit = DAILY_FREE_EXPORT_LIMIT) {
  const current = readQuota(stored, now, limit);
  if (!current.allowed) {
    return {
      ...current,
      recorded: false,
      stored: { date: current.date, count: current.count },
    };
  }
  const count = current.count + 1;
  return {
    date: current.date,
    count,
    limit,
    remaining: Math.max(0, limit - count),
    allowed: count < limit,
    recorded: true,
    stored: { date: current.date, count },
  };
}
