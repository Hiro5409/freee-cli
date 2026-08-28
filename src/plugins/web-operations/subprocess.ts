const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const TERMINATION_GRACE_MS = 100;

export type SubprocessOptions = {
  environment?: Record<string, string | undefined>;
  stdin?: string;
  timeoutMs?: number;
};

export type SubprocessResult = {
  exitCode: number;
  timedOut: boolean;
  stdout: string;
  stderr: string;
};

export type RunSubprocess = (
  command: readonly string[],
  options?: SubprocessOptions,
) => Promise<SubprocessResult>;

export const runSubprocess: RunSubprocess = async (command, options = {}) => {
  let timedOut = false;
  let forceKill: ReturnType<typeof setTimeout> | undefined;
  const process = Bun.spawn([...command], {
    env: options.environment,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    killSignal: "SIGTERM",
    maxBuffer: DEFAULT_MAX_OUTPUT_BYTES,
  });
  const timeout = setTimeout(() => {
    timedOut = true;
    process.kill();
    forceKill = setTimeout(() => {
      if (process.exitCode === null) process.kill("SIGKILL");
    }, TERMINATION_GRACE_MS);
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  await process.stdin.write(options.stdin ?? "");
  await process.stdin.end();

  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]).finally(() => {
    clearTimeout(timeout);
    if (forceKill) clearTimeout(forceKill);
  });

  return { exitCode, timedOut, stdout, stderr };
};
