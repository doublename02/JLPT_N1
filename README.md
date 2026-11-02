# 言の葉 N1 — GitHub Pages 版

网站：[https://doublename02.github.io/JLPT_N1/](https://doublename02.github.io/JLPT_N1/)

全日文界面，含 2,278 张中日双语知识卡、日文例句、101 道原创模考题、计时考试、个人笔记及学习记录。

## 部署结构

- `docs/`：GitHub Pages 静态网站。Pages 设置为从 `main` 分支的 `/docs` 发布；包含 `.nojekyll`，无需构建。
- `auth-worker/`：GitHub OAuth 授权码交换服务，可部署到 Cloudflare Workers。它只交换授权码，不保存笔记、学习记录或用户令牌。
- 根目录的 `wrangler.toml` 同样指向登录服务，Worker 名称与实际部署 `jlpt-n1` 一致。因此 Cloudflare 的 Root directory 留空或设为 `auth-worker` 均可部署登录服务，部署命令使用 `npx wrangler deploy`。不要添加 `--assets docs`，学习网站已由 GitHub Pages 发布。
- `test/`、`validate.mjs`：数据合并、GitHub 同步、账号隔离、授权校验及原有模考功能检查。

网站学习功能不要求登录。标准 GitHub OAuth 登录需要配置自己的 OAuth App 和回调服务；未配置时页面会明确显示“管理者の設定待ち”。也提供用户自行输入限定访问令牌的高级连接方式，不使用他人的 OAuth Client ID 代替自己的应用。

## 个人数据保存方式

默认推荐：用户连接 GitHub 后，在自己的账户中创建 **私有** `JLPT_N1-study-data` 仓库，只保存个人数据。不会复制教材代码。已经存在同名公开仓库时会停止，绝不自动将私人笔记写入公开仓库。

可选：把 `doublename02/JLPT_N1` fork 到自己的账户，在 Fork 的 `.kotonoha/profile-v2.json` 中保存。用户必须明确选择公开模式，界面会说明 **笔记、进度和 Git 历史均可被他人读取**。网站原作者不能 fork 自己的仓库，需使用私有学习仓库。

数据文件固定为 `.kotonoha/profile-v2.json`，包括：

- 已掌握的知识、收藏、个人笔记与最近修改版本。
- 每天的学习足迹、已提交的试卷结果、错题及用户自行增加的教材。
- 不含 GitHub 令牌、OAuth Secret 或私钥。

每次修改先立即保存到本机，再在约 15 秒无新修改后提交 GitHub。点击“メモを保存”或“今すぐ同期”会立即同步。进行中的计时试卷留在当前设备，交卷结果才同步；避免另一设备的保存中断正在播放的听力和考试。

使用每项修改时间和设备标记合并记录，删除掌握状态/收藏会同步删除标记。笔记保留最近修改版本，可在卡片中查看与恢复；同一条笔记同时编辑时显示确定的最新版本，另一个文本仍保留在最近版本中。GitHub SHA 冲突会重新读取并合并，最多重试三次。断网、权限不足、私有仓库变成公开、容量超过 4MB 时会停止上传并保留端末记录。

不同 GitHub 用户使用不同的本地缓存；未登录记录不会自动上传到任何账户，需用户点击“未ログイン時の記録を取り込む”。访问令牌仅保存在当前页面的内存中，刷新或退出后需要重新连接。缓存记录不会因退出登录被删除。GitHub 本身的 Git 历史仍可能保留旧文本，删除笔记不等于清除 Git 历史。

## 配置标准 GitHub OAuth 登录

此实现使用 **GitHub OAuth App** 的授权码流程和 PKCE。GitHub App 的安装流程及权限与 OAuth App 不同，不应直接把 GitHub App ID 当作本配置使用。

1. 在 [GitHub Developer Settings](https://github.com/settings/developers) 配置 OAuth App：
   - Homepage URL：`https://doublename02.github.io/JLPT_N1/`
   - Authorization callback URL：`https://doublename02.github.io/JLPT_N1/`
   - 关闭该回调地址的 wildcard matching；不需要 Device Flow。
2. `auth-worker/wrangler.toml` 的 `APP_URL` 必须与上面的回调地址完全相同。填入公开的 `GITHUB_CLIENT_ID`。
3. 在 `auth-worker/` 执行 `npm install`，登录自己的 Cloudflare，然后执行 `npx wrangler secret put GITHUB_CLIENT_SECRET`，按提示在本机输入 Secret。**不要把 Secret 写到仓库、网页脚本、聊天或提交记录中。**
4. 执行 `npx wrangler deploy`，取得实际 Worker HTTPS 地址。
5. 编辑 `docs/github-config.js`：将 `authBaseUrl` 设为实际 Worker 地址，`clientId` 设为公开 Client ID。提交到 GitHub 后 Pages 会更新。
6. 用测试 GitHub 账号完成登录，在自己的私有学习仓库保存一条笔记，再换设备登录确认能读回。当前仓库的自动测试验证交换与同步协议；正式 OAuth 必须在真实 App/Worker 凭据配置后验收。

标准 OAuth 的私有仓库模式请求 `repo` 权限，公开 Fork 模式请求 `public_repo` 权限。GitHub OAuth 的 `repo` 权限本身较宽，本应用代码仅操作用户自己的固定学习仓库。如希望在 GitHub 侧严格限定单个仓库，请使用下述限定令牌方式。

### 限定令牌方式

用户先创建自己的私有 `JLPT_N1-study-data` 仓库并创建初始提交，再在 [Fine-grained personal access tokens](https://github.com/settings/personal-access-tokens/new) 中仅选择该仓库，允许 Contents 读写。网站“GitHub 同期 → 詳細設定”支持输入该令牌并验证 GitHub 身份。它不是标准 OAuth 一键登录的替代部署凭据，不应让用户把令牌提交给管理员。

## 从原网站迁移进度

浏览器不会跨域共享本地记录。请在原网站的“学習記録”导出备份，在本网站恢复，再连接自己的 GitHub 并选择导入未登录记录。原有知识卡 ID 保持不变。

## 开发与验证

需要 Node.js 22 或更新版本。测试无额外依赖：

```sh
npm test
```

本地预览：`python -m http.server 4173 --directory docs`。

知识库范围说明见 [CONTENT.md](CONTENT.md)。全部题目为原创练习，听力为端末日语合成语音，非官方真题或真人录音。知识卡数量包含搭配与辨析，不代表全部 N1 考点。

## 官方参考

- [GitHub OAuth 授权流程](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [GitHub 文件读写 API](https://docs.github.com/en/rest/repos/contents)
- [GitHub Pages 发布设置](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
