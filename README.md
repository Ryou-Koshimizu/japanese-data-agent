# 日本語データ分析エージェント

**日本語の質問 → SQL生成 → 安全性検証 → 読み取り専用実行 → グラフ・表・日本語解説。**

[![CI](https://github.com/Ryou-Koshimizu/japanese-data-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/Ryou-Koshimizu/japanese-data-agent/actions/workflows/ci.yml)

自分のClaude APIキー、またはローカルのChatGPT/Codexログインで動かす分析ハーネスです。UI・CLI・evalが同じ分析処理を使います。作者のAPIキーや実顧客データは含みません。

> **現在の状態**：会話を保った深掘り・最大4本の集計・根拠付き回答・分析メモ保存を実装。このMacでChatGPTサブスクと実PostgreSQLを使い、追加の会話評価は初回14/14ターン成功しました。拡張前の固定50問評価は50/50成功でしたが、拡張後の全50問や任意の質問への100%を示す値ではありません。実Claude評価は未実行。作者負担の公開実AIサービスは提供しません。

提出・レビュー向けの [業務シナリオと導入条件](docs/freelance-submission.md) / [会話型分析の設計判断](docs/adr/005-conversational-investigation.md) / [実測と制約](docs/verification.md)。AI支援による成果物と作者自身の理解・再現能力は区別します。

公開対象の確認と本番運用上の注意は [セキュリティ確認](docs/security-publication.md) を参照してください。ローカルDBの既定パスワードは開発用の公開サンプルで、本番では使いません。

![固定回答デモ：質問例からグラフ・表・SQLまで](docs/assets/demo.gif)

このGIFはAPIを使わない固定回答デモの実画面です。AI生成や自己修正の実測映像ではありません。

## 最初に試す：API不要の固定回答デモ

前提：Node.js 22.13以上・npm。cloneしてリポジトリのルートで実行します。

```sh
npm ci
cp .env.example .env.local
npm run dev
```

<http://127.0.0.1:3000> を開き、質問例を押してください。固定回答デモではAI呼び出し・SQL実行・AI精度評価は行いません。入力を自由に変えても固定サンプルが返る画面体験です。

## 自分のClaude APIで動かす

追加前提：Docker Compose。`.env.local` に自分の設定を入れます。

```dotenv
AGENT_MODE=live
ANTHROPIC_API_KEY=自分のキー
ANTHROPIC_MODEL=自分のアカウントで利用できるモデルID
DATABASE_URL=postgresql://analyst:analyst_local_only@127.0.0.1:54324/analytics
ADMIN_DATABASE_URL=postgresql://postgres:postgres_local_only@127.0.0.1:54324/analytics
AGENT_ACCESS_TOKEN=自分で決めるアクセス用トークン
```

```sh
npm run db:up
npm run db:seed
npm run dev
```

画面下部の「アクセス用トークン」に、設定した `AGENT_ACCESS_TOKEN` を入力します。**Claude APIキーを画面へ入力しないでください。** アクセス用トークンはブラウザメモリだけに保持します。APIキーはサーバー環境変数だけで使用します。CLIではアクセス用トークン入力は不要です。

```sh
npm run ask -- "先月の売上トップ10の商品は？"
npm run eval
```

使用するAPIの費用は実行者自身に発生します。失敗時に固定回答へ切り替えて成功を装う動作はありません。seedはローカルの専用 `analytics` DBにのみ実行し、データが存在する場合は上書きしません。

## このMacでChatGPTサブスクを使う

ローカル実行の追加接続として、ログイン済みの公式Codex CLIを呼び出せます。AI推論はOpenAIのクラウドで行い、画面・API・SQL検証・PostgreSQLはこのMacで動きます。ローカルでモデルそのものを実行する機能ではありません。

前提はCodex CLI（このMacで確認したバージョン: 0.162.1）とChatGPTログインです。`codex login status` で状態を確認できます。通常のOpenAI APIキーやClaude APIキーは使いません。ChatGPT/Codexのサブスク利用枠を消費し、無制限ではありません。利用できるモデルはアカウントによって異なります。

`.env.local` の設定例:

```dotenv
AGENT_MODE=live
AGENT_PROVIDER=codex
CODEX_MODEL=gpt-6.1-sol
CODEX_EFFORT=auto
DATABASE_URL=postgresql://analyst:analyst_local_only@127.0.0.1:54324/analytics
AGENT_ACCESS_TOKEN=自分で決めるローカルアクセス用トークン
```

`auto` はアプリ側の選択ルールで、SQL生成と解説はLow、実行エラーからのSQL修正はMediumです。モデルは `CODEX_MODEL` で指定します。推論ごとのモデル自動ルーティングやCodex画面のAuto設定とは別です。`low` / `medium` / `high` / `xhigh` を明示指定することもできます。

```sh
npm run dev
npm run ask -- "先月の売上合計は？"
npm run eval
```

DBは従来どおりDocker Composeでも使えます。このMacにはHomebrewのPostgreSQL 17を導入し、このリポジトリ専用の `.local-data/postgres` を127.0.0.1:54324で起動しています。自動起動サービスには登録していません。

```sh
# このMacでDBを再起動するとき
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D "$PWD/.local-data/postgres" -l "$PWD/.local-data/postgres.log" -o '-h 127.0.0.1 -p 54324 -k /private/tmp' start
# 停止するとき
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D "$PWD/.local-data/postgres" stop
```

CLI・UI・evalは同じハーネスを通ります。Codexは一時ディレクトリで読み取り専用サンドボックスを使用し、ユーザー設定・プラグイン・MCP連携・シェル・ブラウザ等を無効にして構造化JSONを要求します。CLIの既存認証は公式CLIだけが利用し、アプリは認証ファイルを読みません。DB接続情報やClaudeキーは子プロセスに渡しません。AIが出したSQLをCodex自身が実行することはなく、アプリ側のAST検証・読み取り専用ロールが引き続き実行を制御します。

ローカルHTTP APIは `/api/analyze` です。画面にアクセス用トークンを入力してから質問します。`npm run test:live` は実AIによる初回質問・追加質問を正解SQLと比較し、CSV保存とスマホ表示までテストします。APIなしの画面テストは `npm run test:e2e` です。実AIテストは通常CIでは実行しません。

evalは各問の完了時に `reports/eval-*.json` を更新します。`status: complete` の50問レポートだけを全体精度として扱ってください。途中のレポートは完了扱いにしません。個別の再確認は `npm run eval -- --ids=03,06` のように実行でき、レポートには部分評価と明記します。ソースSHA-256・プロバイダー・モデル・effortを記録します。サブスク接続の費用はAPI単価に換算せず `null` とします。

公式仕様: [Codex非対話実行と構造化出力](https://learn.chatgpt.com/docs/non-interactive-mode)、[Codex設定](https://learn.chatgpt.com/docs/config-file/config-reference)。Claude接続は `AGENT_PROVIDER=claude` に戻して従来の設定を使います。ChatGPTでの評価はClaudeの精度を証明しません。

## 審査で確認できる実装

| 確認する能力             | 実装・証拠                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 安全なツール実行         | [AST検証](src/core/validator.ts) / [専用DBロール](db/init.sql) / [権限・拒否テスト](tests/database.test.ts) |
| エージェントの制御       | [依存注入した分析ハーネス](src/core/harness.ts)。初回実行＋最大3回修正。修正SQLも再検証                     |
| 再現性                   | Docker Compose、seed 42の架空データ、固定基準日2026-10-01、package-lock                                     |
| 精度を測って改善する設計 | [50問eval](eval/cases.json) / [結果比較器](src/eval/compare.ts) / [eval CLI](scripts/eval.ts)               |
| プロダクト実装           | Next.js、進捗NDJSON、レスポンシブ、Recharts、SQLコピー、CSV保存、会話履歴                                   |
| 保守とレビュー           | 型チェック、単体・DB・E2Eテスト、GitHub Actions、[ADR](docs/adr)、[AGENTS.md](AGENTS.md)                    |
| 不確実性の扱い           | 曖昧な依頼は確認、危険操作は拒否、集計結果と因果推論を区別、未測定値を公開                                  |

50万円程度のフリーランス案件への応募時に、画面だけでなく設計・検証・変更しやすさを示すことを目的としています。契約獲得や単価を保証するものではありません。

## 実測と未検証

2026-10-11〜12のローカル確認結果は [検証記録](docs/verification.md) を参照してください。

| 指標                                 | 状態                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------- |
| TypeScript型チェック                 | 成功                                                                       |
| 本番ビルド                           | 成功                                                                       |
| 単体・API・PostgreSQLテスト          | 78件成功、実PostgreSQL接続を含みスキップなし                               |
| デスクトップ・スマホE2E              | 固定デモ・操作テスト6件、ChatGPT実AIの画面テスト3件成功                    |
| DBデータ                             | 5,000顧客 / 300商品 / 50,000注文 / 120,000明細 / 30施策                    |
| 正解SQL                              | 40問すべてAST検証とDB実行を確認                                            |
| 実ChatGPTの固定50問評価（拡張前）    | 50/50成功、危険操作のSQL実行0件。回答中央値10.2秒、平均10.4秒              |
| 拡張後の会話評価（初回）             | 5シナリオ14/14ターン成功。複数集計・確認の解消・条件変更・拒否を含む       |
| 実Claudeの正答率・応答時間・トークン | 未測定：自分のキーで `npm run eval` を実行                                 |
| 実AIの平均費用                       | Claudeは単価・為替の設定後に推計可能。ChatGPTサブスクはAPI費用に換算しない |
| 通常のPostgreSQL接続                 | このMacのPostgreSQL 17でseed・cursor・読み取り専用権限を確認               |
| 分散IPレート制限                     | 未実装。実AIの公開運用には追加が必要                                       |

## 処理と安全設計

```mermaid
flowchart TD
    Q["日本語質問・履歴"] --> P["Claude: 型付きSQL案"]
    P --> K{"種類"}
    K -->|確認・拒否| R["説明を表示"]
    K -->|集計| V["PostgreSQL AST検証"]
    V -->|拒否| R
    V -->|許可| D["SELECTロールで実行"]
    D -->|修正可能なSQLSTATE| F["最大3回修正"]
    F --> P
    D -->|成功| A["グラフ・表・解説"]
```

- SELECT単文と5テーブルのみ許可。CTE内の書き込み、システム表、危険な関数、特殊型、ロック、再帰を拒否します。
- DB側でもSELECT権限・READ ONLY・5秒タイムアウトを設定。管理者接続や書き込み可能なロールを拒否します。
- cursorで最大1,000行、30列、整形結果1MBを上限にします。文字列は1,000文字まで、履歴は6件まで。省略を明示します。
- LLM修正にはSQLSTATEだけを渡し、接続情報やDBエラーの全文を渡しません。
- データ内の文字列は未信頼データとして扱い、命令に従わないようモデルへ指示します。安全性はプロンプトだけに依存しません。インジェクションの完全防御は主張しません。
- 進捗表示は処理ステップと生成SQLです。モデルの内部推論を表示する機能ではありません。

詳細は [脅威モデル](docs/security.md)、[SQL設計ADR](docs/adr/002-sql-safety.md) を参照。

## evalの使い方と限界

50問は集計15、結合15、時系列10、曖昧な質問5、攻撃5です。40問はSQLの文字列でなく**実行結果**を比較し、別名の違いを許容します。ランキングは順序も比較します。曖昧な質問は確認、攻撃は未実行の拒否で採点します。

`reports/eval-*.json` にモデル、gitコミット、seed、基準日、カテゴリ別合否、使用量、時間、結果を保存します。正答率85%未満、または攻撃ケースでSQLが実行された場合はCLIが失敗します。CIのモックテストをAIの正答率として数えません。通常CIはAPIキー不要で、実LLM evalは利用者が明示実行します。

費用を推計する場合だけ `.env.local` に `INPUT_USD_PER_MILLION`、`OUTPUT_USD_PER_MILLION`、`JPY_PER_USD` を設定してください。単価未設定なら費用は `null` です。キャッシュ割引や使用量が取得できなかった失敗呼び出しの請求は完全に反映しないため、請求額ではなく設定単価による推計です。

この50問は固定ECスキーマの回帰評価です。任意DBやあらゆる日本語質問に対する性能、解説の事実性を網羅的に保証するものではありません。

## 開発・拡張

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

通常のPostgreSQLを使う統合テストは、DB起動とseed後に `RUN_POSTGRES_TESTS=1 npx vitest run tests/postgres.test.ts` で実行します。CIではこの検証も行います。

`ModelProvider` と `QueryExecutor` が差し替え境界です。UIを作り直さずにプロバイダー、モデル、DB実行器を変えられます。別データへ拡張する際はスキーマ説明・許可リスト・DB権限・evalを一緒に更新してください。任意のDB URLだけで自動対応する製品ではありません。

会話型分析は最大4本を計画して実行します。結果を見て無制限に自律調査する機能ではなく、次の調査は利用者の質問または提案ボタンから開始します。寄与の分解は原因の証明ではありません。今後の拡張はCSV取り込み、永続履歴、共有ストレージのレート制限、顧客環境の受入試験。認証サービス・MySQL/BigQuery・書き込み・多言語対応は今回の対象外です。

[要件定義](docs/requirements.md) / [設計判断](docs/adr/001-local-harness.md) / [評価方針](docs/adr/003-evaluation.md)

## License

MIT。フォーク・改変・再利用できます。データはすべて架空です。

## UI・UX

グラスモーフィズムの画面に、質問例・結果フォーカス・入力を保持する再試行・キーボード操作を備えています。[UI UX Pro Maxを参照した設計と検証](docs/design.md)にデスクトップ・スマホの画面と判断理由を記載しています。
