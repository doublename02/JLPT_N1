# Kotonoha N1 — 言の葉 N1

A Japanese-language study website for JLPT N1 preparation.

**[Open the study website](https://doublename02.github.io/JLPT_N1/)**

[日本語](README.md) · English · [简体中文](README.zh-CN.md)

## Learning content

| Course | Content |
| --- | --- |
| Kanji | 630 cards with readings, meanings, compounds, Japanese explanations and examples |
| Vocabulary | 1,398 cards covering words, collocations and idiomatic expressions |
| Grammar | 250 cards covering usage, connections, nuances and comparisons |
| Reading | 26 original multiple-choice questions with explanations after submission |
| Listening | 30 original questions using Japanese speech synthesis, with explanations after submission |

Kanji, vocabulary and grammar cards use Japanese explanations and example sentences only. Reading and listening retain Japanese and Chinese explanations. An additional 45 language-knowledge questions bring the full mock exam to 101 questions. Features include bookmarks, mastery tracking, personal notes, backups and custom learning cards imported as JSON.

The full mock exam allows 110 minutes for language knowledge and reading, then 55 minutes for listening. It submits automatically when time expires. In-progress exams remain on the current device; submitted results can sync across devices.

All questions and study notes are original practice material, not official past papers. JLPT does not publish an exhaustive kanji, vocabulary or grammar list, so these 2,278 cards do not guarantee complete coverage. The count includes collocations and grammar comparisons. Listening uses synthesized speech rather than human recordings. Accuracy percentages cannot be converted into official scaled scores or pass/fail results. See [CONTENT.md](CONTENT.md) for the content structure.

## Save your progress to GitHub

Studying does not require signing in. Optional GitHub sync supports two storage modes:

- **Private study repository (default):** creates `JLPT_N1-study-data` under your account and stores personal data without copying the website. Saving stops if an existing repository with that name is public.
- **Public fork:** forks the website into your account and stores data there. Anyone can read your notes, progress and Git history. The upstream owner cannot fork their own repository and should use private storage.

The data file is `.kotonoha/profile-v2.json`. It contains mastery flags, bookmarks, notes and recent revisions, daily activity, submitted exam results, mistakes and custom cards. It never contains GitHub tokens or the OAuth client secret.

Changes save locally immediately and sync approximately 15 seconds after the last edit. Explicit note saves and “sync now” trigger immediate sync. Records merge using per-item timestamps and device identifiers, including deletion markers. Concurrent note edits retain the alternative text in recent revisions. SHA conflicts trigger a reload and merge, with up to three retries.

Uploads stop when offline, permissions are insufficient, a private repository becomes public, or the 4MB limit is exceeded; local data remains available. Each GitHub account has separate local data. Guest records upload only after an explicit import. Tokens stay in page memory, so reloading requires reconnecting. Deleting a note does not remove its earlier Git history.

## Project layout and development

| Path | Purpose |
| --- | --- |
| `docs/` | Static GitHub Pages site, published from `main` → `/docs` |
| `auth-worker/` | Cloudflare Worker that exchanges OAuth authorization codes |
| `wrangler.toml` | Allows deploying the same authentication service from the repository root |
| `test/`, `auth-worker/test/`, `validate.mjs` | Sync, authentication, content and exam checks |

Requires Node.js 22 or later. The tests need no additional dependencies.

```sh
npm test
npm run preview
```

The preview command uses Python's HTTP server at `http://localhost:4173`. GitHub Pages needs no build step.

## Configure GitHub OAuth

This implementation uses a **GitHub OAuth App**, the authorization-code flow and PKCE. A GitHub App ID is a different identifier.

1. Create an OAuth App in [GitHub Developer Settings](https://github.com/settings/developers). For the current site, set both Homepage URL and Authorization callback URL to `https://doublename02.github.io/JLPT_N1/`. Use your own website URL when deploying elsewhere.
2. In both `auth-worker/wrangler.toml` and the root `wrangler.toml`, set `APP_URL` to the exact callback URL, configure the public `GITHUB_CLIENT_ID`, and choose the Worker name.
3. Run `npm install` in `auth-worker/`, sign in to Cloudflare, then run `npx wrangler secret put GITHUB_CLIENT_SECRET` to enter the secret. Never put it in the repository, browser scripts, chat or logs.
4. Run `npm run deploy`. With Cloudflare Git integration, use `auth-worker` as the root directory and `npm run deploy` as the deploy command. Deployment from the repository root is also supported. If `GITHUB_CLIENT_SECRET` exists in the build environment, the deployment script forwards it to the runtime through standard input, without placing it in arguments or files. Do not add `--assets docs`; GitHub Pages hosts the study website.
5. Set `authBaseUrl` in `docs/github-config.js` to the Worker's HTTPS URL and `clientId` to the public client ID, then commit. The current endpoint is `https://jlpt-n1.akiracheah12.workers.dev`.
6. Authorize with a real GitHub account, save a note, and verify it loads on another device. Automated tests do not authorize or write to real accounts.

Private storage requests the OAuth `repo` scope; public forks use `public_repo`. GitHub's `repo` scope is broad, although the application only operates on the user's designated study repository.

### Connect using a fine-grained token

To enforce single-repository access on GitHub itself, create your private `JLPT_N1-study-data` repository with an initial commit. Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) selecting only that repository with Contents read/write access. Enter it in the website's GitHub sync advanced settings. Do not send it to the administrator.

## Migrate from the previous website

Browser storage is not shared across domains. Export a backup from the old website's learning-record page, restore it on this website, then connect GitHub and explicitly import guest records. Existing knowledge-card IDs are preserved.

## References

- [GitHub OAuth authorization flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [GitHub Contents API](https://docs.github.com/en/rest/repos/contents)
- [GitHub Pages publishing settings](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
