# 自测记录

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
