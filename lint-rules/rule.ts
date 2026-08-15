import type { TSESTree } from "@typescript-eslint/types";

export type CommentLike = Pick<TSESTree.Comment, "loc" | "value">;

type ReportDescriptor = { messageId: "default" } & (
  | { node: TSESTree.Node }
  | { loc: TSESTree.SourceLocation }
);

export type RuleContext = {
  filename: string;
  sourceCode: {
    getAllComments: () => CommentLike[];
  };
  report: (descriptor: ReportDescriptor) => void;
};

export const createRule = <Visitors extends object>(
  message: string,
  create: (context: RuleContext) => Visitors,
) => ({
  meta: {
    type: "problem",
    docs: {
      description: message,
    },
    schema: [],
    messages: {
      default: message,
    },
  },
  create,
});
