import { createThing, getThing } from "../../../fixture.sdk.gen.ts";

const client = { get: async (url: string) => url, put: async (url: string) => url };
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

export async function readOnly(): Promise<string> {
  await getThing();
  return client.get("/api/1/deals");
}
