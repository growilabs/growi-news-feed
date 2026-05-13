# growi-news-feed
CI check
GROWI の InAppNotification パネルに配信するニュースフィード。　

GROWI 各インスタンスは環境変数 `NEWS_FEED_URL` で以下の URL を参照し、cron で定期取得する:

```
https://growilabs.github.io/growi-news-feed/feed.json
```

## ファイル構成

| パス | 役割 |
|---|---|
| `feed.json` | 配信本体。ニュースアイテムの配列を保持する **編集対象** |
| `schema/feed.schema.json` | `feed.json` の JSON Schema 定義。CI 検証 / IDE 補完で使用 |
| `scripts/check-uniqueness.ts` | `items[].id` の一意性検証スクリプト（CI から実行） |
| `.github/workflows/validate.yml` | PR / push to main 時に schema + 一意性検証を走らせる CI |
| `.github/workflows/pages.yml` | main への push をトリガーに GitHub Pages へデプロイ |
| `.github/workflows/refresh-lock.yml` | 手動トリガー（`workflow_dispatch`）で `package-lock.json` を再生成 |
| `package.json` / `package-lock.json` | CI が使う Node 依存（`ajv-cli`, `typescript`, `@types/node`）と固定バージョン |
| `tsconfig.json` | TypeScript IDE 補完 / `typecheck` 用設定。runtime は Node 24 の native type stripping で動くため未使用 |
| `.gitignore` | `node_modules/`, `_site/` 等を git 管理外に指定 |
| `README.md` | このファイル |

## ニュースの追加方法

**現状**: `feed.json` を**手動で編集**して push（または PR）する単純運用。

> **TODO**: 将来は専用 Claude Code スキル(PrimaVista)からの対話入稿を予定 → [TODO: Claude Code Skill 経由の入稿](#todo-claude-code-skill-経由の入稿)

### 1. `feed.json` の `items` に新規エントリを追加して push（または PR）

エントリの例（全ロケール記入）:

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

### 2. 最低限必須のフィールド

| フィールド | 内容 |
|---|---|
| `id` | 一意の識別子。**一度決めたらマージ後は変更不可** → [注意点 #1](#1-itemsid-は一度決めたら変更しない) |
| `title.ja_JP` | 日本語タイトル |
| `publishedAt` | ISO 8601 形式の公開日時（例: `2026-04-24T00:00:00Z`） |

その他のフィールド:

- `emoji`, `body`, `url`, `conditions` は任意
- `title` / `body` の他言語キー（`en_US`, `zh_CN`, `fr_FR`, `ko_KR`）は記入を推奨。欠落しても本体側のロケールフォールバックで表示は維持される
- 詳細は [フィードスキーマ](#フィードスキーマ) 表を参照

### 3. 検証 & 自動デプロイ

push 後の自動処理:

1. `validate.yml` が **JSON Schema 検証** + **`items[].id` 一意性チェック**を実行
2. main マージ後 `pages.yml` が GitHub Pages へデプロイ（デプロイ前にもう一度 validate）
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

## TODO: Claude Code スキル(PrimaVista) 経由の入稿

将来、対話的にニュースを生成・入稿できる専用 Claude Code スキルを導入予定。

### 想定運用フロー

1. 運営者が Claude Code スキルを起動し、ニュース内容を日本語で指示
2. スキルが多言語（`ja_JP`, `en_US`, `zh_CN`, `fr_FR`, `ko_KR`）の文面を一括生成
3. 運営者がプレビューで全文確認 → 明示承認
4. スキルが `gh` CLI 経由で `feed.json` を編集して push（または PR 作成）
5. 既存の `validate.yml` / `pages.yml` がそのまま機能

### 着手時に追加で必要なもの

| 区分 | 内容 |
|---|---|
| **本リポ側** | `CLAUDE.md`（スキルが読む規約集）、`types/feed.ts`（型定義）、`schema/feed.schema.json` のパターン強化（id naming、文字数上限、url ドメイン）、`examples/` |
| **追加 validator** | 命名規約 / ロケール網羅性 / 日付妥当性 / コンテンツ検査 |
| **スキル側**（別リポ） | `SKILL.md`（対話フロー）、多言語生成プロンプト、既存 feed の取得・id 衝突回避、`gh` 操作、dry-run validate |
| **環境** | gh CLI 認証（repo write）、LLM API キー、Node 24 |
| **運用ルール** | 入稿前の人間承認、種別ごとの push 戦略、id 衝突回避、失敗時ロールバック手順 |

着手順序の推奨: **`CLAUDE.md` ドラフト → schema 強化 → 追加 validator → スキル本体**

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
