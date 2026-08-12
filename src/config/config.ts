import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as z from "zod/mini";

import { ConfigError } from "../errors.ts";

function isErrnoException(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && "code" in e;
}

const ProfileSchema = z.object({
  companyId: z.number().check(z.int(), z.positive()),
  name: z.string(),
});

const ConfigSchema = z.object({
  activeProfile: z._default(z.string(), "default"),
  defaults: z._default(z.object({ format: z._default(z.string(), "table") }), { format: "table" }),
  profiles: z._default(z.record(z.string(), ProfileSchema), {}),
});

type Config = z.infer<typeof ConfigSchema>;

export function configDir(): string {
  if (process.env.FREEE_CLI_CONFIG_DIR) return process.env.FREEE_CLI_CONFIG_DIR;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  return join(home, ".config", "freee-cli");
}

export function loadConfig(dir = configDir()): Config {
  const filePath = join(dir, "config.json");
  try {
    const raw = readFileSync(filePath, "utf-8");
    const json: unknown = JSON.parse(raw);
    return ConfigSchema.parse(json);
  } catch (e) {
    if (isErrnoException(e) && e.code === "ENOENT") {
      return ConfigSchema.parse({});
    }
    throw new ConfigError(
      `Failed to parse config.json: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

export function saveConfig(dir = configDir(), config: Config): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.json"), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}
