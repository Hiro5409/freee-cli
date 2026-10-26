import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as v from "valibot";

import { ConfigError } from "../errors.ts";

function isErrnoException(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && "code" in e;
}

const ProfileSchema = v.strictObject({
  companyId: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
  name: v.string(),
});

const ConfigSchema = v.strictObject({
  activeProfile: v.optional(v.string(), "default"),
  defaults: v.optional(v.strictObject({ format: v.optional(v.string(), "table") }), {
    format: "table",
  }),
  profiles: v.optional(v.record(v.string(), ProfileSchema), {}),
});

type Config = v.InferOutput<typeof ConfigSchema>;

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.FREEE_CLI_CONFIG_DIR) return env.FREEE_CLI_CONFIG_DIR;
  const home = env.HOME ?? env.USERPROFILE;
  if (!home) throw new ConfigError("HOME or USERPROFILE is required to locate freee CLI config.");
  return join(home, ".config", "freee-cli");
}

export function loadConfig(dir = configDir()): Config {
  const filePath = join(dir, "config.json");
  try {
    const raw = readFileSync(filePath, "utf-8");
    const json: unknown = JSON.parse(raw);
    return v.parse(ConfigSchema, json);
  } catch (e) {
    if (isErrnoException(e) && e.code === "ENOENT") {
      return v.parse(ConfigSchema, {});
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
