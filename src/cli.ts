import { cli, define } from "gunshi";
import { renderHeader } from "gunshi/renderer";

import { accountItemListCommand } from "./commands/account-item/list.ts";
import { loginCommand } from "./commands/auth/login.ts";
import { logoutCommand } from "./commands/auth/logout.ts";
import { statusCommand } from "./commands/auth/status.ts";
import { autoRuleApplyCommand } from "./commands/auto-rule/apply.ts";
import { autoRuleCreateCommand } from "./commands/auto-rule/create.ts";
import { autoRuleDeleteCommand } from "./commands/auto-rule/delete.ts";
import { autoRuleListCommand } from "./commands/auto-rule/list.ts";
import { autoRuleDisableCommand, autoRuleEnableCommand } from "./commands/auto-rule/set-active.ts";
import { autoRuleShowCommand } from "./commands/auto-rule/show.ts";
import { bsCommand } from "./commands/bs.ts";
import { companyListCommand } from "./commands/company/list.ts";
import { companySwitchCommand } from "./commands/company/switch.ts";
import { dealCreateCommand } from "./commands/deal/create.ts";
import { dealListCommand } from "./commands/deal/list.ts";
import { dealShowCommand } from "./commands/deal/show.ts";
import { dealUpdateCommand } from "./commands/deal/update.ts";
import { docsCommand } from "./commands/docs.ts";
import { hrEmployeeListCommand } from "./commands/hr/employee-list.ts";
import { hrPayrollListCommand } from "./commands/hr/payroll-list.ts";
import { invoiceCreateCommand } from "./commands/invoice/create.ts";
import { invoiceListCommand } from "./commands/invoice/list.ts";
import { invoiceUpdateCommand } from "./commands/invoice/update.ts";
import { itemListCommand } from "./commands/item/list.ts";
import { partnerListCommand } from "./commands/partner/list.ts";
import { plCommand } from "./commands/pl.ts";
import { profileListCommand } from "./commands/profile/list.ts";
import { profileSetDefaultCommand } from "./commands/profile/set-default.ts";
import { receiptListCommand } from "./commands/receipt/list.ts";
import { receiptUploadCommand } from "./commands/receipt/upload.ts";
import { setupCommand } from "./commands/setup.ts";
import { taxCodeListCommand } from "./commands/tax-code/list.ts";
import { walletTxnListCommand } from "./commands/wallet-txn/list.ts";
import { walletListCommand } from "./commands/wallet/list.ts";
import { printError } from "./error-output.ts";
import { globalArgs } from "./global-args.ts";
import { howBookedCommand } from "./workflows/how-booked.ts";
import { receiptAttachCommand } from "./workflows/receipt-attach.ts";

const rootCommand = define({
  name: "freee",
  description: "freee CLI - Command line interface for freee API",
  args: globalArgs,
  examples: `# Configure credentials and a default company
$ freee setup

# Discover bundled guidance
$ freee docs list --format json

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
      // auth
      login: loginCommand,
      logout: logoutCommand,
      status: statusCommand,
      setup: setupCommand,
      "profile-list": profileListCommand,
      "profile-set-default": profileSetDefaultCommand,
      // deal
      "deal-list": dealListCommand,
      "deal-show": dealShowCommand,
      "deal-create": dealCreateCommand,
      "deal-update": dealUpdateCommand,
      docs: docsCommand,
      // HR
      "hr-employee-list": hrEmployeeListCommand,
      "hr-payroll-list": hrPayrollListCommand,
      // wallet
      "wallet-txn-list": walletTxnListCommand,
      "wallet-list": walletListCommand,
      // auto rules
      "auto-rule-list": autoRuleListCommand,
      "auto-rule-show": autoRuleShowCommand,
      "auto-rule-create": autoRuleCreateCommand,
      "auto-rule-enable": autoRuleEnableCommand,
      "auto-rule-disable": autoRuleDisableCommand,
      "auto-rule-delete": autoRuleDeleteCommand,
      "auto-rule-apply": autoRuleApplyCommand,
      // master data
      "account-item-list": accountItemListCommand,
      "tax-code-list": taxCodeListCommand,
      "partner-list": partnerListCommand,
      "item-list": itemListCommand,
      // receipt & invoice
      "receipt-list": receiptListCommand,
      "receipt-upload": receiptUploadCommand,
      "invoice-list": invoiceListCommand,
      "invoice-create": invoiceCreateCommand,
      "invoice-update": invoiceUpdateCommand,
      // reports
      bs: bsCommand,
      pl: plCommand,
      // company
      "company-list": companyListCommand,
      "company-switch": companySwitchCommand,
      // workflows
      "how-booked": howBookedCommand,
      "receipt-attach": receiptAttachCommand,
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
