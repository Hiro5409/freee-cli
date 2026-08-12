import { defineConfig } from "@hey-api/openapi-ts";

const plugins = [
  "@hey-api/typescript",
  { name: "@hey-api/client-fetch", throwOnError: true },
  "@hey-api/sdk",
  "msw",
] as const;

// freee は製品ごとに別スキーマ・別ベースURLで API を公開している。
// ベースURLが違う以上 1 クライアントには畳めないので、生成物も分ける。
export default defineConfig([
  {
    input:
      "https://raw.githubusercontent.com/freee/freee-api-schema/master/v2020_06_15/open-api-3/api-schema.json",
    output: {
      path: "src/types/freee",
      postProcess: ["oxfmt"],
    },
    plugins: [...plugins],
  },
  {
    input:
      "https://raw.githubusercontent.com/freee/freee-api-schema/master/iv/open-api-3/api-schema.yml",
    output: {
      path: "src/types/freee-invoice",
      postProcess: ["oxfmt"],
    },
    plugins: [...plugins],
  },
  {
    input:
      "https://raw.githubusercontent.com/freee/freee-api-schema/master/hr/open-api-3/api-schema.json",
    output: {
      path: "src/types/freee-hr",
      postProcess: ["oxfmt"],
    },
    plugins: [...plugins],
  },
]);
