# ADR 001: 閲覧者が自分の環境で動かす

採用: 2026-10-11。

審査用ポートフォリオは作者負担の公開AIサービスではなく、再現可能なハーネスとして配布する。標準DBはローカルPostgreSQLをDocker Composeで提供し、Supabaseは任意接続先とする。管理用と分析用の接続を分離する。Vercelは必須にしない。

UI・CLI・evalは依存注入した同じanalyze関数を使う。Claude APIはAI SDKの型付き出力とZodで検証する。モデルIDは利用者が指定する。固定回答のデモは別経路とし、実AIに失敗してもデモへ自動移行しない。

トレードオフ: 実行にはDockerかPostgreSQLを使う。APIキーなしでもUIを体験でき、AIの正答率は実AIのevalで別に測る。実LLM評価は利用者が明示的に実行する。
