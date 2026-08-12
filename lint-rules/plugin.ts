import type { TSESTree } from "@typescript-eslint/types";

type CommentLike = Pick<TSESTree.Comment, "loc" | "value">;

type SourceCodeLike = {
  getText: (node: TSESTree.Node) => string;
  getAllComments: () => CommentLike[];
};

type ReportDescriptor = { messageId: "default" } & (
  | { node: TSESTree.Node }
  | { loc: TSESTree.SourceLocation }
);

type RuleContext = {
  filename: string;
  sourceCode: SourceCodeLike;
  report: (descriptor: ReportDescriptor) => void;
};

const createRule = <Visitors extends object>(
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

// --- 抑制コメントの規律 ---

const DISABLE_DIRECTIVE_PATTERN = /^\s*(?:eslint|oxlint)-disable(?:-next-line|-line)?(?=\s|$)/;

type DisableDirective = { rules: string; reason: string };

const parseDisableDirective = (comment: CommentLike): DisableDirective | null => {
  const match = DISABLE_DIRECTIVE_PATTERN.exec(comment.value);

  if (!match) {
    return null;
  }

  const rest = comment.value.slice(match[0].length);
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
      const directive = parseDisableDirective(comment);

      if (directive) {
        callback(comment, directive);
      }
    }
  },
});

// --- freee 本番データへの書き込み検出 ---

// sdk.gen からの import のうち、書き込み操作の名前
//（create* / update* / destroy* / upsert* / *Cancel / *Uncancel）
const WRITE_SDK_NAME = /create|update|destroy|upsert|cancel/i;

// 生成クライアント（client / invoiceClient / hrClient）への書き込みメソッド
const WRITE_HTTP_METHOD = new Set(["post", "put", "delete", "patch"]);

const isWriteMemberCall = (node: TSESTree.CallExpression): boolean =>
  node.callee.type === "MemberExpression" &&
  !node.callee.computed &&
  node.callee.property.type === "Identifier" &&
  WRITE_HTTP_METHOD.has(node.callee.property.name) &&
  node.callee.object.type === "Identifier" &&
  /client$/i.test(node.callee.object.name);

type NodeWithParent = TSESTree.Node & { parent?: NodeWithParent };

const isDryRunAccess = (node: TSESTree.Expression): boolean =>
  node.type === "MemberExpression" &&
  node.computed &&
  node.property.type === "Literal" &&
  node.property.value === "dry-run" &&
  node.object.type === "MemberExpression" &&
  !node.object.computed &&
  node.object.object.type === "Identifier" &&
  node.object.object.name === "ctx" &&
  node.object.property.type === "Identifier" &&
  node.object.property.name === "values";

const returnsFromDryRun = (statement: TSESTree.Statement): boolean => {
  if (statement.type === "ReturnStatement") return true;
  if (statement.type !== "BlockStatement") return false;
  return statement.body.at(-1)?.type === "ReturnStatement";
};

const hasPrecedingDryRunReturn = (node: TSESTree.CallExpression): boolean => {
  let current = node as NodeWithParent;

  while (current.parent) {
    const parent = current.parent;
    if (
      parent.type === "BlockStatement" &&
      parent.body.some(
        (statement) =>
          statement.range[1] <= node.range[0] &&
          statement.type === "IfStatement" &&
          isDryRunAccess(statement.test) &&
          returnsFromDryRun(statement.consequent),
      )
    ) {
      return true;
    }
    if (
      parent.type === "ArrowFunctionExpression" ||
      parent.type === "FunctionExpression" ||
      parent.type === "FunctionDeclaration"
    ) {
      return false;
    }
    current = parent;
  }

  return false;
};

// --- コマンド間 import の禁止 ---

// 実コードのコマンド root と、fixture 用の root。owner（直下のディレクトリ名、
// フラットなファイルならファイル名そのもの）が異なる import を「コマンド跨ぎ」とみなす
const COMMAND_ROOTS = ["/src/commands/", "/lint-rules/cross-command/"];

