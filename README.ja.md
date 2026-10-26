<h1 align="center">freee-cli</h1>

<p align="center">
  <a href="https://developer.freee.co.jp/">freee API</a> の非公式 CLI。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/freee-cli"><img src="https://img.shields.io/npm/v/freee-cli" alt="npm version"></a>
  <a href="https://github.com/Hiro5409/freee-cli/actions/workflows/ci.yml"><img src="https://github.com/Hiro5409/freee-cli/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/Hiro5409/freee-cli" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="README.md">English</a> | 日本語
</p>

## なぜCLIなのか

freeeは、すでに[公式MCPサーバー](https://github.com/freee/freee-mcp)を提供しています。
freee-cliを作った理由は、シェルを使えるcoding agentにはCLIの方が優れたインターフェースだと考えているからです。

CLIなら、coding agent、開発者、スクリプト、CIが同じインターフェースを使えます。
コマンドを`--help`で調べ、ファイルやパイプと組み合わせ、不具合の調査では直接実行できます。

そのため、freee-cliは用途固有のワークフローではなく、小さなfreee操作を提供します。
JSON出力、構造化エラーに加え、指定済みの引数以上の差分を確認できる操作だけに`--dry-run`を提供します。

## 公式OpenAPIスキーマへの追従

APIクライアントは、freeeがメンテナンスして公開する[OpenAPIスキーマ](https://github.com/freee/freee-api-schema)から生成します。

## クイックスタート

```bash
bunx freee-cli setup
```

## インストール

```bash
bun add -g freee-cli
```

## 使い方

```bash
freee --help
freee <command> --help
```

### 認証

```bash
freee auth login --profile personal
freee profile list
freee company list
freee company switch --id 1234567 --name "My Company"
```

### 会計

```bash
freee deal list --month 2026-08
freee deal create --date 2026-08-15 --type expense \
  --account-item-id 123 --tax-code 136 --amount 5000
freee wallet-txn list --month 2026-08 --status unreconciled
freee wallet-txn show --id 42
freee transfer list --month 2026-08
freee transfer create --date 2026-08-01 \
  --from-walletable-id 10 --from-walletable-type bank_account \
  --to '{"type":"credit_card","id":20,"amount":5000}'
freee file-box list --start-date 2026-08-01 --end-date 2026-08-31 --category without-deal
freee file-box upload --file receipt.jpg
freee section list
freee tag list
freee segment-tag list --segment 1
freee balance-sheet show --fiscal-year 2025
freee profit-and-loss show --fiscal-year 2025
freee general-ledger list --start-date 2025-01-01 --end-date 2025-12-31 \
  --account-item-name 売上高 --format json
freee journal export --download-type generic_v2 --encoding utf-8 \
  --start-date 2025-01-01 --end-date 2025-12-31 --output journal-2025.csv
```

### 自動登録ルール

```bash
freee auto-rule list --active active
freee auto-rule create --act auto-standard --description AMAZON --condition partial \
  --entry-side expense --priority 5 --tax-name 課対仕入10% \
  --account-item-name 消耗品費 --qualified-invoice-setting qualified --dry-run
freee auto-rule update --id 42 --account-item-name 通信費 --dry-run
freee auto-rule update --id 42 --clear walletable --dry-run --format json
freee auto-rule disable --id 42 --dry-run
freee wallet-txn create --date 2026-08-01 --entry-side expense --amount 5000 \
  --walletable-id 55 --walletable-type credit_card --description AMAZON.CO.JP
```

`auto-rule-update --clear <field>` は、JSON `null` を送って任意のルール条件を解除します。
複数の条件を一度に解除する場合は `--clear` を繰り返します。コマンドで指定していない項目は
現在の値を保持します。

### 請求書

```bash
freee invoice list --sending-status unsent
freee invoice create --partner-id 123 --billing-date 2026-08-01 \
  --line '{"description":"コンサルティング","quantity":1,"unit_price":"100000","tax_rate":10,"account_item_id":123,"tax_code":129}'
freee invoice update --id 456 --subject "8月分ご請求" --dry-run
```

### 見積書

見積書はfreee請求書APIと見積書専用の帳票テンプレートを使用します。

```bash
freee quotation list --month 2026-10 --format json
freee quotation show --id 456 --format json
freee quotation-template list --format json
freee quotation create --partner-id 123 --quotation-date 2026-10-01 \
  --expiration-date 2026-10-31 --subject "開発費見積" \
  --line '{"description":"開発費","quantity":1,"unit_price":"100000","tax_rate":10}' --format json
```

取引先は`--partner-id`または`--partner-code`のどちらかで指定します。
複数明細は`--line`を繰り返し、テキスト行は`type`と`description`のみを指定します。
`--delivery-deadline`と`--delivery-location`で納品条件を指定できます。
自動採番しない事業所では`--quotation-number`が必要です。作成した見積書は保存され、送付されません。

### 人事労務

```bash
freee hr employee list --month 2026-08
freee hr payroll list --month 2026-08
```

### 口座明細の処理

口座明細の無視・解除・取引登録・消込・振替・自動登録ルール適用は公式会計APIを使います。勘定科目・税区分・振替相手口座はIDで指定します。

```bash
freee wallet-txn ignore --id 42
freee wallet-txn reset --id 42
freee wallet-txn register --id 42 --body '{"deal_lines":[{"account_item_id":101,"amount":10000,"description":"クラウド利用料"}]}'
freee wallet-txn register-private --id 42
freee wallet-txn settle --id 42 --body '{"deals":[{"deal_id":91,"amount":10000}]}'
freee wallet-txn transfer --id 42 --body '{"transfer_from_line":{"walletable_id":1,"walletable_type":"bank_account"},"transfer_to_lines":[{"walletable_id":7,"walletable_type":"wallet","amount":10000}]}'
freee wallet-txn apply-rules --id 42 --id 43 --format json
```

`register`・`settle`・`transfer`は[公式APIのリクエスト本文](https://developer.freee.co.jp/reference/accounting)を`--body`のJSONで受け取ります。`company_id`はプロファイルまたは`--company-id`の値で上書きします。登録の全項目、複数取引の決済と差額取引、複数口座への振替と手数料を指定できます。CLIは1回のAPIリクエストの結果を返し、事前取得・プレビュー・dry-run・処理後の再取得は行いません。会計上の検証と省略時の既定値はfreeeが扱います。`reset`は明細を未処理へ戻します。`register-private`の科目は、個人・法人に応じてfreeeが決めます。

自動登録ルール適用は、1〜1,000件の明細IDの指定が必須の非同期処理です。処理済みなど適用対象外の明細はfreeeがスキップし、CLIは状態による事前除外や拒否を行いません。`queued`は受付済みを意味し、適用完了や条件一致を意味しません。対象明細を再取得して結果を確認します。書き込みの自動再送は行いません。`OUTCOME_UNKNOWN`では、再実行する前に対象明細を確認します。

### ブラウザ経由の操作

請求書の取引登録・送付ステータス変更・口座同期は[Agent Browser](https://github.com/vercel-labs/agent-browser)を使います。`freee auth login --web --profile <name>`で専用ブラウザを開き、ログインと対象事業所の選択を行います。最大5分待ち、確認できた状態だけを暗号化して保存します。`freee auth status --format json`でAPIとWebの認証状態を個別に確認できます。

```bash
freee invoice register-deal --id 456
freee invoice set-sending-status --id 456 --status sent
freee walletable sync --id 42
freee walletable sync --all
```

口座同期は最大1時間待ちます。表形式ではstderrへ進捗を表示します。`--all`の対象はfreeeが選び、結果には同期を開始して完了した口座を含めます。

ブラウザ操作の対応範囲は[Web操作モジュール](src/plugins/web-operations/README.md)を参照してください。認証状態はCLIがリポジトリ外で管理します。

```ts
import { withFreeeWeb } from "freee-cli/experimental/web";
import { resolveFreeeScope } from "freee-cli/profiles";

const scope = resolveFreeeScope("business");
await withFreeeWeb(scope, async (web) => console.log(await web.walletableSummary()));
```

## エージェントから使う

```bash
gh skill install Hiro5409/freee-cli freee-cli
```

## 開発

[mise](https://mise.jdx.dev/getting-started.html) をインストールして有効化します。`mise.toml` は Bun、Node.js、GitHub CLI、Gitleaks、Lefthook のバージョンを固定し、ローカルにインストールした Vite+ のコマンドを `PATH` に追加します。

```bash
mise trust
mise install
bun install --frozen-lockfile
lefthook install
bun run check
```

[Lefthook](https://lefthook.dev/) が `lefthook.yml` の Git フックを実行します。pre-commit はステージしたファイルを整形・lint・型検査し、続けて Gitleaks で秘匿情報を検査します。pre-push は CI と同じ `bun audit --audit-level=high` を実行します。post-checkout は `node_modules` が無いときに lockfile どおりに依存をインストールします。CI は `bun run check` の全項目を実行し、同じバージョンの Gitleaks で Git 履歴を検査します。

## リリース

メンテナーは `main` からリリースします。`package.json` の新しい `version` をコミットして `main` に push し、そのバージョンの注釈付きタグを push します。

```bash
git tag -a v1.2.3 --cleanup=verbatim -F - <<'NOTES'
## Changes

- Describe a change a user will notice.
NOTES
git push origin v1.2.3
```

タグメッセージには、利用者が気づく変更を Markdown で書きます。このメッセージが GitHub Release のリリースノートになります。Git はメッセージを標準入力から読み取り、`--cleanup=verbatim` によって、見出しなど `#` で始まる行がコメントとして削除されずに残ります。

タグの push で Release ワークフローが始まります。ワークフローは、タグが注釈付きであること、`package.json` と一致すること、`main` に含まれることを検証し、タグのコミットで CI を実行します。CI は npm 成果物を一度だけ pack してその tarball をスモークテストし、公開用の2つのジョブはビルドし直さずにテスト済みの成果物をダウンロードします。

1つ目のジョブは trusted publishing で成果物を provenance 付きで npm に公開します。npm は新しいバージョンを配信前に[スキャンする](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/)ため、2つ目のジョブはバージョンが見えるようになるまで最大30分待ちます。そのうえで、npm に公開されたバージョンの integrity がテスト済みの成果物と一致するときだけ GitHub Release を作成します。immutable release は公開後にアセットを変更できないため、ドラフトの段階で成果物を添付してから公開します。

リリースには、リポジトリ外で次の設定を行います。

- npm の [trusted publisher](https://docs.npmjs.com/trusted-publishers/): ユーザー `Hiro5409`、リポジトリ `freee-cli`、ワークフローファイル名 `release.yml`、environment は指定なし。
- リポジトリの [immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases): 公開済み GitHub Release のタグと添付成果物は変更できません。
- `v*` を対象とする有効なタグRuleset: 更新・削除を禁止し、新規作成は許可します。バイパス対象は設定しません。タグはpush直後から保護され、CIやnpm公開の実行中も変更できません。

通信などの一時的な失敗は、同じタグからワークフローを再実行します。

```bash
gh workflow run release.yml --ref v1.2.3
```

再実行はタグのコミットをもう一度 pack してテストします。pack は再現可能なので、以前の実行が公開した成果物と同じものをテストします。どの実行も現在の状態に応じて動きます。npm にバージョンが見えなければ成果物を公開し、タグに公開済みの Release が無ければ GitHub Release を作成します。テスト済みの成果物を持つ公開済み Release は完了しているので、そのままにします。ブランチから開始した実行はタグの検証で止まります。ワークフローが `main`、バージョン、タグを変更することはありません。

再実行では同じタグのコードとワークフローを使います。タグの参照先・注釈・ワークフローを修正する場合は、`main` を直し、新しいバージョンと注釈付きタグでリリースします。既存のリリースタグは付け替え・再利用しません。

npm または GitHub を読み取れないとき、公開済みのバージョンがテスト済みの成果物と異なるとき、公開済み Release にテスト済みの成果物が無いか digest が異なるとき、実行は止まります。ワークフローはそのような Release を修復しません。

npm が30分以内にバージョンを配信しないと実行は失敗します。npm でバージョンが見えるようになってからワークフローを再実行します。それより前に開始した実行は、同じバージョンをもう一度公開しようとします。

GitHub CLI は成果物の添付または Release の公開に失敗するとドラフトの削除を試みます。削除の失敗や実行の中断でドラフトが残ることがあります。ワークフローはドラフトを探さないため、メンテナーが削除します。

## ライセンス

MIT
