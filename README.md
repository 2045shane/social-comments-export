# YouTube 公开评论导出

把**当前打开的 YouTube 公开视频或 Shorts**上、已经加载出来的公开评论导出成 CSV。可选情绪分析：你自己粘贴 OpenAI 密钥（BYOK）。免费档每天 3 次，另有单次条数和滚动上限；粘贴许可证可以在本机提高这两项。次数只记在本机。

功能范围仍是 `SOCIAL-COMMENTS-CUT-2026-10-28-v1`（仅 YouTube 公开评论）。收费说明属于 `PLUGIN-PAYWALL-CUT-2026-10-29-v1`。

English: a Manifest V3 extension that exports public comments already loaded on the open YouTube video or Short. Sentiment is optional and uses your own OpenAI key. The free tier is three exports per local day, plus a per-export cap. Pasting a license raises those caps on this device. This cut is not a Chrome Web Store paid listing and has no payment SDK.

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
2. 看一眼「每天 3 次 · 今日剩余 N 次」和单次上限（免费档 8 轮 / 200 条，解锁后 40 轮 / 1000 条）。
3. 点「导出 CSV」。扩展只会在这一次点击里滚动当前页，把已经出现的公开评论写入文件。CSV 导出本身不锁进付费。
4. 没有密钥也能导出。情绪列写「skipped」，并说明要自备密钥。情绪分析继续 BYOK，不锁进付费。
5. 密钥在「密钥、权限与联系解锁」里粘贴。保存后输入框会清空，密钥只留在本机。
6. 免费次数用完后按钮会关掉，剩余显示 0，并出现许可证输入框。也可以先到设置页粘贴许可证。

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

免费档数字是 `MAX_SCROLL_ROUNDS` 和 `MAX_COMMENTS`。解锁后用 `PAID_MAX_SCROLL_ROUNDS` 和 `PAID_MAX_COMMENTS`（各为免费档的 5 倍）。内容脚本硬顶 `HARD_MAX_*` 等于付费档，避免单次超过解锁上限；没传数字时回落到免费档，不会静默放宽。

| 常量 | 免费档 | 解锁后 | 作用 |
| --- | --- | --- | --- |
| `DAILY_FREE_EXPORT_LIMIT` | 3 | 今日不限次数 | 只计成功写出的 CSV |
| `MAX_SCROLL_ROUNDS` / `PAID_MAX_SCROLL_ROUNDS` | 8 | 40（8×5） | 一次导出最多滚动这么多轮 |
| `MAX_COMMENTS` / `PAID_MAX_COMMENTS` | 200 | 1000（200×5） | 一次最多保留这么多条 |
| `EXPORT_DEADLINE_MS` / `PAID_EXPORT_DEADLINE_MS` | 45000（45 秒） | 150000（150 秒） | 到点就停，原因写进 CSV 和弹窗 |
| `ROUND_TIMEOUT_MS` | 3200 | 3200 | 每一轮最多再等 3.2 秒 |

本切选择「付费单次上限 = 免费 ×5」，不是「本机无硬顶」。40 轮和 1000 条就是设备上的硬顶。

先到者为准。没有新评论也会停。扩展**没有**定时器，**没有**后台爬取，打开页面时不会自己滚。不会自动点「查看回复」。停在条数、轮数或时间上限时，弹窗和 CSV 的 `export_stop_reason` 都会写明原因，不会假装已经导出全部评论。

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

常量 `DAILY_FREE_EXPORT_LIMIT = 3`（只在 `src/lib/constants.js` 写这一处）。按**浏览器本地日历日**计数，存在本机，没有服务器配额。成功写出 CSV 才计一次。页面不对、没有评论、评论已关闭，都不计次。

弹窗主路径会显示「每天 3 次 · 今日剩余 N 次」，以及免费档单次 8 轮 / 200 条、解锁后 40 轮 / 1000 条。

用完以后导出按钮关掉，剩余显示 0，**不会**生成空的 CSV 冒充成功，并显示：

- 有问题请联系我
- 小红书私信「珊哥爱读书」
- 许可证输入框（弹窗触顶时，以及设置页）

解锁有两条路，本机生效，不经过商店付款：

1. 粘贴有效许可证并保存。今日次数不再受限，单次上限改为 40 轮、1000 条。
2. 小红书私信「珊哥爱读书」领取许可证，或询问使用问题。

清除许可证后回到免费档。当天已经成功导出的次数还在：满 3 次会再次被挡住，剩余显示 0。无效许可证不会保存，界面会说明它无效。

本切**没有** Chrome 网上应用店付费上架，**没有**支付 SDK，**没有**服务器计费或配额。CSV 导出和 BYOK 情绪分析都不锁进付费。仓库里没有 Shane 的 API 密钥。

## 公开评论和平台条款

- 只处理你正在看的那一条公开视频或 Short 上、页面里已经能看见的评论。
- 不导出私信，不导出要登录才看得到的内容。扩展不登录，页面上没有的字段就不会出现在 CSV 里。
- 不提供绕过登录墙、年龄限制或平台检测的方法。遇到登录/确认身份墙且看不到评论时，会停下来说明，不生成空文件冒充成功。
- 评论是公开的，不代表作者同意你把正文发给 OpenAI，或拿去做再分发。请同时遵守 [YouTube 服务条款](https://www.youtube.com/t/terms) 和你所在地的法律。
- 不做 TikTok、Instagram 或其他平台。不写进 `ai-demos` 或 `geo-checker`。

## 开发

界面和模块地图（含配额、许可证、触顶）：`docs/FEATURE-MAP.md`。

运行时没有依赖。单元测试只用 Node 自带的测试运行器。提交前跑这一条，通过才能交：

```bash
npm test
```

同一条命令在 `.github/workflows/test.yml` 里对 pull request 再跑一遍。重复出现过的限制（每日次数只赋值一处、许可证必须先校验再保存、不把 CSV / BYOK 锁进付费、不写支付 SDK 和密钥）在 `tests/paywall-invariants.test.js` 和 `tests/source-locks.test.js`，失败即红。

`npm install` 只会装开发用的 `puppeteer-core`（调用本机 Chrome）。扩展本身不用打包。

## 自测

浏览器自测记录在 `docs/SELF-TEST.md`：至少两条公开视频、评论关闭、非 YouTube 页、有密钥 / 无密钥、触顶后的联系文案。截图在 `docs/screenshots/`。
