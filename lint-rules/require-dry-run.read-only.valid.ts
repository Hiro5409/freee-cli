// These should all PASS — 読み取りしかしないファイルは dry-run ゲートなしで通る

import { getThing } from "./fixture.sdk.gen.ts";

const client = { get: async (url: string) => url };

export async function list(): Promise<string> {
  await getThing();
  return client.get("/api/1/deals");
}
