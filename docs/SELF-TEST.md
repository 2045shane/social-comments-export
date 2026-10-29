# 自测记录

## PLUGIN-PAYWALL-CUT-2026-10-29-v1

`npm test`：24 项通过。免费档第 4 次被挡住；解锁后第 4 次仍记次且允许继续；清除解锁后，若当天已满 3 次则回到剩余 0。付费单次上限是免费的 5 倍（40 轮、1000 条），日次数不限。内容脚本硬顶与这两个付费数字一致，省略参数时回落到 8 轮 / 200 条。

Chrome 156 加载未打包扩展后再打开弹窗和设置页（临时配置，不在 YouTube 视频页上，所以导出按钮保持禁用，没有下载文件）：

| 步骤 | 结果 |
| --- | --- |
| 免费档，当天 0 次 | 文案「每天 3 次 · 今日剩余 3 次」。单次说明写明免费 8 轮 / 200 条，解锁后 40 轮 / 1000 条。 |
| 把本机今日次数写成 3 | 剩余 0。导出按钮禁用。出现「有问题请联系我」、小红书「珊哥爱读书」和许可证输入框。文案写明这次不会生成 CSV。 |
| 粘贴 `not-a-real-license` | 「许可证无效，没有开通。……珊哥爱读书」。仍然剩余 0，按钮仍禁用。 |
| 粘贴有效许可证 | 「已解锁 · 今日不限次数（今日已导出 3 次）」。单次上限变为 40 轮、1000 条。触顶卡片收起。 |
| 设置页点「清除许可证」 | 许可证从本机存储消失。今日已导出的 3 次还在。弹窗回到「今日剩余 0 次」和联系文案。 |

截图：`docs/screenshots/paywall-free-remaining.png`、`paywall-hit-cap.png`、`paywall-invalid-license.png`、`paywall-unlocked.png`、`paywall-options-unlocked.png`、`paywall-cleared.png`。

源码检索（排除 `node_modules`）：没有 `sk-` 开头的密钥，没有 `shane_api_key` 一类字样。`tests/source-locks.test.js` 里出现的 `sk-proj-` 是断言用的正则文本，不是密钥。`package.json` 没有支付 SDK。

这次没有在真实 YouTube 页面上滚到 1000 条。解锁后弹窗会把 40 / 1000 / 150 秒传给内容脚本；内容脚本里的硬顶就是这组数字。

## SOCIAL-COMMENTS-CUT-2026-10-28-v1

Cut：`SOCIAL-COMMENTS-CUT-2026-10-28-v1`

浏览器：本机 Google Chrome。扩展用「加载未打包」的同一套清单装进一个临时配置。界面默认中文。没有把评论全文写进这个文件。

`npm test`：19 项通过（配额跨日、CSV 转义、地址判断、情绪请求只打向 `api.openai.com`、清单没有 `all_urls`）。

## 公开视频

| 页面 | 结果 |
| --- | --- |
| `https://www.youtube.com/watch?v=jNQXAC9IVRw`（Me at the zoo） | 180 条。停止原因 `max_rounds`，滚动 8/8。作者、正文、相对时间、点赞文案、回复文案都有。无密钥时 `sentiment=skipped`。 |
| `https://www.youtube.com/shorts/TrNDOF0StVo` | 20 条。停止原因 `no_new_comments`，滚动 1/8。字段同上。视频 ID 列为 `TrNDOF0StVo`。 |

两条都写出了 CSV，没有把密钥写进文件。以 `@` 开头的作者名前面加了 `'`，避免表格软件把单元格当成公式。

zoo 这一条在第二次导出时带了一个**无效占位密钥**（不是任何人的真实密钥）。OpenAI 返回 HTTP 401。180 行里前 40 行是 `sentiment=error`，说明为「OpenAI 请求失败（HTTP 401）。情绪未写入。」后 140 行是 `skipped`（超过每次 40 条的上限）。CSV 仍然保存。

成功标签怎么写进行，由单元测试用假的 200 响应覆盖：`positive` 等标签会进对应行。这次浏览器自测没有使用任何真实密钥。

## 评论关闭

`https://www.youtube.com/watch?v=XqZsoesa55w` 页面显示评论已关闭。弹窗文案：「这条视频的评论已关闭。这次不会生成 CSV。」没有下载文件。当时剩余次数仍是 3，失败不计次。这条是儿童向视频，自测只确认关闭提示，没有导出评论。

## 非 YouTube

打开 `https://example.com/` 再点扩展。按钮是灰的。文案：「请先打开 YouTube 视频……这次不会生成 CSV。」没有下载文件。

## 配额

三次成功导出之后，剩余 0 次。按钮禁用。文案是：

- 今日免费次数已用完
- 每天 3 次，今天已经用完（3/3）。这次不会生成 CSV。
- 有问题请联系我
- 小红书私信「珊哥爱读书」

在禁用按钮上再点一次，状态栏没有开始新的导出。

## 截图

- `docs/screenshots/popup-zh.png`
- `docs/screenshots/popup-en.png`
- `docs/screenshots/export-success.png`
- `docs/screenshots/quota-cta.png`
- `docs/screenshots/manifest-permissions.png`
- `docs/screenshots/byok-settings.png`
- `docs/screenshots/empty-comments.png`
- `docs/screenshots/non-youtube.png`

权限页列出的站点只有 `https://www.youtube.com/*`、`https://m.youtube.com/*`、`https://api.openai.com/*`。
