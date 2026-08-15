import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ConfigError } from "../errors.ts";

type OAuthCredentials = { clientId: string; clientSecret: string };

export function loadOAuthCredentials(dir: string): OAuthCredentials | undefined {
  const path = join(dir, "oauth.env");
  try {
    if (lstatSync(path).isSymbolicLink()) {
      throw new ConfigError("oauth.env must not be a symbolic link.");
    }
    const values = Object.fromEntries(
      readFileSync(path, "utf-8")
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const separator = line.indexOf("=");
          return separator === -1
            ? [line, ""]
            : [line.slice(0, separator), line.slice(separator + 1)];
        }),
    );
    if (!values.FREEE_CLIENT_ID || !values.FREEE_CLIENT_SECRET) {
      throw new ConfigError("oauth.env must contain FREEE_CLIENT_ID and FREEE_CLIENT_SECRET.");
    }
    return { clientId: values.FREEE_CLIENT_ID, clientSecret: values.FREEE_CLIENT_SECRET };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}
