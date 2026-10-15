# Security Policy

## 脆弱性の報告

脆弱性を見つけた場合は、公開のIssueではなく、GitHubの [Private vulnerability reporting](https://github.com/Ryou-Koshimizu/japanese-data-agent/security/advisories/new) から非公開で報告してください。

報告に含めてほしいもの：

- 影響を受けるファイル・エンドポイント・コミット
- 再現手順（同梱の架空データで再現できる形）
- 想定される影響

受領の連絡は7日以内を目安に行います。修正までの間、詳細の公開は控えてください。

## 対象

- `main` ブランチの最新コミット
- 公開デモ（`AGENT_MODE=demo`：AI呼び出し・SQL実行なし）と、実AIモード（利用者自身のAPIキーまたはChatGPTログイン）のアプリ、DB初期化SQL、CI設定

対象外：依存パッケージそのものの脆弱性（各プロジェクトへ報告してください）、利用者が自分で用意した環境の設定不備、ソーシャルエンジニアリング、DoS。

## このリポジトリが行っている対策

- AIが作ったSQLは構文木で検証し、読み取り専用のDBロール・時間と行数の上限の下でだけ実行（[SQLの安全性](docs/adr/002-sql-safety.md)、[脅威モデル](docs/security.md)）
- 公開前の点検結果は [公開前のセキュリティ確認](docs/security-publication.md)
- GitHub側：Secret scanningとPush protection、Dependabot、CodeQL、依存関係の審査、GitHub Actionsのコミット固定と最小権限

## 秘密情報について

リポジトリにAPIキー・実在の顧客データ・作者の認証情報は含めません。`.env.example` と `db/init.sql` のDBパスワードはローカル専用の公開サンプル値です。本番・共有環境では使わないでください。
