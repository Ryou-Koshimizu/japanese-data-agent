# ローカル実行の詳細

READMEの「試す」で足りない場合の詳細です。

## ChatGPTサブスク（Codex CLI）で動かす

ローカル実行の追加接続として、ログイン済みの公式Codex CLIを呼び出せます。AI推論はOpenAIのクラウドで行い、画面・API・SQL検証・PostgreSQLは手元のマシンで動きます。ローカルでモデルそのものを実行する機能ではありません。

前提はCodex CLI（確認したバージョン: 0.162.1）とChatGPTログインです。`codex login status` で状態を確認できます。通常のOpenAI APIキーやClaude APIキーは使いません。ChatGPT/Codexのサブスク利用枠を消費し、無制限ではありません。利用できるモデルはアカウントによって異なります。

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

公式仕様: [Codex非対話実行と構造化出力](https://learn.chatgpt.com/docs/non-interactive-mode)、[Codex設定](https://learn.chatgpt.com/docs/config-file/config-reference)。Claude接続は `AGENT_PROVIDER=claude` に戻して従来の設定を使います。ChatGPTでの評価はClaudeの精度を証明しません。

## Docker を使わずに PostgreSQL を動かす（macOS / Homebrew の例）

DBは通常Docker Composeで起動します。検証に使ったmacOSでは、HomebrewのPostgreSQL 17をこのリポジトリ専用の `.local-data/postgres` で127.0.0.1:54324に起動しました。自動起動サービスには登録していません。

```sh
# 起動
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D "$PWD/.local-data/postgres" -l "$PWD/.local-data/postgres.log" -o '-h 127.0.0.1 -p 54324 -k /private/tmp' start
# 停止
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D "$PWD/.local-data/postgres" stop
```

## 実AIの画面テストと評価レポート

ローカルHTTP APIは `/api/analyze` です。画面にアクセス用トークンを入力してから質問します。`npm run test:live` は実AIによる初回質問・追加質問を正解SQLと比較し、CSV保存とスマホ表示までテストします。APIなしの画面テストは `npm run test:e2e` です。実AIテストは通常CIでは実行しません。

evalは各問の完了時に `reports/eval-*.json` を更新します。`status: complete` の50問レポートだけを全体精度として扱ってください。途中のレポートは完了扱いにしません。個別の再確認は `npm run eval -- --ids=03,06` のように実行でき、レポートには部分評価と明記します。ソースSHA-256・プロバイダー・モデル・effortを記録します。サブスク接続の費用はAPI単価に換算せず `null` とします。

費用を推計する場合だけ `.env.local` に `INPUT_USD_PER_MILLION`、`OUTPUT_USD_PER_MILLION`、`JPY_PER_USD` を設定してください。単価未設定なら費用は `null` です。キャッシュ割引や使用量が取得できなかった失敗呼び出しの請求は完全に反映しないため、請求額ではなく設定単価による推計です。

## Playwright のブラウザを取得できない環境

`npx playwright install chromium` がネットワーク制限で失敗する環境では、npm配布のChromium（例: `@sparticuz/chromium`）を取得し、`CHROMIUM_EXECUTABLE_PATH` にそのパスを指定して `npm run test:e2e` を実行できます。
