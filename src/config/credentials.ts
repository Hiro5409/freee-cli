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
import type { FileHandle } from "node:fs/promises";
import { open, unlink } from "node:fs/promises";
import { join } from "node:path";

import * as v from "valibot";

import { ConfigError } from "../errors.ts";

function isErrnoException(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && "code" in e;
}

const TokenSetSchema = v.strictObject({
  clientId: v.string(),
  clientSecret: v.string(),
  accessToken: v.string(),
  refreshToken: v.string(),
  expiresAt: v.number(),
});

const CredentialsSchema = v.record(v.string(), TokenSetSchema);

export type TokenSet = v.InferOutput<typeof TokenSetSchema>;
type Credentials = v.InferOutput<typeof CredentialsSchema>;
const CREDENTIALS_LOCK_TIMEOUT_MS = 10_000;

function prepareCredentialsDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
}

function ensureCredentialsPathIsRegular(filePath: string): void {
  try {
    if (lstatSync(filePath).isSymbolicLink()) {
      throw new ConfigError("credentials.json must not be a symbolic link.");
    }
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") return;
    throw error;
  }
}

function syncDirectory(dir: string): void {
  const fileDescriptor = openSync(dir, "r");
  try {
    fsyncSync(fileDescriptor);
  } finally {
    closeSync(fileDescriptor);
  }
}

function isLockContention(error: unknown): boolean {
  return isErrnoException(error) && (error.code === "EEXIST" || error.code === "EPERM");
}

function lockOwner(lockPath: string): string | undefined {
  try {
    const owner = readFileSync(lockPath, "utf-8").trim();
    return /^\d+$/.test(owner) ? owner : undefined;
  } catch {
    return undefined;
  }
}

async function acquireCredentialsLock(lockPath: string): Promise<FileHandle> {
  const startedAt = Date.now();

  while (true) {
    try {
      const lockFile = await open(lockPath, "wx+", 0o600);
      try {
        await lockFile.writeFile(`${process.pid}\n`);
        return lockFile;
      } catch (error) {
        await lockFile.close().catch(() => undefined);
        await unlink(lockPath).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      if (!isLockContention(error)) throw error;
      if (Date.now() - startedAt >= CREDENTIALS_LOCK_TIMEOUT_MS) {
        const owner = lockOwner(lockPath);
        const ownerMessage = owner ? ` (owner PID: ${owner})` : "";
        throw new ConfigError(
          `Timed out waiting for credentials lock at ${lockPath}${ownerMessage}. ` +
            "If no freee process is running, delete the lock file and retry.",
        );
      }
      await Bun.sleep(50);
    }
  }
}

export function loadCredentials(dir: string): Credentials {
  const filePath = join(dir, "credentials.json");
  try {
    const raw = readFileSync(filePath, "utf-8");
    const json: unknown = JSON.parse(raw);
    return v.parse(CredentialsSchema, json);
  } catch (e) {
    if (isErrnoException(e) && e.code === "ENOENT") {
      return {};
    }
    throw new ConfigError(
      `Failed to parse credentials.json: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

export function saveCredentials(dir: string, credentials: Credentials): void {
  prepareCredentialsDir(dir);
  const filePath = join(dir, "credentials.json");
  ensureCredentialsPathIsRegular(filePath);
  const tempPath = join(dir, `.credentials.${process.pid}.${randomUUID()}.tmp`);

  try {
    writeFileSync(tempPath, `${JSON.stringify(credentials, null, 2)}\n`, {
      flag: "wx",
      flush: true,
      mode: 0o600,
    });
    renameSync(tempPath, filePath);
    syncDirectory(dir);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup if the temporary file still exists.
    }
    throw error;
  }
}

async function withCredentialsLock<T>(dir: string, operation: () => Promise<T>): Promise<T> {
  prepareCredentialsDir(dir);
  const lockPath = join(dir, "credentials.lockfile");
  const lockFile = await acquireCredentialsLock(lockPath);
  let outcome: { ok: true; value: T } | { ok: false; error: unknown };

  try {
    outcome = { ok: true, value: await operation() };
  } catch (error) {
    outcome = { ok: false, error };
  }

  let cleanupError: unknown;
  try {
    await lockFile.close();
  } catch (error) {
    cleanupError = error;
  }
  try {
    await unlink(lockPath);
  } catch (error) {
    cleanupError ??= error;
  }

  if (!outcome.ok) throw outcome.error;
  if (cleanupError) throw cleanupError;
  return outcome.value;
}

export async function updateCredentials<T>(
  dir: string,
  operation: (credentials: Credentials) => T | Promise<T>,
): Promise<T> {
  return withCredentialsLock(dir, async () => {
    const credentials = loadCredentials(dir);
    const result = await operation(credentials);
    saveCredentials(dir, credentials);
    return result;
  });
}
