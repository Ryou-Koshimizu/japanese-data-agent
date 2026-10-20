# ローカル実行の詳細

READMEの「試す」の続きで、ローカル実行の詳しい手順です。

## ChatGPTサブスク（Codex CLI）で動かす

ローカル実行の追加接続として、ログイン済みの公式Codex CLIを呼び出せます。AI推論はOpenAIのクラウドで行い、画面・API・SQL検証・PostgreSQLは手元のマシンで動きます。

前提はCodex CLI（確認したバージョン: 0.162.1）とChatGPTログインです。`codex login status` で状態を確認できます。OpenAI APIキーやClaude APIキーは使わず、ChatGPT/Codexのサブスク利用枠を消費します。利用枠の上限に達したときは `CODEX_RATE_LIMIT` で止まり、評価は途中結果を保存して停止します。利用できるモデルはアカウントによって異なります。

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

CLI・UI・evalは同じハーネスを通ります。Codexは一時ディレクトリで読み取り専用サンドボックスを使用し、ユーザー設定・プラグイン・MCP連携・シェル・ブラウザ等を無効にして構造化JSONを要求します。CLIの既存認証は公式CLIだけが利用し、アプリは認証ファイルを読みません。DB接続情報やClaudeキーは子プロセスに渡しません。AIが出したSQLをCodex自身が実行することはなく、アプリ側のAST検証・読み取り専用ロールが引き続き実行を制御します。

公式仕様: [Codex非対話実行と構造化出力](https://learn.chatgpt.com/docs/non-interactive-mode)、[Codex設定](https://learn.chatgpt.com/docs/config-file/config-reference)。Claude接続は `AGENT_PROVIDER=claude` に戻して従来の設定を使います。Claudeでの正答率は、その設定で同じ `npm run eval` を実行して記録します。

## Docker を使わずに PostgreSQL を動かす（macOS / Homebrew の例）

DBは通常Docker Composeで起動します。検証に使ったmacOSでは、HomebrewのPostgreSQL 17をこのリポジトリ専用の `.local-data/postgres` で127.0.0.1に起動しています（自動起動サービスには登録しません）。ポートを変えるときは `-p` と `DATABASE_URL` を合わせ、実PostgreSQLテストには `POSTGRES_TEST_PORT` を渡します。

```sh
# 起動
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D "$PWD/.local-data/postgres" -l "$PWD/.local-data/postgres.log" -o '-h 127.0.0.1 -p 54324 -k /private/tmp' start
# 停止
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D "$PWD/.local-data/postgres" stop
```

## 実AIの画面テストと評価レポート

ローカルHTTP APIは `/api/analyze` です。画面にアクセス用トークンを入力してから質問します。`npm run test:live` は実AIによる3本の集計の調査、初回質問・追加質問を正解SQLと比較し、CSV・分析メモの保存とスマホ表示までChromium・WebKitの両方で確かめます。APIなしの画面テストは `npm run test:e2e` です。実AIテストは利用枠を使うため、CIでは流さず手元で実行します。

evalは各問の完了時に `reports/eval-*.json` を更新します。全体の正答率には `status: complete`・`fullSuite: true` の50問レポートを使います。個別の再確認は `npm run eval -- --ids=03,06` のように実行でき、レポートには部分評価と記録されます。ソースSHA-256・プロバイダー・モデル・effortを記録します。サブスク接続の費用はAPI単価に換算せず `null` とします。

費用を推計する場合は `.env.local` に `INPUT_USD_PER_MILLION`、`OUTPUT_USD_PER_MILLION`、`JPY_PER_USD` を設定します。設定した単価×使用トークンで計算する推計値で（キャッシュ入力も通常入力として数える保守的な値）、単価を設定しないときは `null` です。

## 画面テスト（Chromium・WebKit）

`npx playwright install chromium webkit` のあと `npm run test:e2e` で、両方のブラウザで画面テストを流します。開発サーバーのポートは `E2E_PORT`（既定3002）、実AIの画面テストは `LIVE_PORT`（既定3001）で変えられます。ネットワーク制限でブラウザを取得できない環境では、npm配布のChromium（例: `@sparticuz/chromium`）のパスを `CHROMIUM_EXECUTABLE_PATH` に指定して Chromium だけを流せます（`--project=chromium`）。
