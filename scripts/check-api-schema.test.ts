import { describe, expect, test } from "bun:test";

import { extractPinnedRevision, parseOasChanges } from "./check-api-schema.ts";

describe("extractPinnedRevision", () => {
  test("extracts the freee schema commit from the raw GitHub URL", () => {
    expect(
      extractPinnedRevision(`
        const freeeApiSchemaBaseUrl =
          "https://raw.githubusercontent.com/freee/freee-api-schema/0123456789abcdef0123456789abcdef01234567";
      `),
    ).toBe("0123456789abcdef0123456789abcdef01234567");
  });

  test("rejects a config without a pinned commit", () => {
    expect(() =>
      extractPinnedRevision(
        'const url = "https://raw.githubusercontent.com/freee/freee-api-schema/master";',
      ),
    ).toThrow("Cannot find the pinned freee API schema commit");
  });
});

describe("parseOasChanges", () => {
  test("rejects JSON that does not match the oasdiff changelog contract", () => {
    expect(() => parseOasChanges('{"id":"endpoint-added"}')).toThrow(
      "Cannot parse the oasdiff changelog JSON",
    );
  });
});
