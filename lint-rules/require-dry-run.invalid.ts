// These should all be caught by the require-dry-run Oxlint rule

import { createThing } from "./fixture.sdk.gen.ts";

const client = { put: async (url: string) => url };

export async function sdkWriteWithoutGate(): Promise<void> {
  await createThing();
}

export async function rawWriteWithoutGate(): Promise<string> {
  return client.put("/api/1/deals/1");
}
