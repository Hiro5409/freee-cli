import type { TSESTree } from "@typescript-eslint/types";

import { createRule } from "../rule.ts";

const READ_OPERATION_NAME = /^(?:download|get|list|search)|(?:Index|Show)$/;
const WRITE_HTTP_METHOD = new Set(["post", "put", "delete", "patch"]);

const isWriteMemberCall = (node: TSESTree.CallExpression): boolean =>
  node.callee.type === "MemberExpression" &&
  !node.callee.computed &&
  node.callee.property.type === "Identifier" &&
  WRITE_HTTP_METHOD.has(node.callee.property.name) &&
  node.callee.object.type === "Identifier" &&
  /client$/i.test(node.callee.object.name);

const parentOf = (node: TSESTree.Node): TSESTree.Node | undefined =>
  "parent" in node ? node.parent : undefined;

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
  let current: TSESTree.Node = node;

  while (true) {
    const parent = parentOf(current);
    if (!parent) return false;

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
};

const message =
  'A command that writes to freee must offer --dry-run and gate the write behind ctx.values["dry-run"], so the exact payload can be inspected before touching production books.';

export const requireDryRun = createRule(message, (context) => {
  const writeImports = new Set<string>();

  return {
    ImportDeclaration(node: TSESTree.ImportDeclaration) {
      if (typeof node.source.value !== "string" || !node.source.value.includes("sdk.gen")) return;

      for (const specifier of node.specifiers) {
        if (
          specifier.type === "ImportSpecifier" &&
          specifier.importKind !== "type" &&
          specifier.imported.type === "Identifier" &&
          !READ_OPERATION_NAME.test(specifier.imported.name)
        ) {
          writeImports.add(specifier.local.name);
        }
      }
    },
    CallExpression(node: TSESTree.CallExpression) {
      const isImportedWrite =
        node.callee.type === "Identifier" && writeImports.has(node.callee.name);
      if ((isImportedWrite || isWriteMemberCall(node)) && !hasPrecedingDryRunReturn(node)) {
        context.report({ node, messageId: "default" });
      }
    },
  };
});
