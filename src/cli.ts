import { cli, define } from "gunshi";
import { renderHeader } from "gunshi/renderer";

import { accountItemListCommand } from "./commands/account-item/list.ts";
import { loginCommand } from "./commands/auth/login.ts";
import { logoutCommand } from "./commands/auth/logout.ts";
import { statusCommand } from "./commands/auth/status.ts";
import { autoRegistrationRuleDeleteCommand } from "./commands/auto-registration-rule/delete.ts";
import { autoRegistrationRuleListCommand } from "./commands/auto-registration-rule/list.ts";
import {
  autoRegistrationRuleDisableCommand,
  autoRegistrationRuleEnableCommand,
} from "./commands/auto-registration-rule/set-active.ts";
import { autoRegistrationRuleShowCommand } from "./commands/auto-registration-rule/show.ts";
import {
  autoRegistrationRuleCreateCommand,
  autoRegistrationRuleUpdateCommand,
} from "./commands/auto-registration-rule/write.ts";
import { balanceSheetCommand } from "./commands/balance-sheet.ts";
import { companyListCommand } from "./commands/company/list.ts";
import { companySetDefaultCommand } from "./commands/company/set-default.ts";
import { dealCreateCommand } from "./commands/deal/create.ts";
import { dealDeleteCommand } from "./commands/deal/delete.ts";
import { dealListCommand } from "./commands/deal/list.ts";
import { dealPaymentCreateCommand } from "./commands/deal/payment-create.ts";
import { dealPaymentDeleteCommand } from "./commands/deal/payment-delete.ts";
import { dealPaymentUpdateCommand } from "./commands/deal/payment-update.ts";
import { dealShowCommand } from "./commands/deal/show.ts";
import { dealUpdateCommand } from "./commands/deal/update.ts";
import { fileBoxDeleteCommand } from "./commands/file-box/delete.ts";
import { fileBoxDownloadCommand } from "./commands/file-box/download.ts";
import { fileBoxListCommand } from "./commands/file-box/list.ts";
import { fileBoxShowCommand } from "./commands/file-box/show.ts";
import { fileBoxUpdateCommand } from "./commands/file-box/update.ts";
import { fileBoxUploadCommand } from "./commands/file-box/upload.ts";
import { generalLedgerCommand } from "./commands/general-ledger.ts";
import { hrEmployeeListCommand } from "./commands/hr/employee-list.ts";
import { hrPayrollListCommand } from "./commands/hr/payroll-list.ts";
import { invoiceCancelCommand } from "./commands/invoice/cancel.ts";
import { invoiceCreateCommand } from "./commands/invoice/create.ts";
import { invoiceListCommand } from "./commands/invoice/list.ts";
import { invoiceRestoreCommand } from "./commands/invoice/restore.ts";
import { invoiceShowCommand } from "./commands/invoice/show.ts";
import { invoiceTemplateListCommand } from "./commands/invoice/template-list.ts";
import { invoiceUpdateCommand } from "./commands/invoice/update.ts";
import { itemListCommand } from "./commands/item/list.ts";
import { journalExportCommand } from "./commands/journal/export.ts";
import { partnerCreateCommand } from "./commands/partner/create.ts";
import { partnerListCommand } from "./commands/partner/list.ts";
import { partnerShowCommand } from "./commands/partner/show.ts";
import { profileListCommand } from "./commands/profile/list.ts";
import { profileSetDefaultCommand } from "./commands/profile/set-default.ts";
import { profitAndLossCommand } from "./commands/profit-and-loss.ts";
import { sectionListCommand } from "./commands/section/list.ts";
import { segmentTagListCommand } from "./commands/segment-tag/list.ts";
import { setupCommand } from "./commands/setup.ts";
import { tagListCommand } from "./commands/tag/list.ts";
import { taxCodeListCommand } from "./commands/tax-code/list.ts";
import { transferDeleteCommand } from "./commands/transfer/delete.ts";
import { transferListCommand } from "./commands/transfer/list.ts";
import { transferShowCommand } from "./commands/transfer/show.ts";
import { transferCreateCommand, transferUpdateCommand } from "./commands/transfer/write.ts";
import { walletTransactionCreateCommand } from "./commands/wallet-transaction/create.ts";
import { walletTransactionDeleteCommand } from "./commands/wallet-transaction/delete.ts";
import { walletTransactionListCommand } from "./commands/wallet-transaction/list.ts";
import { walletTransactionShowCommand } from "./commands/wallet-transaction/show.ts";
import { walletableListCommand } from "./commands/walletable/list.ts";
import { printError } from "./error-output.ts";
import { globalArgs } from "./global-args.ts";

