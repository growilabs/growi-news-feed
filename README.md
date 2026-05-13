# growi-news-feed
CI check
GROWI の InAppNotification パネルに配信するニュースフィード。　

GROWI 各インスタンスは環境変数 `NEWS_FEED_URL` で以下の URL を参照し、cron で定期取得する:

```
https://growilabs.github.io/growi-news-feed/feed.json
```

## ニュースの追加方法

入稿は **外部の Claude Code スキル**経由で行う。スキルが `feed.json` に新規エントリを **全対応ロケール分まとめて** 書き込み、`gh` 経由でこのリポジトリに直接 push（または PR 作成）する。

### 入稿エントリ例

```json
{
  "id": "release-v7-5-0",
  "emoji": "🚀",
  "title": {
    "ja_JP": "GROWI v7.5.0 がリリースされました",
    "en_US": "GROWI v7.5.0 has been released",
    "zh_CN": "GROWI v7.5.0 已发布",
    "fr_FR": "GROWI v7.5.0 est publié",
    "ko_KR": "GROWI v7.5.0이 출시되었습니다"
  },
  "body": {
    "ja_JP": "新機能とバグ修正を含むリリースです。詳細は Release Notes をご確認ください。",
    "en_US": "Includes new features and bug fixes. See the Release Notes for details."
  },
  "url": "https://github.com/growilabs/growi/releases/tag/v7.5.0",
  "publishedAt": "2026-04-24T00:00:00Z"
}
```

### 最低限必須のフィールド

| フィールド | 内容 |
|---|---|
| `id` | 一意の識別子。**一度決めたらマージ後は変更不可** → [注意点 #1](#1-itemsid-は一度決めたら変更しない) |
| `title.ja_JP` | 日本語タイトル（他ロケールは任意だがスキル側で揃える運用） |
| `publishedAt` | ISO 8601 形式の公開日時（例: `2026-04-24T00:00:00Z`） |

その他（`emoji`, `body`, `url`, `conditions`）は用途に応じて任意。詳細は [フィードスキーマ](#フィードスキーマ) 表を参照。

### 検証 & デプロイ

push 後の自動処理:

1. `validate.yml` が JSON Schema で `feed.json` を自動検証
2. main マージ後 `pages.yml` が GitHub Pages へデプロイ
3. 数分後に `https://growilabs.github.io/growi-news-feed/feed.json` に反映、各 GROWI インスタンスの次回 cron 実行で取得される

## フィードスキーマ

`schema/feed.schema.json` を参照。主要フィールド:

| フィールド | 必須 | 説明 |
|---|---|---|
| `id` | ✅ | 一意の識別子（変更不可） |
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
| `validate.yml` | PR / push to main（`feed.json` or `schema/**` 変更時） | JSON Schema で `feed.json` を検証 |
| `pages.yml` | push to `main` | GitHub Pages に `feed.json` + `schema/` をデプロイ（デプロイ前にインライン validate） |
| `refresh-lock.yml` | 手動（`workflow_dispatch`） | `package.json` 変更後に `package-lock.json` を再生成 |

## 共同編集・運用時の注意点

概要:

| # | カテゴリ | ルール |
|---|---|---|
| 1 | 編集 | [`items[].id` は一度決めたら変更しない](#1-itemsid-は一度決めたら変更しない) |
| 2 | 構造 | [フィードは単一 `feed.json` に集約](#2-フィードは単一-feedjson-に集約) |
| 3 | 公開 | [Pages が公開するのは `feed.json` と `schema/` のみ](#3-pages-が公開するのは-feedjson-と-schema-のみ) |
| 4 | Workflow | [`validate.yml` は main への push でも走る](#4-validateyml-は-main-への-push-でも走る) |

---

### 1. `items[].id` は一度決めたら変更しない

GROWI 側は `id` を `externalId` として重複排除・既読管理に使う。マージ後に `id` を変えると、そのニュースを既読にしていた**全ユーザーの既読状態がリセット**され、「未読」として再表示されてしまう。

> **運用**: マージ後に typo 等に気付いた場合は `id` を修正せず、「新しい `id` で作り直し + 旧 `id` エントリを削除」で対処する。

### 2. フィードは単一 `feed.json` に集約

ロケール別やニュース種別ごとのファイル分割はしない。全ニュース・全ロケールを常に `feed.json` 単体に保持する。

> **理由**: GROWI 本体は単一 URL の fetch のみで完結する設計。分割対応は本体側の cron / モデル設計変更を伴うため、必要性が出たら本体側も含めて再設計する。

### 3. Pages が公開するのは `feed.json` と `schema/` のみ

`pages.yml` は `_site/` にこの 2 つだけをコピーしてから Pages にデプロイする。`.github/`, `scripts/`, `package.json`, `README.md`, `node_modules/` は公開 URL には出ない。

> **注意**: ただし **Git 履歴自体は Public 化後に全世界に公開される**。クレデンシャル等のコミットは通常どおり厳禁。

### 4. `validate.yml` は main への push でも走る

PR 時だけでなく `main` への push 時にも検証するのは、入稿スキルが直接 main に push するパス（PR を介さない運用）でも壊れたフィードが `pages.yml` で本番デプロイされる前に検知するため。

## ローカル動作確認

```bash
npm ci
npm run validate    # JSON Schema 検証 + items[].id 一意性チェック
```
