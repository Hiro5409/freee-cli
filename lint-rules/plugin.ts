import { noUnlimitedDisable, requireDisableReason } from "./disable-directives/rules.ts";
import { noCrossCommandImport } from "./no-cross-command-import/rule.ts";

const plugin = {
  meta: {
    name: "eslint-plugin-freee-cli",
  },
  rules: {
    "no-cross-command-import": noCrossCommandImport,
    "no-unlimited-disable": noUnlimitedDisable,
    "require-disable-reason": requireDisableReason,
  },
};

export default plugin;
