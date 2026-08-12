import { describe, expect, test } from "bun:test";

const WRITE_COMMANDS = new Set([
  "auto-rule-apply",
  "auto-rule-create",
  "auto-rule-delete",
  "auto-rule-disable",
  "auto-rule-enable",
  "deal-create",
  "deal-update",
  "invoice-create",
  "invoice-update",
  "receipt-attach",
  "receipt-upload",
]);

function shellCommands(markdown: string): string[] {
  const blocks = [...markdown.matchAll(/```bash\n([\s\S]*?)```/g)].map((match) => match[1] ?? "");
  return blocks
    .flatMap((block) => block.replaceAll(/\\\n\s*/g, " ").split("\n"))
    .map((line) => line.trim())
    .filter((line) => line.startsWith("freee "));
}

describe.each(["README.md", "README.ja.md"])("%s", (path) => {
  test("points agents to bundled documentation", async () => {
    const markdown = await Bun.file(path).text();

    expect(markdown).toContain("npx skills add Hiro5409/freee-cli --skill freee-cli");
    expect(markdown).toContain("freee docs list --format json");
  });

  test("previews every freee API mutation", async () => {
    const markdown = await Bun.file(path).text();
    const writes = shellCommands(markdown).filter((command) => {
      const name = command.split(/\s+/)[1];
      return name !== undefined && WRITE_COMMANDS.has(name);
    });

    expect(writes.length).toBeGreaterThan(0);
    for (const command of writes) expect(command).toContain("--dry-run");
  });
});
