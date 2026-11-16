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
import { quotationCreateCommand } from "./commands/quotation/create.ts";
import { quotationListCommand } from "./commands/quotation/list.ts";
import { quotationShowCommand } from "./commands/quotation/show.ts";
import { quotationTemplateListCommand } from "./commands/quotation/template-list.ts";
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
import {
  walletTransactionApplyRulesCommand,
  walletTransactionIgnoreCommand,
  walletTransactionRegisterCommand,
  walletTransactionRegisterPrivateCommand,
  walletTransactionResetCommand,
  walletTransactionSettleCommand,
  walletTransactionTransferCommand,
} from "./commands/wallet-transaction/process.ts";
import { walletTransactionShowCommand } from "./commands/wallet-transaction/show.ts";
import { walletableListCommand } from "./commands/walletable/list.ts";
import { printError } from "./error-output.ts";
import { CliError } from "./errors.ts";
import { globalArgs } from "./global-args.ts";
import { writeOutput } from "./output/write.ts";
import {
  invoiceRegisterDealCommand,
  invoiceSetSendingStatusCommand,
  walletableSyncCommand,
} from "./plugins/web-operations/commands.ts";

function requireSubcommand(): never {
  throw new CliError("A subcommand is required.", {
    code: "INVALID_INPUT",
    why: "This command only groups subcommands.",
  });
}

