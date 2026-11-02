# 言の葉 N1

日本語で学ぶ、JLPT N1対策の学習サイト。

**[学習サイトを開く](https://doublename02.github.io/JLPT_N1/)**

日本語 · [English](README.en.md) · [简体中文](README.zh-CN.md)

## 学べること

| コース | 収録内容 |
| --- | --- |
| 文字 | 630項目。漢字の読み・意味・熟語、日本語解説と例文 |
| 語彙 | 1,398項目。単語・連語・慣用表現、日本語解説と例文 |
| 文法 | 250項目。接続・ニュアンス・文型比較、日本語解説と例文 |
| 読解 | オリジナル模擬問題26問、選択式の解答と提出後の解説 |
| 聴解 | オリジナル模擬問題30問、端末の日本語合成音声と提出後の解説 |

文字・語彙・文法の知識カードは日本語のみで学ぶ構成です。読解・聴解には日本語と中国語の解説があります。文字・語彙・文法45問を加えた全101問の模擬試験、しおり、習得記録、個人メモ、バックアップ、JSON教材の追加に対応します。

通し模試は文字・語彙・文法・読解を合わせて110分、聴解を55分で計時し、時間切れで自動提出されます。進行中の試験は現在の端末に保存し、提出済みの結果を同期します。

本教材は独自の練習教材で、公式の過去問ではありません。JLPTは漢字・語彙・文法の網羅リストを公開しておらず、2,278項目は全出題範囲の保証ではありません。項目数には連語と文型比較も含みます。音声は合成音声であり、正答率を公式の尺度得点や合否へ換算することはできません。詳しくは [CONTENT.md](CONTENT.md) を参照してください。

## GitHubに学習記録を保存する

ログインせずに学習できます。任意のGitHub連携では保存先を選べます。

- **非公開の学習用リポジトリ（既定）**：自分のアカウントに `JLPT_N1-study-data` を作成し、個人データだけを保存します。同名の公開リポジトリがある場合は保存を停止します。
- **公開Fork**：自分のアカウントにサイトをForkして保存します。メモ・進度・Gitの履歴は誰でも読めます。サイトの所有者は自分のリポジトリをForkできないため、非公開方式を利用してください。

保存先は `.kotonoha/profile-v2.json` です。習得・しおり・メモと最近の版、学習記録、提出済みの試験結果、間違えた問題、追加教材を含み、トークンやOAuth Secretは含みません。

変更は端末に即時保存され、最後の変更から約15秒後にGitHubへ送信されます。「メモを保存」「今すぐ同期」は即時同期します。複数端末の変更は項目ごとの日時と端末識別子で統合し、削除状態も同期します。同時編集されたメモの別の本文は最近の版に残ります。保存競合時は再取得・統合して最大3回再試行します。

オフライン、権限不足、保存先の公開化、4MBの上限超過では送信を止め、端末の記録を保持します。アカウントごとに端末内データを分け、未ログイン時の記録は明示的に取り込むまでアップロードしません。トークンはページのメモリー内にのみ保持し、再読み込み後は再接続が必要です。メモを削除してもGitの過去の履歴は消えません。

## 配置と開発

| パス | 用途 |
| --- | --- |
| `docs/` | GitHub Pagesの静的サイト。`main` の `/docs` から公開 |
| `auth-worker/` | Cloudflare WorkersのOAuthコード交換サービス |
| `wrangler.toml` | ルートからも同じログインサービスを配置する設定 |
| `test/`・`auth-worker/test/`・`validate.mjs` | 同期・認証・教材・試験の検証 |

Node.js 22以降が必要です。テスト自体には追加依存関係がありません。

```sh
npm test
npm run preview
```

プレビューはPythonのHTTPサーバーを使用し、`http://localhost:4173` で開けます。GitHub Pagesはビルド不要です。

## OAuthログインの設定

この実装は **GitHub OAuth App** の認可コードフローとPKCEを使用します。GitHub AppのIDとは異なります。

1. [GitHub Developer Settings](https://github.com/settings/developers) でOAuth Appを作成します。現在のサイトではHomepage URLとAuthorization callback URLをともに `https://doublename02.github.io/JLPT_N1/` に設定します。別の場所に公開する場合は、そのサイトのURLに置き換えてください。
2. `auth-worker/wrangler.toml` とルートの `wrangler.toml` の `APP_URL` をコールバックURLに合わせ、公開の `GITHUB_CLIENT_ID` とWorker名を設定します。
3. `auth-worker/` で `npm install` を実行してCloudflareにログインし、`npx wrangler secret put GITHUB_CLIENT_SECRET` でSecretを登録します。Secretをリポジトリ、ブラウザースクリプト、チャット、ログに書かないでください。
4. `npm run deploy` で配置します。CloudflareのGit連携ではRoot directoryを `auth-worker`、Deploy commandを `npm run deploy` にできます。ルートからの配置にも対応します。構築環境に `GITHUB_CLIENT_SECRET` があれば、配置スクリプトが標準入力で実行環境に登録し、引数やファイルには書きません。静的サイトはPagesで公開するため、`--assets docs` は追加しません。
5. `docs/github-config.js` の `authBaseUrl` をWorkerのHTTPS URL、`clientId` を公開Client IDに設定してコミットします。現在の接続先は `https://jlpt-n1.akiracheah12.workers.dev` です。
6. 実際のアカウントで認可し、メモの保存と別端末からの読み込みを確認します。自動テストでは実際のアカウントへの認可・書き込みは行いません。

非公開方式のOAuthスコープは `repo`、公開Fork方式は `public_repo` です。OAuthの `repo` は広い権限ですが、アプリの実装は本人の学習用保存先だけを操作します。

### 限定トークンで接続する

GitHub側でも単一リポジトリに制限したい場合は、自分の非公開 `JLPT_N1-study-data` リポジトリを初期コミット付きで作成します。[Fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) でそのリポジトリだけを選択し、Contentsの読み書きを許可してください。サイトの「GitHub 同期 → 詳細設定」で入力します。管理者にトークンを送る必要はありません。

## 以前のサイトから移行する

ブラウザーの記録はドメイン間で共有されません。以前のサイトの「学習記録」でバックアップを出力し、このサイトで復元します。その後GitHubに接続し、未ログイン時の記録を取り込んでください。既存の知識カードIDは維持しています。

## 参考資料

- [GitHub OAuthの認可フロー](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [GitHub Contents API](https://docs.github.com/en/rest/repos/contents)
- [GitHub Pagesの公開設定](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
