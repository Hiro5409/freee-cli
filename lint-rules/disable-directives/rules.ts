import type { CommentLike, RuleContext } from "../rule.ts";
import { createRule } from "../rule.ts";

const DISABLE_DIRECTIVE_PATTERN = /^\s*(?:eslint|oxlint)-disable(?:-next-line|-line)?(?=\s|$)/;

export type DisableDirective = { rules: string; reason: string };

export const parseDisableDirective = (value: string): DisableDirective | null => {
  const match = DISABLE_DIRECTIVE_PATTERN.exec(value);
  if (!match) return null;

  const rest = value.slice(match[0].length);
  const separatorIndex = rest.search(/(^|\s)--(\s|$)/);

  if (separatorIndex === -1) {
    return { rules: rest.trim(), reason: "" };
  }

  return {
    rules: rest.slice(0, separatorIndex).trim(),
    reason: rest
      .slice(separatorIndex)
      .replace(/^\s*--\s*/, "")
      .trim(),
  };
};

const eachDisableDirective = (
  context: RuleContext,
  callback: (comment: CommentLike, directive: DisableDirective) => void,
) => ({
  Program() {
    for (const comment of context.sourceCode.getAllComments()) {
      const directive = parseDisableDirective(comment.value);
      if (directive) callback(comment, directive);
    }
  },
});

const requireDisableReasonMessage =
  'A disable directive without a reason cannot be re-evaluated or safely removed later. Append " -- <reason>" explaining why the violation is acceptable here.';

export const requireDisableReason = createRule(requireDisableReasonMessage, (context) =>
  eachDisableDirective(context, (comment, directive) => {
    if (directive.reason === "") {
      context.report({ loc: comment.loc, messageId: "default" });
    }
  }),
);

const noUnlimitedDisableMessage =
  'A disable directive without rule names silences every current and future rule. Name the rules to disable, e.g. "oxlint-disable-next-line no-console -- <reason>".';

export const noUnlimitedDisable = createRule(noUnlimitedDisableMessage, (context) =>
  eachDisableDirective(context, (comment, directive) => {
    if (directive.rules === "") {
      context.report({ loc: comment.loc, messageId: "default" });
    }
  }),
);
