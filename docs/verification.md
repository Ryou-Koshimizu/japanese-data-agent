# 検証記録

実行日: 2026-10-11。APIキーを使わないローカル検証。

| 検証                | 実行結果                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck` | 成功                                                                                                         |
| `npm test`          | 62件成功、2件スキップ                                                                                        |
| `npm run build`     | 成功                                                                                                         |
| `npm run test:e2e`  | 2件成功（質問・固定回答・SQL・表、390pxスマホの横幅）                                                        |
| SQLの拒否           | UPDATE/DELETE/DROP、書き込みCTE、SELECT INTO、複数文、ロック、システム表、危険関数、特殊型、再帰などをテスト |
| 修正制御            | 修正SQLの再検証、初回＋最大3修正、権限・タイムアウト時の停止を確認                                           |
| DB権限              | PGliteのPostgreSQLエンジンで直接DELETE/DROP/CREATE/pg_read_fileを拒否、READ ONLYの更新拒否を確認             |
| データと正解SQL     | 175,330件を生成。40問の正解SQLすべてがAST検証・DB実行に成功                                                  |

PGliteはWASM版PostgreSQLエンジンです。通常のPostgreSQLサーバーへのネットワーク接続・pg-cursorの統合テスト2件はローカル環境にDockerがなくスキップしました。GitHub ActionsではPostgreSQL 17のDockerを起動して実行する構成です。CIの結果はActionsの実際の結果を確認してください。

画面テストはPlaywrightと、npm配布のChromium 153を使って実行しました。通常のPlaywrightブラウザ取得はこの作業環境でダウンロードエラーになったため、`CHROMIUM_EXECUTABLE_PATH` を指定する経路で検証しました。通常CIではPlaywright管理のブラウザを使用します。

実Claude APIは未実行です。LLMの正答率・レイテンシ・使用量・費用・プロンプトインジェクションへの実モデルの応答品質は未測定です。モックテストや正解SQLの実行成功をAI精度として扱っていません。

## GitHub Actionsでの検証

2026-10-11、コミット `dc53688bb6a0bbc675b9966dd3f09b0a54c65ecf` の [CI run #1](https://github.com/Ryou-Koshimizu/japanese-data-agent/actions/runs/38138636070) が成功しました。整形・型チェック・62件のテスト・本番ビルド・Playwright E2E 2件に加え、PostgreSQL 17をDockerで起動し、seedと通常の接続・cursor・読み取り専用権限の統合テスト2件も成功しました。実Claude APIの評価は引き続き未実行です。
