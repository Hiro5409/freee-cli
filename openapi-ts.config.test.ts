import { expect, test } from "bun:test";

import configPromise from "./openapi-ts.config.ts";

test("fixed asset plan assumption fails closed when its upstream restriction changes", async () => {
  const [accountingConfig] = await configPromise;
  const patch = accountingConfig?.parser?.patch;
  if (!patch || typeof patch === "function") throw new Error("Missing operation patches");
  const operations = patch.operations;
  if (!operations || typeof operations === "function") throw new Error("Missing operation patches");
  const validate = operations["GET /api/1/fixed_assets"];
  if (typeof validate !== "function") throw new Error("Missing fixed asset plan validator");

  expect(() => validate({ description: "No plan restriction", responses: {} })).toThrow(
    "Review the plan restriction for GET /api/1/fixed_assets",
  );
});