const rootCommand = define({
  name: "freee",
  description: "freee CLI - Command line interface for freee API",
  args: globalArgs,
  examples: `# Configure credentials and a default company
$ freee setup

# Read data for automation
$ freee deal-list --month 2026-08 --format json`,
  run: () => 'Run "freee --help" for usage information.',
});

export async function main() {
  const pkg = await import("../package.json", { with: { type: "json" } });

  await cli(process.argv.slice(2), rootCommand, {
    name: "freee",
    version: pkg.default.version,
    subCommands: {
      login: loginCommand,
      logout: logoutCommand,
      status: statusCommand,
      setup: setupCommand,
      "profile-list": profileListCommand,
      "profile-set-default": profileSetDefaultCommand,
      "deal-list": dealListCommand,
      "deal-show": dealShowCommand,
      "deal-create": dealCreateCommand,
      "deal-payment-create": dealPaymentCreateCommand,
      "deal-payment-update": dealPaymentUpdateCommand,
      "deal-payment-delete": dealPaymentDeleteCommand,
      "deal-update": dealUpdateCommand,
      "deal-delete": dealDeleteCommand,
      "hr-employee-list": hrEmployeeListCommand,
      "hr-payroll-list": hrPayrollListCommand,
      "wallet-txn-list": walletTransactionListCommand,
      "wallet-txn-show": walletTransactionShowCommand,
      "wallet-txn-delete": walletTransactionDeleteCommand,
      "walletable-list": walletableListCommand,
      "transfer-list": transferListCommand,
      "transfer-show": transferShowCommand,
      "transfer-create": transferCreateCommand,
      "transfer-update": transferUpdateCommand,
      "transfer-delete": transferDeleteCommand,
      "auto-rule-list": autoRegistrationRuleListCommand,
      "auto-rule-show": autoRegistrationRuleShowCommand,
      "auto-rule-create": autoRegistrationRuleCreateCommand,
      "auto-rule-update": autoRegistrationRuleUpdateCommand,
      "auto-rule-enable": autoRegistrationRuleEnableCommand,
      "auto-rule-disable": autoRegistrationRuleDisableCommand,
      "auto-rule-delete": autoRegistrationRuleDeleteCommand,
      "wallet-txn-create": walletTransactionCreateCommand,
      "account-item-list": accountItemListCommand,
      "tax-code-list": taxCodeListCommand,
      "section-list": sectionListCommand,
      "tag-list": tagListCommand,
      "segment-tag-list": segmentTagListCommand,
      "partner-list": partnerListCommand,
      "partner-show": partnerShowCommand,
      "partner-create": partnerCreateCommand,
      "item-list": itemListCommand,
      "file-box-list": fileBoxListCommand,
      "file-box-show": fileBoxShowCommand,
      "file-box-download": fileBoxDownloadCommand,
      "file-box-upload": fileBoxUploadCommand,
      "file-box-update": fileBoxUpdateCommand,
      "file-box-delete": fileBoxDeleteCommand,
      "invoice-list": invoiceListCommand,
      "invoice-show": invoiceShowCommand,
      "invoice-create": invoiceCreateCommand,
      "invoice-update": invoiceUpdateCommand,
      "invoice-cancel": invoiceCancelCommand,
      "invoice-restore": invoiceRestoreCommand,
      "invoice-template-list": invoiceTemplateListCommand,
      bs: balanceSheetCommand,
      pl: profitAndLossCommand,
      "general-ledger": generalLedgerCommand,
      "journal-export": journalExportCommand,
      "company-list": companyListCommand,
      "company-switch": companySetDefaultCommand,
    },
    strict: true,
    renderHeader: (ctx) => {
      if (!ctx.values.help) return Promise.resolve("");
      return renderHeader(ctx);
    },
    renderValidationErrors: null,
    // gunshi renders --help/--version itself and hands the same text back here;
    // everything else is command output that only gets printed if we print it.
    onAfterCommand: (ctx, result) => {
      if (ctx.values.help || ctx.values.version) return;
      if (result) console.log(result);
    },
    onErrorCommand: (ctx, error) => {
      printError(error, String(ctx.values.format ?? "table"), ctx.commandPath);
    },
  });
}
