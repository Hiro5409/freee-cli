import { sendThing } from "../../../fixture.sdk.gen.ts";

export async function sendWithoutGate(): Promise<void> {
  await sendThing();
}
