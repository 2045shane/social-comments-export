# YouTube 公开评论导出

把**当前打开的 YouTube 公开视频或 Shorts**上、已经加载出来的公开评论导出成 CSV。可选情绪分析：你自己粘贴 OpenAI 密钥（BYOK）。免费额度每天 3 次，只记在本机。

Cut：`SOCIAL-COMMENTS-CUT-2026-10-28-v1`

English: a Manifest V3 extension that exports public comments already loaded on the open YouTube video or Short. Sentiment is optional and uses your own OpenAI key. Three free exports per day, counted only in this browser. This cut is not submitted to the Chrome Web Store and has no payment.

## 安装（加载已解压的扩展）

1. 克隆或下载这个仓库，记住含有 `manifest.json` 的文件夹。
2. 打开 Chrome，地址栏输入 `chrome://extensions`。
3. 打开右上角「开发者模式」。
4. 点击「加载已解压的扩展程序」，选中该文件夹。
5. 打开一个 YouTube 公开视频（`https://www.youtube.com/watch?v=…`）或 Shorts。
6. 点击工具栏里的「YouTube 公开评论导出」。默认是中文，可切到 EN。

English: open `chrome://extensions`, turn on Developer mode, choose “Load unpacked”, and select this folder. Then open a public YouTube video or Short and click the toolbar icon.

本切**不上架** Chrome 网上应用店，仓库里也没有商店提交材料。

## 使用

1. 停留在公开视频或 Shorts 页。首页、搜索、频道页不能导出。
2. 看一眼「每天 3 次 · 今日剩余 N 次」和单次滚动上限。
3. 点「导出 CSV」。扩展只会在这一次点击里滚动当前页，把已经出现的公开评论写入文件。
4. 没有密钥也能导出。情绪列写「skipped」，并说明要自备密钥。
5. 密钥在「密钥、权限与联系解锁」里粘贴。保存后输入框会清空，密钥只留在本机。

## CSV 列

列名和顺序固定，见 `src/lib/csv.js` 的 `CSV_COLUMNS`。文件是 UTF-8，带 BOM，方便 Excel 打开中文。示例表头：`docs/sample-columns.csv`（虚构的一行，不是真实导出）。

| 列 | 含义 |
| --- | --- |
| `video_id` | 视频 ID |
| `video_title` | 页面上的标题 |
| `video_url` | 去掉播放列表等多余参数后的视频地址 |
| `author_display_name` | 评论里看见的作者名（YouTube 现在常显示成 @handle） |
| `comment_text` | 已加载的正文 |
| `relative_time` | 页面上的相对时间，例如「6 years ago」「3 小时前」。看不见就空着 |
| `like_count` | 页面上的点赞文案，例如 `12`、`4.8M`。不换成整数，避免把 4.8M 猜成精确数字。看不见就空着 |
| `reply_count` | 页面上的回复文案，例如 `986 replies`。不自动展开回复。看不见就空着 |
| `is_reply` | `yes` / `no`。只有页面上已经展开的回复才会是 `yes` |
| `sentiment` | `positive` / `neutral` / `negative` / `mixed` / `skipped` / `error` |
| `sentiment_note` | 跳过或失败的原因，语言跟界面一致。成功时为空 |
| `exported_at` | 导出时刻，ISO 8601 |
| `export_stop_reason` | 为什么停下：`max_comments`、`max_rounds`、`no_new_comments`、`deadline` |
| `scroll_rounds` | 这一次实际滚动了几轮 |

以 `=`、`+`、`-`、`@` 开头的单元格会加一个前导 `'`，避免表格软件把评论当成公式。

## 滚动上限

数字在 `src/lib/constants.js`，内容脚本里有同样的硬顶：

| 常量 | 值 | 作用 |
| --- | --- | --- |
| `MAX_SCROLL_ROUNDS` / `HARD_MAX_SCROLL_ROUNDS` | 8 | 一次导出最多滚动 8 轮 |
| `MAX_COMMENTS` / `HARD_MAX_COMMENTS` | 200 | 一次最多保留 200 条 |
| `EXPORT_DEADLINE_MS` | 45000 | 45 秒到点就停 |
| `ROUND_TIMEOUT_MS` | 2200 | 每一轮最多再等 2.2 秒 |

