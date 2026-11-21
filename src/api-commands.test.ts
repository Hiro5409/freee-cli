import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli, define } from "gunshi";
import { HttpResponse } from "msw/http";

import { MOCK_TOKEN } from "../test/credentials.ts";
import { createNetwork } from "../test/network.ts";
import { apiCommands } from "./api-commands.ts";
import { saveCredentials } from "./config/credentials.ts";
import { commands as hr } from "./types/freee-hr/commands.gen.ts";
import { handleGetCompanyEmployees } from "./types/freee-hr/msw.gen.ts";
import { commands as invoice } from "./types/freee-invoice/commands.gen.ts";
import { commands as accounting } from "./types/freee/commands.gen.ts";
import { handleDownloadReceipt, handleGetPartners } from "./types/freee/msw.gen.ts";

const testDir = join(tmpdir(), `freee-cli-api-commands-test-${Date.now()}`);
const requests: Array<URL> = [];
const network = createNetwork();

const subCommands = apiCommands([
  {
    name: "accounting",
    description: "Accounting",
    baseUrl: "https://a.test",
    commands: accounting,
  },
  { name: "invoice", description: "Invoice", baseUrl: "https://a.test/iv", commands: invoice },
  { name: "hr", description: "HR", baseUrl: "https://a.test/hr", commands: hr },
]);

const preview = async (args: Array<string>) =>
  ((await run([...args, "--dry-run"])) as { request: Record<string, unknown> }).request;

async function run(args: Array<string>): Promise<unknown> {
  const output = await cli(args, define({ name: "freee", run: () => "" }), {
    name: "freee",
    subCommands,
  });
  return JSON.parse(String(output));
}

beforeAll(() => network.enable());
afterAll(() => network.disable());

beforeEach(() => {
  requests.length = 0;
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});

