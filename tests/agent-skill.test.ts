import { describe, expect, test } from "bun:test";
import { readlinkSync } from "node:fs";

import pkg from "../package.json" with { type: "json" };

describe("bundled freee-cli Agent Skill", () => {
  test("ships a thin model-invoked workflow that delegates knowledge to the CLI", async () => {
    const skill = await Bun.file(".agents/skills/freee-cli/SKILL.md").text();

    expect(pkg.files).toContain("docs");
    expect(pkg.files).toContain("skills");
    expect(readlinkSync(".agents/skills/freee-cli")).toBe("../../skills/freee-cli");
    expect(skill).toContain("name: freee-cli");
    expect(skill).toContain("description:");
    expect(skill).toContain("freee docs list --format json");
    expect(skill).toContain("--dry-run");
    expect(skill).toContain("interactive terminal");
    expect(skill).toContain("explicit user approval");
    expect(skill).toContain("same `--profile` and `--company-id`");
    expect(skill).toContain("does not verify credentials");
    expect(skill).not.toContain("/api/");
  });
});
