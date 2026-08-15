import {
  defineConfig,
  type OpenApiOperationObject,
  type OpenApiSchemaObject,
} from "@hey-api/openapi-ts";

type OperationObject =
  | OpenApiOperationObject.V2_0_X
  | OpenApiOperationObject.V3_0_X
  | OpenApiOperationObject.V3_1_X;

type SchemaObject =
  | OpenApiSchemaObject.V2_0_X
  | OpenApiSchemaObject.V3_0_X
  | OpenApiSchemaObject.V3_1_X;

function markDeprecatedProperties(...names: ReadonlyArray<string>) {
  return (schema: SchemaObject) => {
    for (const name of names) {
      const property = schema.properties?.[name];
      if (!property || typeof property !== "object" || "$ref" in property) {
        throw new Error(`Cannot mark missing or referenced property as deprecated: ${name}`);
      }
      Object.assign(property, { deprecated: true });
    }
  };
}

const plugins = [
  "@hey-api/typescript",
  { name: "@hey-api/client-fetch", throwOnError: true },
  "@hey-api/sdk",
  "msw",
] as const;

const parser = {
  filters: {
    deprecated: false,
  },
  patch: {
    operations: {
      // freee OASが説明文でのみ廃止予定を示すため、deprecatedフラグへ補正する: https://github.com/freee/freee-api-schema/blob/80e02be85f27bc6fc82fc651790987095f8c79cd/v2020_06_15/open-api-3/api-schema.json#L7017
      "GET /api/1/taxes/codes": (operation: OperationObject) => {
        operation.deprecated = true;
      },
    },
    // freee OASがdescriptionでのみ非推奨を示すため、deprecatedフラグへ補正する: https://github.com/freee/freee-api-schema/blob/80e02be85f27bc6fc82fc651790987095f8c79cd/hr/open-api-3/api-schema.json#L13944
    schemas: {
      LegacyApiV1PaidHolidayIndexResponseParams: markDeprecatedProperties(
        "holiday_type",
        "start_at",
        "end_at",
      ),
      LegacyApiV1PaidHolidayResponseParams: markDeprecatedProperties(
        "holiday_type",
        "start_at",
        "end_at",
      ),
      LegacyApiV1EmployeesWorkRecordSerializer: markDeprecatedProperties(
        "half_paid_holiday_mins",
        "hourly_paid_holiday_mins",
        "paid_holiday",
      ),
      "ApiV1EmployeesWorkRecordsController.update_body": markDeprecatedProperties(
        "clock_in_at",
        "clock_out_at",
      ),
      "LegacyApiV1EmployeesWorkRecordsController.update_body": markDeprecatedProperties(
        "clock_in_at",
        "clock_out_at",
        "paid_holiday",
        "half_paid_holiday_mins",
        "hourly_paid_holiday_mins",
      ),
      LegacyApiV1PaidHolidayRequest: markDeprecatedProperties("holiday_type", "start_at", "end_at"),
    },
  },
} as const;

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
    parser,
    plugins: [...plugins],
  },
  {
    input:
      "https://raw.githubusercontent.com/freee/freee-api-schema/master/iv/open-api-3/api-schema.yml",
    output: {
      path: "src/types/freee-invoice",
      postProcess: ["oxfmt"],
    },
    parser,
    plugins: [...plugins],
  },
  {
    input:
      "https://raw.githubusercontent.com/freee/freee-api-schema/master/hr/open-api-3/api-schema.json",
    output: {
      path: "src/types/freee-hr",
      postProcess: ["oxfmt"],
    },
    parser,
    plugins: [...plugins],
  },
]);
