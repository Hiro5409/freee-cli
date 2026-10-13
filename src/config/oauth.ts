import { randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { ConfigError } from "../errors.ts";

export type OAuthCredentials = { clientId: string; clientSecret: string };

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function ensureRegularOAuthPath(path: string): void {
  try {
    if (lstatSync(path).isSymbolicLink()) {
      throw new ConfigError("oauth.env must not be a symbolic link.");
    }
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") return;
    throw error;
  }
}

function validateOAuthCredentials(credentials: OAuthCredentials): void {
  if (!credentials.clientId || !credentials.clientSecret) {
    throw new ConfigError("OAuth credentials must not be empty.");
  }
  if (/\r|\n/.test(credentials.clientId) || /\r|\n/.test(credentials.clientSecret)) {
    throw new ConfigError("OAuth credentials must not contain line breaks.");
  }
}

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

export function saveOAuthCredentials(dir: string, credentials: OAuthCredentials): void {
  validateOAuthCredentials(credentials);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);

  const path = join(dir, "oauth.env");
  ensureRegularOAuthPath(path);
  const tempPath = join(dir, `.oauth.${process.pid}.${randomUUID()}.tmp`);

  try {
    writeFileSync(
      tempPath,
      `FREEE_CLIENT_ID=${credentials.clientId}\nFREEE_CLIENT_SECRET=${credentials.clientSecret}\n`,
      { flag: "wx", flush: true, mode: 0o600 },
    );
    renameSync(tempPath, path);

    const directory = openSync(dir, "r");
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup if the temporary file still exists.
    }
    throw error;
  }
}