const commandOwner = (path: string): string | null => {
  const normalized = path.replaceAll("\\", "/");
  for (const root of COMMAND_ROOTS) {
    const index = normalized.indexOf(root);
    if (index === -1) continue;
    const rest = normalized.slice(index + root.length);
    const slash = rest.indexOf("/");
    return slash === -1 ? rest : rest.slice(0, slash);
  }
  return null;
};

// 相対 import だけをテキストで解決する。パッケージ import は対象外
const resolveRelative = (importerPath: string, specifier: string): string | null => {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
  const segments = importerPath.replaceAll("\\", "/").split("/");
  segments.pop();
  for (const part of specifier.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") segments.pop();
    else segments.push(part);
  }
  return segments.join("/");
};

const requireDryRunMessage =
  'A command that writes to freee must offer --dry-run and gate the write behind ctx.values["dry-run"], so the exact payload can be inspected before touching production books.';

const noCrossCommandImportMessage =
  "Commands must not import from sibling commands. Move shared code to its own module (like invoice-args.ts) so each command stays independently changeable.";

const requireDisableReasonMessage =
  'A disable directive without a reason cannot be re-evaluated or safely removed later. Append " -- <reason>" explaining why the violation is acceptable here.';

const noUnlimitedDisableMessage =
  'A disable directive without rule names silences every current and future rule. Name the rules to disable, e.g. "oxlint-disable-next-line no-console -- <reason>".';

const plugin = {
  meta: {
    name: "eslint-plugin-freee-cli",
    version: "1.0.0",
  },
  rules: {
    "require-disable-reason": createRule(requireDisableReasonMessage, (context) =>
      eachDisableDirective(context, (comment, directive) => {
        if (directive.reason === "") {
          context.report({ loc: comment.loc, messageId: "default" });
        }
      }),
    ),
    "no-unlimited-disable": createRule(noUnlimitedDisableMessage, (context) =>
      eachDisableDirective(context, (comment, directive) => {
        if (directive.rules === "") {
          context.report({ loc: comment.loc, messageId: "default" });
        }
      }),
    ),
    "no-cross-command-import": createRule(noCrossCommandImportMessage, (context) => {
      const importerOwner = commandOwner(context.filename);

      const checkSource = (source: TSESTree.Node | null | undefined) => {
        if (importerOwner === null) return;
        if (source?.type !== "Literal" || typeof source.value !== "string") return;
        const resolved = resolveRelative(context.filename, source.value);
        if (resolved === null) return;
        const resolvedOwner = commandOwner(resolved);
        if (resolvedOwner !== null && resolvedOwner !== importerOwner) {
          context.report({ node: source, messageId: "default" });
        }
      };

      return {
        ImportDeclaration(node: TSESTree.ImportDeclaration) {
          checkSource(node.source);
        },
        ExportNamedDeclaration(node: TSESTree.ExportNamedDeclaration) {
          checkSource(node.source);
        },
        ExportAllDeclaration(node: TSESTree.ExportAllDeclaration) {
          checkSource(node.source);
        },
        ImportExpression(node: TSESTree.ImportExpression) {
          checkSource(node.source);
        },
      };
    }),
    "require-dry-run": createRule(requireDryRunMessage, (context) => {
      const writeSdkImports = new Set<string>();

      return {
        ImportDeclaration(node: TSESTree.ImportDeclaration) {
          if (typeof node.source.value !== "string" || !node.source.value.includes("sdk.gen")) {
            return;
          }
          for (const specifier of node.specifiers) {
            if (
              specifier.type === "ImportSpecifier" &&
              specifier.imported.type === "Identifier" &&
              WRITE_SDK_NAME.test(specifier.imported.name)
            ) {
              writeSdkImports.add(specifier.local.name);
            }
          }
        },
        CallExpression(node: TSESTree.CallExpression) {
          const isSdkWrite =
            node.callee.type === "Identifier" && writeSdkImports.has(node.callee.name);
          if ((isSdkWrite || isWriteMemberCall(node)) && !hasPrecedingDryRunReturn(node)) {
            context.report({ node, messageId: "default" });
          }
        },
      };
    }),
  },
};

export default plugin;
