// These should all PASS — no diagnostics expected

import { createThing, getThing } from "./fixture.sdk.gen.ts";

const client = { put: async (url: string) => url, get: async (url: string) => url };
const ctx = { values: { "dry-run": false } };

export async function writeWithGate(): Promise<string | undefined> {
  if (ctx.values["dry-run"]) return undefined;
  await createThing();
  return client.put("/api/1/deals/1");
}

export async function writeWithGateInsideTry(): Promise<void> {
  try {
    if (ctx.values["dry-run"]) return;
    await createThing();
  } catch {
    return;
  }
}

// 読み取りしかしないコマンドは dry-run を要求されない
export async function readOnly(): Promise<string> {
  await getThing();
  return client.get("/api/1/deals");
}
