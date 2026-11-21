export const apis = [
  {
    name: "accounting",
    schema: "v2020_06_15/open-api-3/api-schema.json",
    output: "src/types/freee",
  },
  { name: "invoice", schema: "iv/open-api-3/api-schema.yml", output: "src/types/freee-invoice" },
  { name: "hr", schema: "hr/open-api-3/api-schema.json", output: "src/types/freee-hr" },
] as const;
