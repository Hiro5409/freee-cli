import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";

import { releaseState } from "./release-state.ts";

const input = {
  name: "freee-cli",
  version: "1.2.3",
  repository: "Hiro5409/freee-cli",
  filename: "freee-cli-1.2.3.tgz",
  bytes: Buffer.from("tested artifact"),
  token: "test-token",
};
const published = {
  dist: { integrity: `sha512-${createHash("sha512").update(input.bytes).digest("base64")}` },
};
const asset = {
  name: input.filename,
  digest: `sha256:${createHash("sha256").update(input.bytes).digest("hex")}`,
};

const npmUrl = "https://registry.npmjs.org/freee-cli/1.2.3";
const releaseUrl = "https://api.github.com/repos/Hiro5409/freee-cli/releases/tags/v1.2.3";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test.each([
  { npm: false, release: false },
  { npm: true, release: false },
  { npm: true, release: true },
])("resumes npm=$npm release=$release", async (state) => {
  server.use(
    http.get(npmUrl, ({ request }) => {
      expect(request.headers.has("authorization")).toBe(false);
      return state.npm ? HttpResponse.json(published) : new HttpResponse(null, { status: 404 });
    }),
    http.get(releaseUrl, ({ request }) => {
      expect(request.headers.get("authorization")).toBe("Bearer test-token");
      return state.release
        ? HttpResponse.json({ assets: [asset] })
        : new HttpResponse(null, { status: 404 });
    }),
  );
  await expect(releaseState(input)).resolves.toEqual({
    npmPublished: state.npm,
    releaseExists: state.release,
  });
});

test("waits for npm to serve a published version before reading GitHub", async () => {
  let npmLookups = 0;
  let releaseLookups = 0;
  server.use(
    http.get(npmUrl, () => {
      npmLookups += 1;
      return npmLookups < 3
        ? new HttpResponse(null, { status: 404 })
        : HttpResponse.json(published);
    }),
    http.get(releaseUrl, () => {
      releaseLookups += 1;
      return new HttpResponse(null, { status: 404 });
    }),
  );
  await expect(
    releaseState({ ...input, npmWait: { timeoutMs: 60_000, intervalMs: 1 } }),
  ).resolves.toEqual({ npmPublished: true, releaseExists: false });
  expect(releaseLookups).toBe(1);
});

test("stops waiting when npm does not serve the version in time", async () => {
  server.use(http.get(npmUrl, () => new HttpResponse(null, { status: 404 })));
  await expect(
    releaseState({ ...input, npmWait: { timeoutMs: 20, intervalMs: 5 } }),
  ).rejects.toThrow("npm is not serving freee-cli@1.2.3");
});

test("stops waiting when the npm lookup fails", async () => {
  let npmLookups = 0;
  server.use(
    http.get(npmUrl, () => {
      npmLookups += 1;
      return new HttpResponse(null, { status: npmLookups < 2 ? 404 : 503 });
    }),
  );
  await expect(
    releaseState({ ...input, npmWait: { timeoutMs: 60_000, intervalMs: 1 } }),
  ).rejects.toThrow("HTTP 503");
  expect(npmLookups).toBe(2);
});

test("stops waiting when npm serves different contents", async () => {
  let npmLookups = 0;
  server.use(
    http.get(npmUrl, () => {
      npmLookups += 1;
      return npmLookups < 2
        ? new HttpResponse(null, { status: 404 })
        : HttpResponse.json({ dist: { integrity: "different" } });
    }),
  );
  await expect(
    releaseState({ ...input, npmWait: { timeoutMs: 60_000, intervalMs: 1 } }),
  ).rejects.toThrow("Published npm artifact differs");
});

test.each([403, 429, 500])("does not interpret HTTP %i as unpublished", async (status) => {
  server.use(http.get(npmUrl, () => new HttpResponse(null, { status })));
  await expect(releaseState(input)).rejects.toThrow(`HTTP ${status}`);
});

test("stops when an existing npm version has different contents", async () => {
  server.use(http.get(npmUrl, () => HttpResponse.json({ dist: { integrity: "different" } })));
  await expect(releaseState(input)).rejects.toThrow("Published npm artifact differs");
});

test("stops when the GitHub lookup fails after npm publication", async () => {
  server.use(
    http.get(npmUrl, () => HttpResponse.json(published)),
    http.get(releaseUrl, () => new HttpResponse(null, { status: 503 })),
  );
  await expect(releaseState(input)).rejects.toThrow("HTTP 503");
});

test("does not overwrite a different existing release asset", async () => {
  server.use(
    http.get(npmUrl, () => HttpResponse.json(published)),
    http.get(releaseUrl, () => HttpResponse.json({ assets: [{ ...asset, digest: "different" }] })),
  );
  await expect(releaseState(input)).rejects.toThrow("Existing release asset differs");
});

test("stops when an existing release is missing the tested artifact", async () => {
  server.use(
    http.get(npmUrl, () => HttpResponse.json(published)),
    http.get(releaseUrl, () =>
      HttpResponse.json({ assets: [{ ...asset, name: "freee-cli-1.2.2.tgz" }] }),
    ),
  );
  await expect(releaseState(input)).rejects.toThrow(
    "Existing release is missing freee-cli-1.2.3.tgz",
  );
});
