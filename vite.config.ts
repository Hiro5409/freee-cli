import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    // TypeScript + 日本語文字列で 80 だと折り返しが頻発するため拡張
    printWidth: 100,
    sortImports: true,
  },
  lint: {
    plugins: ["typescript", "unicorn", "oxc", "import"],
    jsPlugins: [
      {
        name: "freee-cli",
        specifier: "./lint-rules/plugin.ts",
      },
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
    categories: {
      correctness: "error",
    },
    options: {
      typeAware: true,
      reportUnusedDisableDirectives: "error",
      typeCheck: true,
    },
    ignorePatterns: ["src/types/**", "lint-rules/**/fixtures/**"],
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      eqeqeq: "error",
      "no-control-regex": "error",
      "no-promise-executor-return": "error",
      "preserve-caught-error": "error",
      "typescript/consistent-type-imports": "error",
      "typescript/ban-ts-comment": "error",
      "typescript/no-explicit-any": "error",
      "typescript/no-non-null-assertion": "error",
      "typescript/no-inferrable-types": "error",
      "typescript/no-floating-promises": "error",
      "typescript/no-misused-promises": "error",
      "typescript/prefer-promise-reject-errors": "error",
      "typescript/no-deprecated": "error",
      "typescript/no-unsafe-assignment": "error",
      "typescript/no-unsafe-argument": "error",
      "typescript/no-unsafe-call": "error",
      "typescript/no-unsafe-member-access": "error",
      "typescript/no-unsafe-return": "error",
      "typescript/no-unsafe-type-assertion": "error",
      "typescript/switch-exhaustiveness-check": "error",
      "typescript/no-unnecessary-type-parameters": "error",
      "typescript/no-unnecessary-condition": [
        "error",
        {
          allowConstantLoopConditions: true,
        },
      ],
      "typescript/no-unnecessary-type-assertion": "error",
      "typescript/no-unnecessary-type-conversion": "error",
      "typescript/await-thenable": "off",
      "typescript/no-base-to-string": "off",
      "typescript/restrict-template-expressions": "off",
      "import/no-cycle": "error",
      "import/extensions": [
        "error",
        "always",
        {
          ignorePackages: true,
          checkTypeImports: true,
        },
      ],
      "no-shadow": "error",
      "import/no-self-import": "error",
      "oxc/misrefactored-assign-op": "error",
      "oxc/no-barrel-file": [
        "error",
        {
          threshold: 0,
        },
      ],
      "unicorn/prefer-node-protocol": "error",
      "freee-cli/require-disable-reason": "error",
      "freee-cli/no-unlimited-disable": "error",
      "freee-cli/no-cross-command-import": "error",
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    overrides: [
      {
        files: ["**/*.test.ts"],
        rules: {
          "typescript/no-unsafe-assignment": "off",
          "typescript/no-unsafe-argument": "off",
          "typescript/no-unsafe-call": "off",
          "typescript/no-unsafe-member-access": "off",
          "typescript/no-unsafe-return": "off",
          "typescript/no-unsafe-type-assertion": "off",
        },
      },
      {
        files: ["src/commands/**"],
        rules: {
          "no-console": [
            "error",
            {
              allow: ["error"],
            },
          ],
        },
      },
    ],
  },
});