先到者为准。没有新评论也会停。扩展**没有**定时器，**没有**后台爬取，打开页面时不会自己滚。不会自动点「查看回复」。

YouTube 会把滚出屏幕的评论从 DOM 里拿掉。扩展按出现顺序记住已经见过的评论，所以不会只剩下最后一屏。

## 情绪分析（BYOK）

- 提供商：**OpenAI**。不能在这个版本里换成别的地址，以免扩展去申请读取任意网站。
- 模型：`gpt-4o-mini`（`SENTIMENT_MODEL`）。
- 分析：`POST https://api.openai.com/v1/chat/completions`
- 测试密钥：`GET https://api.openai.com/v1/models`
- 请求从扩展本身发出，**不经过**扩展作者的服务器，仓库里也没有 Shane 的密钥。
- 只发送评论文本：每条最多 500 字，每次最多 40 条（`MAX_SENTIMENT_COMMENTS`）。不发送作者名、视频标题或地址。
- 超出 40 条的行：`sentiment=skipped`，说明里写明上限。
- 没填密钥，或 OpenAI 拒绝密钥：CSV 仍然导出。没密钥是 `skipped`；请求失败是 `error`，说明里带 HTTP 状态，不带响应正文。

密钥存在 `chrome.storage.local`。卸载扩展会清掉。设置页不回显完整密钥。

## 权限

`manifest.json` 里只有这些：

- `storage`：界面语言、今天用了几次、你的密钥。都在本机。
- `activeTab`：你点开扩展时读取**当前标签**的地址，用来判断是不是视频页。
- 主机：`https://www.youtube.com/*`、`https://m.youtube.com/*`、`https://api.openai.com/*`。

YouTube 主机是因为要在视频页里读取**已经显示出来**的评论。`api.openai.com` 是因为情绪请求要直连 OpenAI，浏览器不允许扩展在没有对应主机权限时发这个请求。没有密钥时不会向 OpenAI 发任何请求。

没有「读取所有网站」，清单里没有 `all_urls`，也不会在 YouTube 和 OpenAI 以外的网站注入脚本。内容脚本只匹配上面的 YouTube 主机，并且 `all_frames` 为 false（不进广告框）。它在 YouTube 上待命，是为了应付站内跳转；不点「导出」就不会滚动。

## 免费次数和联系

常量 `DAILY_FREE_EXPORT_LIMIT = 3`。按**浏览器本地日历日**计数，存在本机，没有服务器配额。成功写出 CSV 才计一次。页面不对、没有评论、评论已关闭，都不计次。

用完以后导出按钮关掉，并显示：

- 有问题请联系我
- 小红书私信「珊哥爱读书」

设置页有许可证输入框。它是占位：**不接入支付，也不校验许可证，填什么都不会加次数。** 输入内容不会被保存，也不会被发送。

## 公开评论和平台条款

- 只处理你正在看的那一条公开视频或 Short 上、页面里已经能看见的评论。
- 不导出私信，不导出要登录才看得到的内容。扩展不登录，页面上没有的字段就不会出现在 CSV 里。
- 不提供绕过登录墙、年龄限制或平台检测的方法。遇到登录/确认身份墙且看不到评论时，会停下来说明，不生成空文件冒充成功。
- 评论是公开的，不代表作者同意你把正文发给 OpenAI，或拿去做再分发。请同时遵守 [YouTube 服务条款](https://www.youtube.com/t/terms) 和你所在地的法律。
- 不做 TikTok、Instagram 或其他平台。不写进 `ai-demos` 或 `geo-checker`。

## 开发

运行时没有依赖。单元测试只用 Node 自带的测试运行器：

```bash
npm test
```

`npm install` 只会装开发用的 `puppeteer-core`（调用本机 Chrome）。扩展本身不用打包。

## 自测

浏览器自测记录在 `docs/SELF-TEST.md`：至少两条公开视频、评论关闭、非 YouTube 页、有密钥 / 无密钥、触顶后的联系文案。截图在 `docs/screenshots/`。
