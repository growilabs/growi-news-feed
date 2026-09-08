# growi-news-feed

GROWI の InAppNotification パネル / `/_news` ページに配信するニュースフィード。

GROWI 各インスタンスは、コードに内蔵された以下の URL を cron で定期取得する（env による上書きは不可）:

```
https://growilabs.github.io/growi-news-feed/feed.json
```

## ファイル構成

| パス | 役割 |
|---|---|
| `feed.json` | 配信本体。ニュースアイテムの配列を保持する **編集対象** |
| `schema/feed.schema.json` | `feed.json` の JSON Schema 定義。CI 検証 / IDE 補完で使用 |
| `images/` | Markdown 本文（`bodyFormat: "markdown"`）から参照する画像の置き場。**この直下のみ**（サブディレクトリ不可）。`pages.yml` が公開する |
| `CLAUDE.md` | 入稿規約の原典（AI スキル / 人間の共同編集者が従うルール）。エントリを 1 件足すときの詳細はこちら |
| `scripts/check-uniqueness.ts` | `items[].id` の一意性検証スクリプト（CI から実行） |
| `scripts/check-images.ts` | 本文が参照する `images/…` の実在・命名・配置・拡張子を検証（CI から実行） |
| `scripts/check-size.ts` | `feed.json` のバイトサイズ上限を検証（受信側 5 MiB 制限より手前で fail） |
| `.github/workflows/validate.yml` | PR / push to main 時に schema + 一意性 + 画像整合 + サイズを検証する CI |
| `.github/workflows/pages.yml` | main への push をトリガーに GitHub Pages へ `feed.json` / `schema/` / `images/` をデプロイ |
| `.github/workflows/refresh-lock.yml` | 手動トリガー（`workflow_dispatch`）で `package-lock.json` を再生成 |
| `.github/workflows/maintain-feed-size.yml` | 定期実行。`feed.json` が保持件数を超えたら古いエントリと孤立画像を自動削除し main へ反映（下記「フィードサイズの自動メンテナンス」） |
| `package.json` / `package-lock.json` | CI が使う Node 依存（`ajv-cli`, `typescript`, `@types/node`）と固定バージョン |
| `tsconfig.json` | TypeScript IDE 補完 / `typecheck` 用設定。runtime は Node 24 の native type stripping で動くため未使用 |
| `.gitignore` | `node_modules/`, `_site/` 等を git 管理外に指定 |
| `README.md` | このファイル |

## ニュースの追加方法

**現状**: `feed.json` を**手動で編集**して push（または PR）する単純運用。入稿規約の詳細は [CLAUDE.md](CLAUDE.md) を参照。

