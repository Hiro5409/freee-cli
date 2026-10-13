import { posix } from "node:path";

import type { TSESTree } from "@typescript-eslint/types";

import { createRule } from "../rule.ts";

const COMMAND_ROOT = "/src/commands/";

const commandOwner = (path: string): string | null => {
  const normalized = path.replaceAll("\\", "/");
  const index = normalized.indexOf(COMMAND_ROOT);
  if (index === -1) return null;

  const rest = normalized.slice(index + COMMAND_ROOT.length);
  const slash = rest.indexOf("/");
  return slash === -1 ? rest.replace(/\.(?:test|spec)(?=\.)/, "") : rest.slice(0, slash);
};

const resolveRelative = (importerPath: string, specifier: string): string | null => {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
  const normalized = importerPath.replaceAll("\\", "/");
  return posix.resolve(posix.dirname(normalized), specifier);
};

const message =
  "Commands must not import from sibling commands. Move shared code to its own module (like invoice-args.ts) so each command stays independently changeable.";

export const noCrossCommandImport = createRule(message, (context) => {
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
});
