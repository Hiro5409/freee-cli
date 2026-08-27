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

const freeeApiSchemaBaseUrl =
  "https://raw.githubusercontent.com/freee/freee-api-schema/d193f57c86fd3f8f976b1e71cd7908005235bf92";

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

function includeNullInRequestEnum(name: string) {
  return (operation: OperationObject) => {
    if (!("requestBody" in operation)) throw new Error(`Operation has no request body: ${name}`);
    const requestBody = operation.requestBody;
    if (!requestBody || "$ref" in requestBody) {
      throw new Error(`Operation has no inline request body: ${name}`);
    }
    const schema = requestBody.content["application/json"]?.schema;
    if (!schema || typeof schema !== "object" || "$ref" in schema) {
      throw new Error(`Operation has no inline JSON schema: ${name}`);
    }
    const property = schema.properties?.[name];
    if (
      !property ||
      typeof property !== "object" ||
      "$ref" in property ||
      !property.enum ||
      !("nullable" in property) ||
      property.nullable !== true
    ) {
      throw new Error(`Operation has no nullable inline enum property: ${name}`);
    }
    if (!property.enum.includes(null)) property.enum = [...property.enum, null];
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
      "GET /api/1/fixed_assets": (operation: OperationObject) => {
        // 公式のプラン制限が変わったらCLIの対応範囲を見直す: https://github.com/freee/freee-api-schema/blob/d193f57c86fd3f8f976b1e71cd7908005235bf92/v2020_06_15/open-api-3/api-schema.json#L19321
        const restriction = "このAPIは法人エンタープライズに加入している事業所のみが利用できます。";
        if (!operation.description?.includes(restriction)) {
          throw new Error("Review the plan restriction for GET /api/1/fixed_assets");
        }
      },
      // freee OASがdescriptionでのみ廃止予定を示すため、deprecatedフラグへ補正する: https://github.com/freee/freee-api-schema/blob/d193f57c86fd3f8f976b1e71cd7908005235bf92/v2020_06_15/open-api-3/api-schema.json#L7123
      "GET /api/1/taxes/codes": (operation: OperationObject) => {
        operation.deprecated = true;
      },
      // Hey API requires nullable enum members to be explicit in the enum to preserve null in the generated union.
      "PUT /api/1/user_matchers/{id}": includeNullInRequestEnum("qualified_invoice_setting"),
    },
    // freee OASがdescriptionでのみ非推奨を示すため、deprecatedフラグへ補正する: https://github.com/freee/freee-api-schema/blob/d193f57c86fd3f8f976b1e71cd7908005235bf92/hr/open-api-3/api-schema.json#L13876
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
    input: `${freeeApiSchemaBaseUrl}/v2020_06_15/open-api-3/api-schema.json`,
    output: {
      path: "src/types/freee",
      postProcess: ["oxfmt"],
    },
    parser,
    plugins: [...plugins],
  },
  {
    input: `${freeeApiSchemaBaseUrl}/iv/open-api-3/api-schema.yml`,
    output: {
      path: "src/types/freee-invoice",
      postProcess: ["oxfmt"],
    },
    parser,
    plugins: [...plugins],
  },
  {
    input: `${freeeApiSchemaBaseUrl}/hr/open-api-3/api-schema.json`,
    output: {
      path: "src/types/freee-hr",
      postProcess: ["oxfmt"],
    },
    parser,
    plugins: [...plugins],
  },
]);
