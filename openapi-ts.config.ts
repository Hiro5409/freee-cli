import { defineConfig } from "@hey-api/openapi-ts";

import { defineConfig as commands } from "./codegen/commands-plugin.ts";
import { apis } from "./src/api/apis.ts";

const schemaBaseUrl =
  "https://raw.githubusercontent.com/freee/freee-api-schema/1d4167880761a29a2c0373a12ef58d5d92035dbc";

export default defineConfig(
  apis.map(({ schema, output: path }) => ({
    input: `${schemaBaseUrl}/${schema}`,
    output: { path, postProcess: [{ command: "bun", args: ["fmt", "{{path}}"] }] },
    parser: {
      filters: { deprecated: false },
      patch: {
        operations: {
          "GET /api/1/taxes/codes": (operation) => {
            operation.deprecated = true;
          },
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
      { name: "@hey-api/typescript", comments: false },
      { name: "@hey-api/client-fetch", throwOnError: true },
      { name: "@hey-api/sdk", comments: false, validator: { request: "valibot", response: false } },
      { name: "msw", comments: false },
      {
        name: "valibot",
        comments: false,
        requests: { shouldExtract: true },
        $resolvers: {
          validator: { request: () => null },
          string(ctx) {
            if (ctx.schema.format === "binary") {
              ctx.nodes.base = () => ctx.$(ctx.plugin.imports.v).attr("blob").call();
            }
          },
        },
      },
      commands(),
    ],
  })),
);