const commands = {
  auth: define({
    name: "auth",
    description: "Manage API and browser authentication",
    subCommands: {
      login: loginCommand,
      logout: logoutCommand,
      status: statusCommand,
    },
    run: requireSubcommand,
  }),
  setup: setupCommand,
  profile: define({
    name: "profile",
    description: "List connection profiles and choose a default",
    subCommands: {
      list: profileListCommand,
      "set-default": profileSetDefaultCommand,
    },
    run: requireSubcommand,
  }),
  deal: define({
    name: "deal",
    description: "Manage accounting transactions and payments",
    subCommands: {
      list: dealListCommand,
      show: dealShowCommand,
      create: dealCreateCommand,
      payment: define({
        name: "payment",
        description: "Manage deal payment",
        subCommands: {
          create: dealPaymentCreateCommand,
          update: dealPaymentUpdateCommand,
          delete: dealPaymentDeleteCommand,
        },
        run: requireSubcommand,
      }),
      update: dealUpdateCommand,
      delete: dealDeleteCommand,
    },
    run: requireSubcommand,
  }),
  hr: define({
    name: "hr",
    description: "Read employee and payroll information",
    subCommands: {
      employee: define({
        name: "employee",
        description: "Manage hr employee",
        subCommands: {
          list: hrEmployeeListCommand,
        },
        run: requireSubcommand,
      }),
      payroll: define({
        name: "payroll",
        description: "Manage hr payroll",
        subCommands: {
          list: hrPayrollListCommand,
        },
        run: requireSubcommand,
      }),
    },
    run: requireSubcommand,
  }),
  "wallet-txn": define({
    name: "wallet-txn",
    description: "Inspect and process bank and card statement entries",
    subCommands: {
      list: walletTransactionListCommand,
      show: walletTransactionShowCommand,
      delete: walletTransactionDeleteCommand,
      create: walletTransactionCreateCommand,
      "apply-rules": walletTransactionApplyRulesCommand,
      ignore: walletTransactionIgnoreCommand,
      register: walletTransactionRegisterCommand,
      reset: walletTransactionResetCommand,
      "register-private": walletTransactionRegisterPrivateCommand,
      settle: walletTransactionSettleCommand,
      transfer: walletTransactionTransferCommand,
    },
    run: requireSubcommand,
  }),
  walletable: define({
    name: "walletable",
    description: "List and synchronize bank, card, and wallet accounts",
    subCommands: {
      list: walletableListCommand,
      sync: walletableSyncCommand,
    },
    run: requireSubcommand,
  }),
  transfer: define({
    name: "transfer",
    description: "Manage transfer",
    subCommands: {
      list: transferListCommand,
      show: transferShowCommand,
      create: transferCreateCommand,
      update: transferUpdateCommand,
      delete: transferDeleteCommand,
    },
    run: requireSubcommand,
  }),
  "auto-rule": define({
    name: "auto-rule",
    description: "Manage automatic bookkeeping rules",
    subCommands: {
      list: autoRegistrationRuleListCommand,
      show: autoRegistrationRuleShowCommand,
      create: autoRegistrationRuleCreateCommand,
      update: autoRegistrationRuleUpdateCommand,
      enable: autoRegistrationRuleEnableCommand,
      disable: autoRegistrationRuleDisableCommand,
      delete: autoRegistrationRuleDeleteCommand,
    },
    run: requireSubcommand,
  }),
  "account-item": define({
    name: "account-item",
    description: "Manage account-item",
    subCommands: {
      list: accountItemListCommand,
    },
    run: requireSubcommand,
  }),
  "tax-code": define({
    name: "tax-code",
    description: "Manage tax-code",
    subCommands: {
      list: taxCodeListCommand,
    },
    run: requireSubcommand,
  }),
  section: define({
    name: "section",
    description: "Manage section",
    subCommands: {
      list: sectionListCommand,
    },
    run: requireSubcommand,
  }),
  tag: define({
    name: "tag",
    description: "Manage tag",
    subCommands: {
      list: tagListCommand,
    },
    run: requireSubcommand,
  }),
  "segment-tag": define({
    name: "segment-tag",
    description: "Manage segment-tag",
    subCommands: {
      list: segmentTagListCommand,
    },
    run: requireSubcommand,
  }),
  partner: define({
    name: "partner",
    description: "Manage partner",
    subCommands: {
      list: partnerListCommand,
      show: partnerShowCommand,
      create: partnerCreateCommand,
    },
    run: requireSubcommand,
  }),
  item: define({
    name: "item",
    description: "Manage item",
    subCommands: {
      list: itemListCommand,
    },
    run: requireSubcommand,
  }),
  "file-box": define({
    name: "file-box",
    description: "Manage evidence files and their metadata",
    subCommands: {
      list: fileBoxListCommand,
      show: fileBoxShowCommand,
      download: fileBoxDownloadCommand,
      upload: fileBoxUploadCommand,
      update: fileBoxUpdateCommand,
      delete: fileBoxDeleteCommand,
    },
    run: requireSubcommand,
  }),
  invoice: define({
    name: "invoice",
    description: "Manage invoice",
    subCommands: {
      list: invoiceListCommand,
      show: invoiceShowCommand,
      create: invoiceCreateCommand,
      update: invoiceUpdateCommand,
      cancel: invoiceCancelCommand,
      restore: invoiceRestoreCommand,
      "register-deal": invoiceRegisterDealCommand,
      "set-sending-status": invoiceSetSendingStatusCommand,
    },
    run: requireSubcommand,
  }),
  "invoice-template": define({
    name: "invoice-template",
    description: "Manage invoice-template",
    subCommands: {
      list: invoiceTemplateListCommand,
    },
    run: requireSubcommand,
  }),
  quotation: define({
    name: "quotation",
    description: "Manage quotation",
    subCommands: {
      list: quotationListCommand,
      show: quotationShowCommand,
      create: quotationCreateCommand,
    },
    run: requireSubcommand,
  }),
  "quotation-template": define({
    name: "quotation-template",
    description: "Manage quotation-template",
    subCommands: {
      list: quotationTemplateListCommand,
    },
    run: requireSubcommand,
  }),
  "balance-sheet": define({
    name: "balance-sheet",
    description: "Manage balance-sheet",
    subCommands: {
      show: balanceSheetCommand,
    },
    run: requireSubcommand,
  }),
  "profit-and-loss": define({
    name: "profit-and-loss",
    description: "Manage profit-and-loss",
    subCommands: {
      show: profitAndLossCommand,
    },
    run: requireSubcommand,
  }),
  "general-ledger": define({
    name: "general-ledger",
    description: "Manage general-ledger",
    subCommands: {
      list: generalLedgerCommand,
    },
    run: requireSubcommand,
  }),
  journal: define({
    name: "journal",
    description: "Manage journal",
    subCommands: {
      export: journalExportCommand,
    },
    run: requireSubcommand,
  }),
  company: define({
    name: "company",
    description: "List freee companies and select a profile company",
    subCommands: {
      list: companyListCommand,
      switch: companySetDefaultCommand,
    },
    run: requireSubcommand,
  }),
};

const rootCommand = define({
  name: "freee",
  description: "freee CLI - Command line interface for freee API",
  args: globalArgs,
  examples: `# Configure credentials and a default company
$ freee setup

# Read data for automation
$ freee deal list --month 2026-08`,
  run: requireSubcommand,
});

export async function main() {
  const pkg = await import("../package.json", { with: { type: "json" } });

  await cli(process.argv.slice(2), rootCommand, {
    name: "freee",
    version: pkg.default.version,
    subCommands: commands,
    strict: true,
    renderHeader: (ctx) => {
      if (!ctx.values.help) return Promise.resolve("");
      return renderHeader(ctx);
    },
    renderValidationErrors: null,
    // gunshi has already printed --help and --version output.
    onAfterCommand: (ctx, result) => {
      if (ctx.values.help === true || ctx.values.version === true) return;
      if (result) return writeOutput(result);
    },
    onErrorCommand: (ctx, error) => {
      printError(error, ctx.commandPath);
    },
  });
}
