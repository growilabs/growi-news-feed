# growi-news-feed

GROWI の InAppNotification パネルに配信するニュースフィード。

GROWI 各インスタンスは環境変数 `NEWS_FEED_URL` で以下の URL を参照し、cron で定期取得する:

```
https://growilabs.github.io/growi-news-feed/feed.json
```

## ニュースの追加方法

### 1. `feed.json` の `items` に新規エントリを追加する PR を作成

最小構成の例（日本語だけ記入、他言語は bot が補完）:

```json
{
  "id": "release-v7-5-0",
  "type": "release",
  "emoji": "🚀",
  "title": {
    "ja_JP": "GROWI v7.5.0 がリリースされました"
  },
  "body": {
    "ja_JP": "新機能とバグ修正を含むリリースです。詳細は Release Notes をご確認ください。"
  },
  "url": "https://github.com/growilabs/growi/releases/tag/v7.5.0",
  "publishedAt": "2026-04-24T00:00:00Z"
}
```

### 2. 最低限必須のフィールド

| フィールド | 内容 |
|---|---|
| `id` | 一意の識別子。**一度決めたらマージ後は変更不可** → [注意点 #1](#1-itemsid-は一度決めたら変更しない) |
| `title.ja_JP` | 日本語原文 |
| `publishedAt` | ISO 8601 形式の公開日時（例: `2026-04-24T00:00:00Z`） |

その他（`type`, `emoji`, `body`, `url`, `conditions`）は用途に応じて任意。詳細は [フィードスキーマ](#フィードスキーマ) 表を参照。

### 3. 翻訳は `ja_JP` だけ書けば OK

他言語（`en_US`, `zh_CN`, `fr_FR`, `ko_KR`）は空欄で PR を出せば、`translate.yml` が OpenAI API で自動補完して **同 PR にコミットバック**する。

- 手動で書いたロケールキーは bot が**絶対に上書きしない**ので、一部だけ手動翻訳するのも可 → [注意点 #3](#3-手動で書いた翻訳は-bot-が上書きしない)
- どうしても英語で起案したい場合は `en_US` だけ記入すれば `ja_JP` を含む他言語に展開される → [注意点 #2](#2-原文は-ja_jp-で書く)

### 4. レビュー & マージ

`validate.yml` が JSON Schema で自動検証するので、必須フィールド不足や型エラーはここで検知される。通ればレビュアーの承認後にマージ。

### 5. マージ後は自動デプロイ

`pages.yml` が `main` への push をトリガーに GitHub Pages へデプロイする。数分で `https://growilabs.github.io/growi-news-feed/feed.json` に反映され、各 GROWI インスタンスの次回 cron 実行で取得される。

## フィードスキーマ

`schema/feed.schema.json` を参照。主要フィールド:

| フィールド | 必須 | 説明 |
|---|---|---|
| `id` | ✅ | 一意の識別子（変更不可） |
| `type` | | `release` / `security` / `tips` / `maintenance` / `announcement` |
| `emoji` | | 表示アイコン（未設定時は 📢 がフォールバック） |
| `title` | ✅ | `{ ja_JP, en_US, ... }` 多言語オブジェクト（`ja_JP` 必須） |
| `body` | | 多言語本文 |
| `url` | | 詳細ページ URL（未設定ならパネル内完結） |
| `publishedAt` | ✅ | ISO 8601 |
| `conditions.targetRoles` | | `["admin"]` `["general"]` 等。未設定で全ユーザー |
| `conditions.growiVersionRegExps` | | `["^7\\.5\\..*"]` 等。未設定で全バージョン |

詳細仕様は growi 本体側の [news-feed-delivery-spec.md](https://github.com/growilabs/growi/blob/master/tmp/news-feed-delivery-spec.md) を参照。

## Workflows

| Workflow | Trigger | 役割 |
|---|---|---|
| `validate.yml` | PR（`feed.json` or `schema/**` 変更時） | JSON Schema で `feed.json` を検証 |
| `translate.yml` | PR（`feed.json` 変更時） | 未入力ロケールを OpenAI API で自動補完、同 PR にコミットバック |
| `pages.yml` | push to `main` | GitHub Pages に `feed.json` + `schema/` をデプロイ |

## 共同編集・運用時の注意点

概要:

| # | カテゴリ | ルール |
|---|---|---|
| 1 | 編集 | [`items[].id` は一度決めたら変更しない](#1-itemsid-は一度決めたら変更しない) |
| 2 | 編集 | [原文は `ja_JP` で書く](#2-原文は-ja_jp-で書く) |
| 3 | 編集 | [手動で書いた翻訳は bot が上書きしない](#3-手動で書いた翻訳は-bot-が上書きしない) |
| 4 | 構造 | [フィードは単一 `feed.json` に集約](#4-フィードは単一-feedjson-に集約) |
| 5 | 公開 | [Pages が公開するのは `feed.json` と `schema/` のみ](#5-pages-が公開するのは-feedjson-と-schema-のみ) |
| 6 | Workflow | [外部（fork）PR では `translate.yml` が動かない](#6-外部fork-pr-では-translateyml-が動かない) |
| 7 | Workflow | [`validate.yml` は main への push でも走る](#7-validateyml-は-main-への-push-でも走る) |
| 8 | カスタマイズ | [翻訳モデルは環境変数で切り替え可能](#8-翻訳モデルは環境変数で切り替え可能) |

---

### 1. `items[].id` は一度決めたら変更しない

GROWI 側は `id` を `externalId` として重複排除・既読管理に使う。マージ後に `id` を変えると、そのニュースを既読にしていた**全ユーザーの既読状態がリセット**され、「未読」として再表示されてしまう。

> **運用**: マージ後に typo 等に気付いた場合は `id` を修正せず、「新しい `id` で作り直し + 旧 `id` エントリを削除」で対処する。

### 2. 原文は `ja_JP` で書く

`scripts/translate.mjs` の source locale 選定は `ja_JP` → `en_US` → その他入力済みキーの順で優先される。

> **運用**: 原則 `ja_JP` のみ記入で PR を出せば、bot が `en_US` / `zh_CN` / `fr_FR` / `ko_KR` を自動補完する。英語で起案したい場合は `en_US` のみ記入で OK（`ja_JP` を含む他言語に展開される）。

### 3. 手動で書いた翻訳は bot が上書きしない

`scripts/translate.mjs` は **既に値が入っているロケールキーには一切触らない**。推敲した文面がワークフローで書き換わる心配はない。

> **運用**: 翻訳品質に不満がある場合は、該当ロケールキーを直接編集して PR を出す。bot はそのキーを保持する。

### 4. フィードは単一 `feed.json` に集約

ロケール別や `type` 別にファイル分割はしない。全ニュース・全ロケールを常に `feed.json` 単体に保持する。

> **理由**: GROWI 本体は単一 URL の fetch のみで完結する設計。分割対応は本体側の cron / モデル設計変更を伴うため、必要性が出たら本体側も含めて再設計する。

### 5. Pages が公開するのは `feed.json` と `schema/` のみ

`pages.yml` は `_site/` にこの 2 つだけをコピーしてから Pages にデプロイする。`.github/`, `scripts/`, `package.json`, `README.md`, `node_modules/` は公開 URL には出ない。

> **注意**: ただし **Git 履歴自体は Public 化後に全世界に公開される**。クレデンシャル等のコミットは通常どおり厳禁。

### 6. 外部（fork）PR では `translate.yml` が動かない

GitHub の仕様上、fork からの PR には secrets（`OPENAI_API_KEY`）が渡らないため、workflow 側で明示的にスキップしている。

> **運用**: 外部コントリビュータから PR が来た場合、メンテナが手元で `npm run translate` を実行して上書きコミットする。外部 PR は想定薄だが仕様として認識しておく。

### 7. `validate.yml` は main への push でも走る

PR 時だけでなく `main` push 時も検証するのは、`translate.yml` の bot コミットの後段でもう一度 JSON Schema を通すため。翻訳生成バグで壊れた `feed.json` が `pages.yml` で本番デプロイされる前に検知できる二重防御。

### 8. 翻訳モデルは環境変数で切り替え可能

デフォルトは `gpt-4o-mini`。環境変数 `OPENAI_MODEL` で上書きできる。

> **例**: `translate.yml` の `env:` に `OPENAI_MODEL: gpt-4o` を追加すると、より高品質だが高コストのモデルに切り替わる。コスト／品質のトレードオフで調整する。

## Secrets

| 名前 | 用途 |
|---|---|
| `OPENAI_API_KEY` | `translate.yml` で使用 |

## ローカル動作確認

```bash
npm install
npm run validate                          # JSON Schema 検証
OPENAI_API_KEY=sk-... npm run translate   # 翻訳補完
```
