# freee-cli agent notes

間違えやすいリポジトリ固有の事実。

- `src/types/{freee,freee-invoice,freee-hr}/` は `bun run generate-types` の生成物。
  手で編集しない。
- API 仕様の正本は `openapi-ts.config.ts` が参照する live の OpenAPI
  スキーマ。`api-schema*.baseline.*` はドリフト検出用のスナップショットにすぎない。
- 各 PUT の更新セマンティクスは live の operation ドキュメントで確認する。全置換 PUT は
  リソースを取得して可変フィールドを全て送り直し、キーの網羅を型レベルで強制する —
  SDK 再生成で新フィールドがコンパイルエラーとして現れるように
  （例: `src/commands/auto-rule/set-active.ts`）。
- コマンドの `run()` は結果文字列を返し、`src/cli.ts` が出力する。コマンド内の
  `console.log` は legacy — 増やさない。
- gunshi のパース: 先頭ダッシュの値は `--arg=-100` 形式で渡す。必須文字列の空値は
  パーサが弾くので二重の検証は書かない。
- 会計APIと請求書API (iv) は同じリソース名を別物に使う。`receipts` は会計では
  ファイルボックスの証憑、iv では帳票としての領収書。`quotations` は両APIに存在する。
  会計の `/api/1/invoices` は廃止済みで、現行の請求書は iv API の `/invoices`。
  シンボルがどちらの SDK 由来かを確認してから推論すること。
