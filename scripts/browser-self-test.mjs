/**
 * Loads the unpacked extension in system Chrome and exercises the real popup.
 * Writes UI screenshots under docs/screenshots and a redacted summary under
 * test-results/ (gitignored; may contain public comment text).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'docs/screenshots');
const results = path.join(root, 'test-results');
const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome';

const VIDEOS = {
  zoo: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  bunny: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
  kidsCommentsOff: 'https://www.youtube.com/watch?v=XqZsoesa55w',
  short: 'https://www.youtube.com/shorts/TrNDOF0StVo',
  other: 'https://example.com/',
};

fs.mkdirSync(shots, { recursive: true });
fs.mkdirSync(results, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function launch() {
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      `--disable-extensions-except=${root}`,
      `--load-extension=${root}`,
      '--lang=zh-CN',
    ],
    defaultViewport: { width: 1280, height: 900 },
  });
  const worker = await browser.waitForTarget((target) => target.type() === 'service_worker' && target.url().includes('chrome-extension://'));
  const extensionId = new URL(worker.url()).host;
  return { browser, extensionId };
}

async function shot(page, name) {
  const file = path.join(shots, name);
  const body = await page.$('body');
  await (body || page).screenshot({ path: file });
  return file;
}

async function openExtensionPage(browser, extensionId, file, videoPage) {
  const page = await browser.newPage();
  if (videoPage) await videoPage.bringToFront();
  await page.goto(`chrome-extension://${extensionId}/${file}`, { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  await sleep(400);
  return page;
}

async function prepareWatch(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1500);
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    const reject = buttons.find((button) => /reject all|全部拒绝/i.test(button.innerText || ''));
    if (reject) reject.click();
  });
  await sleep(800);
}

function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    if (quoted) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''));
    if (row.some((value) => value !== '')) rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] || ''])));
}

async function exportFromPopup(popup) {
  const downloadDir = fs.mkdtempSync(path.join(results, 'dl-'));
  const client = await popup.createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
  await popup.click('#export');
  const started = Date.now();
  let csvPath = '';
  let status = '';
  while (Date.now() - started < 90000) {
    status = await popup.$eval('#status', (node) => node.textContent || '');
    const files = fs.readdirSync(downloadDir).filter((name) => name.endsWith('.csv'));
    if (files.length) {
      csvPath = path.join(downloadDir, files[0]);
      break;
    }
    if (/不会生成 CSV|No CSV was created/.test(status) && Date.now() - started > 1500) break;
    await sleep(400);
  }
  status = await popup.$eval('#status', (node) => node.textContent || '');
  const quota = await popup.$eval('#quota-line', (node) => node.textContent || '');
  const blocked = await popup.$eval('#quota-block', (node) => !node.hidden);
  return { status, quota, blocked, csvPath, downloadDir };
}

function redact(rows) {
  return {
    count: rows.length,
    stop: rows[0]?.export_stop_reason || '',
    rounds: rows[0]?.scroll_rounds || '',
    sentiments: [...new Set(rows.map((row) => row.sentiment))],
    hasAuthor: rows.some((row) => row.author_display_name),
    hasText: rows.every((row) => row.comment_text),
    hasTime: rows.some((row) => row.relative_time),
    hasLikes: rows.some((row) => row.like_count),
    hasReplies: rows.some((row) => row.reply_count),
    videoId: rows[0]?.video_id || '',
    sample: rows[0]
      ? {
          author: `${rows[0].author_display_name.slice(0, 2)}…`,
          text: `${rows[0].comment_text.slice(0, 12)}…`,
          time: rows[0].relative_time,
          likes: rows[0].like_count,
          replies: rows[0].reply_count,
          sentiment: rows[0].sentiment,
          note: rows[0].sentiment_note,
        }
      : null,
  };
}

const summary = { steps: [] };

const { browser, extensionId } = await launch();
try {
  for (const page of await browser.pages()) {
    if (page.url() === 'about:blank') await page.close().catch(() => {});
  }
  const extensions = await browser.newPage();
  await extensions.goto(`chrome://extensions/?id=${extensionId}`, { waitUntil: 'domcontentloaded' });
  await sleep(800);
  await extensions.screenshot({ path: path.join(shots, 'manifest-permissions.png'), fullPage: true });
  summary.steps.push({ id: 'permissions', extensionId, file: 'docs/screenshots/manifest-permissions.png' });
  await extensions.close();

  const other = await browser.newPage();
  await other.goto(VIDEOS.other, { waitUntil: 'domcontentloaded' });
  const otherPopup = await openExtensionPage(browser, extensionId, 'src/popup/popup.html', other);
  await shot(otherPopup, 'non-youtube.png');
  const otherState = {
    title: await otherPopup.$eval('#page-title', (node) => node.textContent),
    detail: await otherPopup.$eval('#page-detail', (node) => node.textContent),
    disabled: await otherPopup.$eval('#export', (node) => node.disabled),
  };
  summary.steps.push({ id: 'non-youtube', ...otherState });
  await otherPopup.close();
  await other.close();

  const kids = await browser.newPage();
  await prepareWatch(kids, VIDEOS.kidsCommentsOff);
  const kidsPopup = await openExtensionPage(browser, extensionId, 'src/popup/popup.html', kids);
  const kidsResult = await exportFromPopup(kidsPopup);
  await shot(kidsPopup, 'empty-comments.png');
  summary.steps.push({
    id: 'comments-off',
    status: kidsResult.status,
    csv: Boolean(kidsResult.csvPath),
    quota: kidsResult.quota,
  });
  await kidsPopup.close();
  await kids.close();

  const zoo = await browser.newPage();
  await prepareWatch(zoo, VIDEOS.zoo);
  const zooPopup = await openExtensionPage(browser, extensionId, 'src/popup/popup.html', zoo);
  await shot(zooPopup, 'popup-zh.png');
  await zooPopup.click('#lang-en');
  await sleep(300);
  await shot(zooPopup, 'popup-en.png');
  await zooPopup.click('#lang-zh');
  await sleep(300);
  const zooExport = await exportFromPopup(zooPopup);
  await shot(zooPopup, 'export-success.png');
  let zooRows = [];
  if (zooExport.csvPath) zooRows = parseCsv(fs.readFileSync(zooExport.csvPath, 'utf8'));
  summary.steps.push({ id: 'zoo-no-key', status: zooExport.status, quota: zooExport.quota, ...redact(zooRows) });
  await zooPopup.close();
  await zoo.close();

  const shortPage = await browser.newPage();
  await prepareWatch(shortPage, VIDEOS.short);
  const shortPopup = await openExtensionPage(browser, extensionId, 'src/popup/popup.html', shortPage);
  const shortExport = await exportFromPopup(shortPopup);
  let shortRows = [];
  if (shortExport.csvPath) shortRows = parseCsv(fs.readFileSync(shortExport.csvPath, 'utf8'));
  summary.steps.push({
    id: 'short-no-key',
    href: shortPage.url(),
    status: shortExport.status,
    quota: shortExport.quota,
    ...redact(shortRows),
  });
  await shortPopup.close();
  await shortPage.close();

  let secondId = 'bunny-no-key';
  if (shortRows.length > 0) {
    summary.steps.push({ id: 'second-video', used: 'short' });
  } else {
    const bunny = await browser.newPage();
    await prepareWatch(bunny, VIDEOS.bunny);
    const bunnyPopup = await openExtensionPage(browser, extensionId, 'src/popup/popup.html', bunny);
    const bunnyExport = await exportFromPopup(bunnyPopup);
    let bunnyRows = [];
    if (bunnyExport.csvPath) bunnyRows = parseCsv(fs.readFileSync(bunnyExport.csvPath, 'utf8'));
    summary.steps.push({ id: secondId, status: bunnyExport.status, quota: bunnyExport.quota, ...redact(bunnyRows) });
    await bunnyPopup.close();
    await bunny.close();
  }

  const zooAgain = await browser.newPage();
  await prepareWatch(zooAgain, VIDEOS.zoo);
  const options = await openExtensionPage(browser, extensionId, 'src/options/options.html', zooAgain);
  await options.type('#api-key', 'rejected-byok-placeholder');
  await options.click('#save-key');
  await sleep(200);
  await options.click('#test-key');
  await sleep(4000);
  await options.type('#license-code', 'not-a-license');
  await options.click('#license-check');
  await sleep(300);
  await options.screenshot({ path: path.join(shots, 'byok-settings.png'), fullPage: true });
  const byok = {
    keyState: await options.$eval('#key-state', (node) => node.textContent),
    permState: await options.$eval('#perm-state', (node) => node.textContent),
    keyStatus: await options.$eval('#key-status', (node) => node.textContent),
    license: await options.$eval('#license-result', (node) => node.textContent),
    licenseLeft: await options.$eval('#license-code', (node) => node.value),
  };
  summary.steps.push({ id: 'byok', ...byok });
  await options.close();

  const keyedPopup = await openExtensionPage(browser, extensionId, 'src/popup/popup.html', zooAgain);
  const keyedExport = await exportFromPopup(keyedPopup);
  let keyedRows = [];
  if (keyedExport.csvPath) keyedRows = parseCsv(fs.readFileSync(keyedExport.csvPath, 'utf8'));
  summary.steps.push({ id: 'zoo-with-key', status: keyedExport.status, quota: keyedExport.quota, ...redact(keyedRows) });
  await keyedPopup.close();

  const blockedPopup = await openExtensionPage(browser, extensionId, 'src/popup/popup.html', zooAgain);
  await sleep(500);
  await shot(blockedPopup, 'quota-cta.png');
  const before = await blockedPopup.$eval('#status', (node) => node.textContent || '');
  const exportDisabled = await blockedPopup.$eval('#export', (node) => node.disabled);
  await blockedPopup.click('#export').catch(() => {});
  await sleep(800);
  const after = await blockedPopup.$eval('#status', (node) => node.textContent || '');
  const cta = await blockedPopup.$eval('#quota-block', (node) => node.innerText);
  summary.steps.push({
    id: 'quota-cta',
    exportDisabled,
    before,
    after,
    cta,
  });
  await blockedPopup.close();
  await zooAgain.close();
} finally {
  fs.writeFileSync(path.join(results, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
}
