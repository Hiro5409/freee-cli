import { defineConfig } from "@hey-api/openapi-ts";

const schemaBaseUrl =
  "https://raw.githubusercontent.com/freee/freee-api-schema/1d4167880761a29a2c0373a12ef58d5d92035dbc";

const apis = [
  { schema: "v2020_06_15/open-api-3/api-schema.json", path: "src/types/freee" },
  { schema: "iv/open-api-3/api-schema.yml", path: "src/types/freee-invoice" },
  { schema: "hr/open-api-3/api-schema.json", path: "src/types/freee-hr" },
];

export default defineConfig(
  apis.map(({ schema, path }) => ({
    input: `${schemaBaseUrl}/${schema}`,
    output: { path, postProcess: [{ command: "bun", args: ["fmt", "{{path}}"] }] },
    parser: {
      filters: { deprecated: false },
      patch: {
        operations: {
          "PUT /api/1/user_matchers/{id}": (operation) => {
            const body = "requestBody" in operation ? operation.requestBody : undefined;
            const bodySchema =
              body && !("$ref" in body) ? body.content["application/json"]?.schema : undefined;
            const property =
              bodySchema && typeof bodySchema === "object" && !("$ref" in bodySchema)
                ? bodySchema.properties?.qualified_invoice_setting
                : undefined;
            if (
              !property ||
              typeof property !== "object" ||
              "$ref" in property ||
              !property.enum ||
              !("nullable" in property && property.nullable)
            ) {
              throw new Error("Review qualified_invoice_setting in PUT /api/1/user_matchers/{id}");
            }
            if (!property.enum.includes(null)) property.enum.push(null);
          },
        },
      },
    },
    plugins: [
      "@hey-api/typescript",
      { name: "@hey-api/client-fetch", throwOnError: true },
      "@hey-api/sdk",
      "msw",
    ],
  })),
);
