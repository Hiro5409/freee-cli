type BrowserSpawn = (command: string[]) => unknown;
type FindExecutable = (command: string) => string | null;

type OpenBrowserOptions = {
  platform?: NodeJS.Platform;
  spawn?: BrowserSpawn;
  which?: FindExecutable;
};

function browserCommand(
  url: string,
  platform: NodeJS.Platform,
  which: FindExecutable,
): string[] | undefined {
  if (platform === "darwin") return ["open", url];
  if (platform === "win32") return undefined;

  for (const executable of ["wslview", "explorer.exe", "xdg-open"]) {
    if (which(executable)) return [executable, url];
  }
  return undefined;
}

export function openBrowser(url: string, options: OpenBrowserOptions = {}): boolean {
  const command = browserCommand(
    url,
    options.platform ?? process.platform,
    options.which ?? Bun.which,
  );
  if (!command) return false;

  try {
    const spawn =
      options.spawn ??
      ((commandToRun: string[]) => Bun.spawn(commandToRun, { stdout: "ignore", stderr: "ignore" }));
    spawn(command);
    return true;
  } catch {
    return false;
  }
}
