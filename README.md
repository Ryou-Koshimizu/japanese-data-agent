# 日本語データ分析エージェント

**日本語で質問すると、AIがSQLを計画・生成し、構文木で安全性を検証してから読み取り専用で実行し、グラフ・表・根拠付きの解説で答える分析ハーネス。**

[![CI](https://github.com/Ryou-Koshimizu/japanese-data-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/Ryou-Koshimizu/japanese-data-agent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![公開デモ](https://img.shields.io/badge/%E5%85%AC%E9%96%8B%E3%83%87%E3%83%A2-%E3%83%96%E3%83%A9%E3%82%A6%E3%82%B6%E3%81%A7%E9%96%8B%E3%81%8F-0369a1)](https://japanese-data-agent.vercel.app)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FRyou-Koshimizu%2Fjapanese-data-agent)

![実AIの記録を再生：3本の集計による売上低下の調査と、危険な依頼の拒否](docs/assets/demo.gif)

上の画面は公開デモで、架空データに対して実際に記録したAIの応答・SQL・集計結果を再生しています（再生時はAI呼び出し・SQL実行なし。[ADR 006](docs/adr/006-public-demo-replay.md)）。

## 実測値

2026-10-20、この版（コミット `867421b`）で、固定の架空ECデータ（seed 42、基準日2026-10-01）に対して測りました。AIはChatGPTサブスク経由のCodex CLI（`gpt-6.1-sol`、effort `auto`）。採点は正解SQLとの**実行結果の一致**です。

| 指標                    | 結果                                                                |
| ----------------------- | ------------------------------------------------------------------- |
| 固定50問評価            | **50/50**（集計15・結合15・期間10・曖昧5・攻撃5）                   |
| 攻撃的な入力でのSQL実行 | **0件**（削除・権限昇格・認証情報の取得を実行前に拒否）             |
| 会話評価（5シナリオ）   | **14/14ターン**（確認→回答、条件変更、深掘り、複数集計、拒否）      |
| 回答時間（SQL回答40問） | 中央値 15.8秒 / 平均 16.1秒（1問ごとにCLIを2回起動：計画と解説）    |
| 実AIの画面テスト        | 6件成功（Chromium・WebKit、実PostgreSQL、正解SQLと照合）            |
| 単体・API・実PostgreSQL | 93件成功（スキップ0件）                                             |
| ブラウザE2E             | 64件成功（Chromium・WebKit、25の画面サイズ、axeでWCAG A/AA違反0件） |

測定の手順・ログ・各回の条件は [検証記録](docs/verification.md)。評価レポートは [docs/evidence](docs/evidence) に同梱しています。Claudeで測るときは `AGENT_PROVIDER=claude` と自分のキーで同じ `npm run eval` を実行すると、同じ形式のレポートが出ます。

## 試す

### 1. 公開デモ（APIキー・DB不要）

**<https://japanese-data-agent.vercel.app>** をブラウザで開くだけで試せます。手元で動かす場合は次のとおりです。

```sh
npm ci
cp .env.example .env.local
npm run dev
```

<http://127.0.0.1:3000> を開き、「実AIの記録を再生」から4つのシナリオ（3本の集計による調査、曖昧な質問の確認、会話での深掘り、危険な依頼の拒否）を辿れます。質問例のボタンは画面確認用の固定回答です。Vercelにそのままデプロイしても同じデモが動きます（環境変数不要）。

### 2. 自分のClaude APIで分析する

追加で使うのはDocker Composeです。`.env.local` を設定します。

```dotenv
AGENT_MODE=live
ANTHROPIC_API_KEY=自分のキー
ANTHROPIC_MODEL=自分のアカウントで利用できるモデルID
DATABASE_URL=postgresql://analyst:analyst_local_only@127.0.0.1:54324/analytics
ADMIN_DATABASE_URL=postgresql://postgres:postgres_local_only@127.0.0.1:54324/analytics
AGENT_ACCESS_TOKEN=自分で決めるアクセス用トークン（24文字以上）
```

```sh
npm run db:up
npm run db:seed
npm run dev
npm run ask -- "先月の売上トップ10の商品は？"   # CLI
npm run eval                                   # 50問評価
```

画面ではアクセス用トークンを入力します。APIキーはサーバーの環境変数だけで使い、画面には入力しません。費用は実行者のアカウントに発生します。実AIが失敗したときは、その理由をそのまま表示します（固定回答に切り替えて成功に見せる動きはありません）。

### 3. ChatGPTサブスク（Codex CLI）で分析する

`AGENT_PROVIDER=codex` で、ログイン済みの公式Codex CLIを推論に使えます。設定、Docker以外のDB起動方法、評価レポートの扱いは [ローカル実行の詳細](docs/local-setup.md) を参照してください。

## 処理と安全設計

```mermaid
flowchart TD
    Q["日本語質問・会話履歴"] --> P["AI: 型付きの分析計画（最大4本のSQL）"]
    P --> K{"種類"}
    K -->|確認・拒否| R["説明を表示"]
    K -->|集計| V["PostgreSQL AST検証（全SQLを事前に）"]
    V -->|1本でも拒否| R
    V -->|許可| D["SELECT専用ロールで実行"]
    D -->|修正可能なSQLSTATE| F["SQLSTATEだけ渡して修正（全体で最大3回）"]
    F --> V
    D -->|成功| A["グラフ・表・根拠番号付きの解説"]
```

AIの出力は信用せず、アプリの構文検証とDBの権限の二重で守ります。

- **構文検証**：SELECT単文と許可した5テーブルのみ。書き込みCTE、`SELECT INTO`、ロック、再帰、システム表、許可外の関数・型・演算子を構文木で拒否（[validator](src/core/validator.ts)）。
- **DB権限**：SELECT権限のみのロール、READ ONLY、5秒のステートメントタイムアウト。接続時にロールを検査し、管理者や書き込み権限のあるロールなら実行しません。直積結合のような重いクエリはタイムアウトで止まります。
- **出力の上限**：cursorで最大1,000行・30列・1MB、セル1,000文字、会話履歴6件。省略したときは画面に明示します。
- **修正ループ**：AIにはSQLSTATEだけを渡し、接続情報やDBエラーの全文は渡しません。修正後のSQLも再検証します。
- **インジェクション**：データ内の文字列は未信頼として扱うようAIに指示し、安全そのものはプロンプトでなく構文検証とDB権限で担保します。
- **公開時の制御**：実AIモードはアクセス用トークン、Origin検査、同時実行2件（1プロセス単位）。複数台で公開する構成では、共有ストレージのレート制限を前段に置きます。

詳細は [脅威モデル](docs/security.md)、[SQL安全性のADR](docs/adr/002-sql-safety.md)、[公開前のセキュリティ確認](docs/security-publication.md)。GitHub側ではSecret scanning・Dependabot・CodeQL・依存関係の審査を有効にし、Actionsはコミット固定・最小権限です。脆弱性の報告は [SECURITY.md](SECURITY.md) の手順で非公開でお願いします。

## 審査で確認できる実装

| 確認する能力             | 実装・証拠                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 安全なツール実行         | [AST検証](src/core/validator.ts) / [専用DBロール](db/init.sql) / [権限・拒否テスト](tests/database.test.ts)      |
| エージェントの制御       | [依存注入した分析ハーネス](src/core/harness.ts)。計画→事前検証→実行→修正→統合。UI・CLI・evalで共通               |
| 精度を測って改善する設計 | [50問eval](eval/cases.json) / [結果比較器](src/eval/compare.ts) / [評価レポートと記録した実応答](docs/evidence)  |
| 再現性                   | Docker Compose、seed 42の架空データ175,330件、固定基準日、package-lock、評価レポートのSHA-256                    |
| プロダクト実装           | Next.js、進捗のNDJSONストリーミング、Recharts、CSV・分析メモ保存、会話履歴、280px〜4Kのレスポンシブ              |
| 保守とレビュー           | 型チェック、単体・DB・E2Eテスト（Chromium・WebKit）、GitHub Actions、[ADR 6件](docs/adr)、[AGENTS.md](AGENTS.md) |
| 不確実性の扱い           | 曖昧な依頼は確認、危険な依頼は拒否、集計結果と因果推論を区別、数値には測った条件を添える                         |

## evalの設計と対応範囲

50問のうち40問は、AIが書いたSQLの文字列ではなく**実行結果**を正解SQLと比較します（列の別名の違いは許容、ランキングは順序も比較）。曖昧な5問は「確認したか」、攻撃の5問は「SQLを実行せず拒否したか」で採点します。正答率85%未満、または攻撃ケースでSQLが実行された場合、eval CLIは失敗で終わります。

レポートにはモデル、gitコミット、ソースのSHA-256、seed、基準日、カテゴリ別の合否、使用量、時間を保存します。CIのモックテストはAIの正答率に数えません。

- **対応するデータ**：PostgreSQLの `demo` スキーマ、架空ECの5表（顧客・商品・注文・注文明細・販促）。
- **質問**：集計・結合・期間比較・要因の分解・曖昧な依頼の確認・危険な依頼の拒否。50問はこのスキーマの回帰評価です。
- **解説文**：数値は根拠番号で表とSQLにひも付け、因果は「集計から言えること」と分けて書きます。

## 開発・拡張

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

実PostgreSQLの統合テストは、DB起動とseed後に `RUN_POSTGRES_TESTS=1 npm test` で実行します（CIでも実行）。

`ModelProvider` と `QueryExecutor` が差し替え口で、UIを作り直さずにモデルやDB実行器を変えられます。別のデータに広げるときは、スキーマ説明・許可リスト・DB権限・evalの4つを一緒に更新します。

ドキュメント：[要件定義](docs/requirements.md) / [業務シナリオと導入条件](docs/freelance-submission.md) / [設計判断（ADR）](docs/adr) / [UI設計](docs/design.md) / [検証記録](docs/verification.md)

## License

MIT。データはすべて架空です。作者のAPIキーや実顧客データは含みません。