afterEach(() => {
  network.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("generated API commands", () => {
  test("every generated SDK operation has one command", () => {
    for (const [commands, sdk] of [
      [accounting, "src/types/freee/sdk.gen.ts"],
      [invoice, "src/types/freee-invoice/sdk.gen.ts"],
      [hr, "src/types/freee-hr/sdk.gen.ts"],
    ] as const) {
      const operations = readFileSync(sdk, "utf8").match(/^export const \w+ =/gm) ?? [];
      expect(commands).toHaveLength(operations.length);
    }
  });

  test("a dry run puts the company ID in every place the operation declares", async () => {
    expect(
      await preview(["accounting", "deal", "delete", "--company-id", "3", "--id", "9"]),
    ).toEqual({ method: "DELETE", url: "https://a.test/api/1/deals/9", query: { company_id: 3 } });
    expect(
      await preview([
        "accounting",
        "manual-journal",
        "create",
        "--company-id",
        "3",
        "--body",
        '{"issue_date":"2026-08-01","details":[],"company_id":1}',
      ]),
    ).toMatchObject({ body: { issue_date: "2026-08-01", company_id: 3 } });
    expect(
      await preview([
        "hr",
        "allowance",
        "create",
        "--company-id",
        "3",
        "--body",
        '{"company_id":1,"allowance":{"name":"a","frequency":"salary_monthly","calc_type":"fixed","amount_source":"direct","amount":1}}',
      ]),
    ).toMatchObject({ query: { company_id: 3 }, body: { company_id: 3 } });
    expect(await preview(["hr", "company", "employee", "list", "--company-id", "3"])).toMatchObject(
      { url: "https://a.test/hr/api/v1/companies/3/employees" },
    );
    expect(await preview(["accounting", "user", "me", "show"])).toMatchObject({ query: {} });
  });

  test("a dry run shows the encoded URL with the API base", async () => {
    expect(
      await preview([
        "accounting",
        "partner",
        "code",
        "update",
        "--company-id",
        "3",
        "--code",
        "A/B C",
        "--body",
        '{"name":"n"}',
      ]),
    ).toMatchObject({ url: "https://a.test/api/1/partners/code/A%2FB%20C" });
    expect(
      await preview(["invoice", "invoice", "show", "--company-id", "3", "--id", "2"]),
    ).toMatchObject({ url: "https://a.test/iv/invoices/2" });
  });

  test("a body integer beyond 2^53 - 1 is rejected instead of rounded", async () => {
    await expect(
      preview([
        "accounting",
        "manual-journal",
        "create",
        "--company-id",
        "3",
        "--body",
        '{"issue_date":"2026-08-01","details":[{"account_item_id":9007199254740993}]}',
      ]),
    ).rejects.toThrow("beyond 2^53 - 1");
  });

  test("numeric choices stay numbers", async () => {
    expect(
      await preview(["accounting", "user-matcher", "list", "--company-id", "3", "--act", "1"]),
    ).toMatchObject({ query: { act: 1 } });
  });

  test("a dot segment cannot change the request path", async () => {
    await expect(
      preview([
        "accounting",
        "partner",
        "code",
        "update",
        "--company-id",
        "3",
        "--code",
        "..",
        "--body",
        '{"name":"n"}',
      ]),
    ).rejects.toThrow('--code cannot be ".."');
  });

  test("a validation error names the field without echoing its value", async () => {
    const error = await preview([
      "accounting",
      "manual-journal",
      "create",
      "--company-id",
      "3",
      "--body",
      '{"issue_date":"2026-08-01","details":[{"entry_side":"secret-value","tax_code":0,"amount":1}]}',
    ]).catch((caught: unknown) => caught);

    expect(String(error)).toContain("body.details.0.entry_side");
    expect(String(error)).not.toContain("secret-value");
  });

  test("an operation whose body is one of several shapes takes --body", async () => {
    expect(
      await preview([
        "hr",
        "employee",
        "work-record",
        "update",
        "--company-id",
        "3",
        "--employee-id",
        "4",
        "--date",
        "2026-08-01",
        "--body",
        '{"use_default_work_pattern":true}',
      ]),
    ).toMatchObject({ body: { use_default_work_pattern: true, company_id: 3 } });
  });

  test("a missing upload file is rejected before any request", async () => {
    await expect(
      run(["accounting", "receipt", "create", "--company-id", "3", "--receipt", "/missing.pdf"]),
    ).rejects.toThrow("File not found");
  });

  test("--all reads every page of a list", async () => {
    network.use(
      handleGetPartners(({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        const offset = Number(url.searchParams.get("offset"));
        const count = offset === 0 ? 3000 : 2;
        return HttpResponse.json({
          partners: Array.from({ length: count }, (_, index) => ({ id: offset + index })),
        } as never);
      }),
    );

    const result = await run(["accounting", "partner", "list", "--company-id", "3", "--all"]);

    expect(result).toMatchObject({ partners: { length: 3002 } });
    await expect(
      run(["accounting", "partner", "list", "--company-id", "3", "--all", "--limit", "5"]),
    ).rejects.toThrow("--all reads every page");
    expect(requests.map((url) => url.searchParams.get("offset"))).toEqual(["0", "3000"]);
    expect(requests[0]?.searchParams.get("company_id")).toBe("3");
  });

  test("--all reads a list that freee returns as a bare array", async () => {
    network.use(
      handleGetCompanyEmployees(({ request: incoming }) => {
        const offset = Number(new URL(incoming.url).searchParams.get("offset"));
        return HttpResponse.json(
          Array.from({ length: offset === 0 ? 100 : 1 }, (_, index) => ({
            id: offset + index,
          })) as never,
        );
      }),
    );

    expect(
      await run(["hr", "company", "employee", "list", "--company-id", "3", "--all"]),
    ).toHaveLength(101);
  });

  test("a download is written to a new file only", async () => {
    network.use(
      handleDownloadReceipt(
        () =>
          new HttpResponse(new Uint8Array([1, 2, 3]), {
            headers: { "Content-Type": "application/pdf" },
          }),
      ),
    );
    const target = join(testDir, "receipt.pdf");
    const args = ["accounting", "receipt", "download", "--company-id", "3", "--id", "5"];

    expect(await run([...args, "--output", target])).toEqual({
      path: target,
      mimeType: "application/pdf",
      bytes: 3,
    });
    expect([...readFileSync(target)]).toEqual([1, 2, 3]);
    writeFileSync(target, "kept");
    await expect(run([...args, "--output", target])).rejects.toThrow("Output path already exists");
    await expect(run([...args, "--output", target, "--dry-run"])).rejects.toThrow(
      "Output path already exists",
    );
    expect(readFileSync(target, "utf8")).toBe("kept");
  });

  test("a body can come from a JSON file", async () => {
    const bodyFile = join(testDir, "body.json");
    writeFileSync(bodyFile, '{"issue_date":"2026-08-01","details":[]}');
    const args = ["accounting", "manual-journal", "create", "--company-id", "3", "--body"];

    expect(await preview([...args, `@${bodyFile}`])).toMatchObject({
      body: { issue_date: "2026-08-01", company_id: 3 },
    });
    await expect(run([...args, "@/missing.json", "--dry-run"])).rejects.toThrow("File not found");
  });

  test("a body that is not a JSON object is rejected before any request", async () => {
    await expect(
      run(["accounting", "partner", "create", "--company-id", "3", "--body", "[1]"]),
    ).rejects.toThrow("--body must be a JSON object.");
  });

  test("schema describes the request of a generated command", async () => {
    const schema = await run(["schema", "accounting", "deal", "show"]);
    expect(schema).toMatchObject({ method: "GET", path: "/api/1/deals/{id}" });
    expect(schema).toMatchObject({
      request: {
        properties: {
          path: {
            properties: {
              id: { anyOf: [{ type: "number" }, { type: "string" }, { type: "integer" }] },
            },
          },
        },
      },
    });
    await expect(run(["schema", "accounting", "deal"])).rejects.toThrow("Unknown API command");
  });
});
