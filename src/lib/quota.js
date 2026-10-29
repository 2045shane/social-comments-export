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

export function readQuota(stored, now = new Date(), limit = DAILY_FREE_EXPORT_LIMIT, unlocked = false) {
  const date = localDateKey(now);
  const count = storedCount(stored, date);
  if (unlocked) {
    return {
      date,
      count,
      limit: null,
      remaining: null,
      allowed: true,
      unlocked: true,
    };
  }
  return {
    date,
    count,
    limit,
    remaining: Math.max(0, limit - count),
    allowed: count < limit,
    unlocked: false,
  };
}

export function quotaAfterExport(stored, now = new Date(), limit = DAILY_FREE_EXPORT_LIMIT, unlocked = false) {
  const current = readQuota(stored, now, limit, unlocked);
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
    limit: unlocked ? null : limit,
    remaining: unlocked ? null : Math.max(0, limit - count),
    allowed: unlocked ? true : count < limit,
    unlocked: Boolean(unlocked),
    recorded: true,
    stored: { date: current.date, count },
  };
}
