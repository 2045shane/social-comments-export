# Feature map

Agent map for this extension. YouTube public comments only. Paywall cut: `PLUGIN-PAYWALL-CUT-2026-10-29-v1`.

No product keyboard shortcuts. Language is the `中文` / `EN` pair (`#lang-zh`, `#lang-en`) on both pages. Copy comes from `src/lib/i18n.js`.

## Surfaces

### Popup — `src/popup/popup.html`

Toolbar action. Width 400px. Script: `src/popup/popup.js`.

| DOM | Role |
| --- | --- |
| `#quota-line` `#pips` | Free:「每天 N 次 · 今日剩余 M 次」and N pips. Unlocked: no pips,「已解锁 · 今日不限次数」. |
| `#page-kicker` `#page-title` `#page-detail` | Current tab. Export only for YouTube watch / Shorts. |
| `#limits` | Free line names 8 rounds / 200 comments and the unlocked 40 / 1000. Unlocked line names the paid caps and the free caps. |
| `#sentiment-title` `#sentiment-body` | BYOK status. CSV export does not require a key. |
| `#quota-block` | Hidden until the free daily cap is hit. Then visible. |
| `#quota-title` `#quota-body` | Cap copy. Remaining 0. Says no CSV will be created. |
| `#cta-contact` `#cta-channel` | 「有问题请联系我」and 小红书「珊哥爱读书」. |
| `#license-form` `#license-code` `#license-save` `#license-result` | Paste/save a license. Shown only inside `#quota-block`. |
| `#export` | Starts one export. Disabled when the tab is not a video, quota is blocked, or a run is in progress. |
| `#status` | Progress, success, or the reason no file was written. |
| `#open-options` | Opens the options page. |

### Options — `src/options/options.html`

`options_page`. Script: `src/options/options.js`.

| DOM | Role |
| --- | --- |
| `#byok` `#api-key` `#save-key` `#test-key` `#clear-key` `#key-status` | User's OpenAI key. Not a license. Field clears after save. |
| `#quota-section` `#quota-body` | Free 3/day and both per-export caps, in words. |
| `#license` `#license-state` `#license-code` `#license-save` `#license-clear` `#license-result` | Always visible. Save verifies and stores. Clear drops the license and returns the free tier. |
| `#cta-contact` `#cta-channel` | Same contact lines as the popup. |
| `#perm-storage` and the other `#perm-*` | What `storage`, `activeTab`, and the two hosts do. |
| `#limits-title` `#limits-body` | Free and paid scroll, comment, and time caps. |

### No UI

`src/content/youtube-comments.js` runs on YouTube after a click. It does not render this extension's chrome.

## Modules

| Path | Owns |
| --- | --- |
| `src/lib/constants.js` | `DAILY_FREE_EXPORT_LIMIT` (only assignment), free caps, paid caps (`×5`), `tierCaps`, `STORAGE_KEYS`. |
| `src/lib/quota.js` | Local calendar-day count. `unlocked` skips the daily block and still increments the count. |
| `src/lib/license.js` | Local HMAC check. `verifyLicense` / `issueLicense`. Not an API key and not sent anywhere. |
| `src/lib/csv.js` `src/lib/download.js` | CSV body and the download. Not gated on a license. |
| `src/lib/sentiment.js` | BYOK request to `api.openai.com` only. Not gated on a license. |
| `src/lib/youtube-url.js` | Watch / Shorts / other. |
| `src/background/service-worker.js` | Quota, license, key, sentiment. Re-reads the stored license with `verifyLicense` on every quota read. |
| `src/ui/theme.css` | Shared chrome. Popup and options add their own CSS. |

## Messages

Popup and options talk to the service worker. The content script does not.

| Type | From | Effect |
| --- | --- | --- |
| `QUOTA_STATUS` / `LICENSE_STATUS` | either page | `{ allowed, remaining, limit, unlocked, count, maxComments, maxScrollRounds, exportDeadlineMs }` |
| `SAVE_LICENSE` | popup or options | Empty → `EMPTY`. Invalid → `INVALID` and nothing stored. Valid → `sceLicense` saved, quota payload is unlocked. |
| `CLEAR_LICENSE` | popup or options | Removes `sceLicense`. Today's export count stays. |
| `RECORD_EXPORT` | popup only | After a CSV is written. One success = one count. |
| `SAVE_KEY` / `CLEAR_KEY` / `TEST_KEY` / `KEY_STATUS` | options (status from either) | BYOK key in `sceOpenaiApiKey`. |
| `ANALYZE_SENTIMENT` | popup only | Optional. No key → rows `skipped`, file still saved. |
| `EXPORT_LOADED_COMMENTS` | popup → content script | `limits.maxScrollRounds`, `maxComments`, `deadlineMs`. |
| `EXPORT_PROGRESS` | content script → popup | Scroll count. Ignored by the service worker. |

Storage keys: `sceLang`, `sceQuota` (`{ date, count }`), `sceLicense`, `sceOpenaiApiKey`.

## Quota and license states

Numbers live in `src/lib/constants.js`. Popup uses free caps unless `unlocked` is true; it then sends the paid caps.

| State | Daily | One export | UI |
| --- | --- | --- | --- |
| Free, under the cap | 3 per local day | 8 rounds, 200 comments, 45s | `#quota-line` shows remaining. `#quota-block` hidden. |
| Free, cap hit | remaining 0, `allowed: false` | no run | `#export` disabled. `#quota-block` visible with CTA and license field. No file. |
| Valid license saved | no daily cap; count still increments | 40 rounds, 1000 comments, 150s | `#quota-line` unlocked. `#quota-block` hidden. |
| Invalid paste | unchanged | unchanged | `#license-result` error. Previous license kept. |
| License cleared | free rules apply to the existing count | free caps | If today's count is already 3, the cap block returns. |

Content-script ceilings match the paid caps. Omitted limits fall back to the free caps. A stop writes `export_stop_reason` into the CSV and the popup status.

## Export path

1. Popup checks `QUOTA_STATUS`. Blocked → status text, no `downloadTextFile`.
2. Content script scrolls only for this click.
3. Empty / disabled / consent / wrong page → no file, no `RECORD_EXPORT`.
4. Popup builds CSV, optionally `ANALYZE_SENTIMENT`, then `downloadTextFile`, then `RECORD_EXPORT`.

Sentiment over 40 comments marks the extra rows `skipped`. That cap is not a paid unlock.

## Checks

`npm test` is the hard gate (`.github/workflows/test.yml` on pull requests). Invariants that have already slipped once live in `tests/source-locks.test.js` and `tests/paywall-invariants.test.js`: one daily-limit assignment, license verify-before-save, no license no-op copy, no provider key, no payment SDK, content-script caps match the constants, CSV and sentiment calls stay in the popup.
