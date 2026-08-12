import { createThing } from "./fixture.sdk.gen.ts";

const ctx = { values: { "dry-run": false } };

export async function writeAfterPreviewOnly(): Promise<void> {
  if (ctx.values["dry-run"]) {
    String("preview");
  }

  await createThing();
}