> **入稿スキルあり**: 対話的な入稿は専用の Claude Code スキル **PrimaVista（`gnf-add-news`）** でも行える → [Claude Code スキル(PrimaVista) 経由の入稿](#claude-code-スキルprimavista-経由の入稿)

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

- `emoji`, `body`, `url`, `bodyFormat`, `conditions` は任意
- `title` / `body` の他言語キー（`en_US`, `zh_CN`, `fr_FR`, `ko_KR`）は記入を推奨。欠落しても本体側のロケールフォールバックで表示は維持される
- 詳細は [フィードスキーマ](#フィードスキーマ) 表を参照

### 3. Markdown 本文と画像（`bodyFormat: "markdown"`）

`bodyFormat` に `"markdown"` を付けると、GROWI の `/_news` ページで `body` が **Markdown として描画**され、本文中に画像を置ける（未指定なら従来どおりプレーンテキスト）。記法・見出しの 2 段シフト・画像規約など、入稿時に守るルールは [CLAUDE.md の「Markdown 本文と画像」](CLAUDE.md#markdown-本文と画像-bodyformat-markdown) が原典。要点のみ:

- 画像は**このリポジトリの `images/` 直下**に置き、`![alt](images/<filename>)` の**相対パス**で参照する。外部ホスティング URL・絶対 URL・サブディレクトリは GROWI 側の描画時に**無言で除去**される。
- ファイル名は `^[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpe?g|webp|gif)$`（スペース・日本語不可、アニメーションは GIF のみ）。
- `npm run validate`（`scripts/check-images.ts`）が、本文が参照する画像の実在・命名・配置・拡張子をローカル / CI で検証する。

### 4. 検証 & 自動デプロイ

push 後の自動処理:

1. `validate.yml` が **JSON Schema 検証** + **`items[].id` 一意性** + **画像整合**（`check-images.ts`）+ **サイズ上限**（`check-size.ts`）を実行
2. main マージ後 `pages.yml` が `feed.json` / `schema/` / `images/` を GitHub Pages へデプロイ（デプロイ前にもう一度 validate）
3. 数分後に `https://growilabs.github.io/growi-news-feed/feed.json` に反映、各 GROWI インスタンスの次回 cron 実行で取得される

## フィードスキーマ

`schema/feed.schema.json` を参照。主要フィールド:

| フィールド | 必須 | 説明 |
|---|---|---|
| `id` | ✅ | 一意の識別子（変更不可） |
| `emoji` | | 表示アイコン（未設定時は 📢 がフォールバック） |
| `title` | ✅ | `{ ja_JP, en_US, ... }` 多言語オブジェクト（`ja_JP` 必須） |
| `body` | | 多言語本文 |
| `bodyFormat` | | `"markdown"` のみ。付けると `body` を Markdown として描画（未指定＝プレーンテキスト）。**アイテム単位**で全ロケールに一律で効く |
| `url` | | 詳細ページ URL（未設定ならパネル内完結） |
| `publishedAt` | ✅ | ISO 8601 |
| `conditions.targetRoles` | | `["admin"]` `["general"]` 等。未設定で全ユーザー |
| `conditions.growiVersionRegExps` | | `["^7\\.5\\..*"]` 等。未設定で全バージョン（配列内は OR 判定） |

配信の仕組み（cron 取得・バージョン条件でのフィルタ・受信側の TTL / サイズ制限など）の詳細は growi 本体側の [news-inappnotification spec](https://github.com/growilabs/growi/blob/master/.kiro/specs/news-inappnotification/design.md) を参照。

## フィードサイズの自動メンテナンス

受信側（GROWI 本体）は、フィードに残り続けるアイテムを各インスタンスの DB に upsert し続ける。フィードから外れたアイテムのみ DB から削除されるため（`fetchedAt` の 90 日 TTL は残存アイテムには実質発火しない）、**コレクションサイズの上限は配信側（このリポジトリ）のキュレーションに依存する**（設計判断: news-inappnotification spec の Performance & Scalability）。加えて受信側はフィード応答を **5 MiB** に制限しているため、`feed.json` が無制限に肥大化すると取り込み自体が失敗しうる。

この責務を自動化するのが `maintain-feed-size.yml`:

- 定期実行（既定: 毎月）。`feed.json` の件数が保持上限（`FEED_MAX_ITEMS`、既定 **100**）を超えたら、`publishedAt` が古い順に超過分を削除し、どのエントリからも参照されなくなった `images/` の孤立画像も削除する（`scripts/trim-feed.ts`）。
- 削除後に `npm run validate` を通してから main へ直接 commit / push し、`pages.yml` を明示的に起動して Pages を再デプロイする。
- commit メッセージに削除した `id` を列挙する（監査は git 履歴に残る）。

> **注意**: 削除は取り込み済み全インスタンスの DB からもそのアイテムを消す（`deleteItemsNotInFeed`）。`id` はマージ後不変で、削除済み `id` を再追加すると既読状態がリセットされるため、**保持上限を十分大きく取り、削除したエントリは再追加しない**。

## Workflows

| Workflow | Trigger | 役割 |
|---|---|---|
| `validate.yml` | PR / push to main（`feed.json` / `schema/**` / `images/**` / `scripts/**` / `package.json` 変更時） | schema + 一意性 + 画像整合 + サイズを検証 |
| `pages.yml` | push to `main`（`feed.json` / `schema/**` / `images/**` 変更時）・手動 | `feed.json` / `schema/` / `images/` を GitHub Pages にデプロイ（デプロイ前にインライン validate） |
| `refresh-lock.yml` | 手動（`workflow_dispatch`） | `package.json` 変更後に `package-lock.json` を再生成 |
| `maintain-feed-size.yml` | 定期（既定: 毎月）・手動 | 保持上限超過分の古いエントリ・孤立画像を自動削除し main へ反映 |

## Claude Code スキル(PrimaVista) 経由の入稿

`feed.json` の入稿・更新・削除は、専用の Claude Code スキル群 **PrimaVista** で対話的に行える。ニュース追加は `gnf-add-news`、更新は `gnf-update-news`、削除は `gnf-delete-news`。

### 運用フロー

1. 運営者が PrimaVista（`gnf-add-news`）を起動し、ニュース内容を日本語で指示
2. スキルが多言語（`ja_JP`, `en_US`, `zh_CN`, `fr_FR`, `ko_KR`）の文面を一括生成
3. 運営者がプレビューで全文確認 → 明示承認
4. スキルが `gh` CLI 経由で `feed.json` を編集し PR を作成（無承認 push はしない）
5. `validate.yml` が検証、レビューを経て main マージ → `pages.yml` がデプロイ

### このリポジトリが提供する「入稿契約」

PrimaVista は本リポの以下を参照・遵守する（スキル側の実装はこれらに従う）。入稿規約の詳細は [CLAUDE.md](CLAUDE.md) が原典。

| 提供物 | 役割 |
|---|---|
| `CLAUDE.md` | 入稿規約の原典。id 不変・多言語・`bodyFormat`/画像規約・自動 trim ライフサイクル等、スキルが従うルール |
| `schema/feed.schema.json` | エントリの構造契約（ajv 検証で担保） |
| `npm run validate`（`check-uniqueness` / `check-images` / `check-size`） | スキルが push 前に通す dry-run 検証 |

> スキル側（別リポ）が持つもの: `SKILL.md`（対話フロー）、多言語生成プロンプト、既存 feed の取得・`id` 衝突回避、`gh` 操作、dry-run validate の呼び出し。

## 共同編集・運用時の注意点

概要:

| # | カテゴリ | ルール |
|---|---|---|
| 1 | 編集 | [`items[].id` は一度決めたら変更しない](#1-itemsid-は一度決めたら変更しない) |
| 2 | 構造 | [フィードは単一 `feed.json` に集約](#2-フィードは単一-feedjson-に集約) |
| 3 | 公開 | [Pages が公開するのは feed.json と schema と images](#3-pages-が公開するのは-feedjson-と-schema-と-images) |
| 4 | Workflow | [`validate.yml` は main への push でも走る](#4-validateyml-は-main-への-push-でも走る) |

---

### 1. `items[].id` は一度決めたら変更しない

GROWI 側は `id` を `externalId` として重複排除・既読管理に使う。マージ後に `id` を変えると、そのニュースを既読にしていた**全ユーザーの既読状態がリセット**され、「未読」として再表示されてしまう。

> **運用**: マージ後に typo 等に気付いた場合は `id` を修正せず、「新しい `id` で作り直し + 旧 `id` エントリを削除」で対処する。

### 2. フィードは単一 `feed.json` に集約

ロケール別やニュース種別ごとのファイル分割はしない。全ニュース・全ロケールを常に `feed.json` 単体に保持する。

> **理由**: GROWI 本体は単一 URL の fetch のみで完結する設計。分割対応は本体側の cron / モデル設計変更を伴うため、必要性が出たら本体側も含めて再設計する。

### 3. Pages が公開するのは feed.json と schema と images

`pages.yml` は `_site/` に `feed.json` / `schema/` / `images/` の 3 つだけをコピーしてから Pages にデプロイする。`.github/`, `scripts/`, `package.json`, `README.md`, `CLAUDE.md`, `node_modules/` は公開 URL には出ない。

> **注意**: ただし **Git 履歴自体は Public 化後に全世界に公開される**。クレデンシャル等のコミットは通常どおり厳禁。

### 4. `validate.yml` は main への push でも走る

PR 時だけでなく `main` への push 時にも検証するのは、入稿スキルが直接 main に push するパス（PR を介さない運用）でも壊れたフィードが `pages.yml` で本番デプロイされる前に検知するため。
