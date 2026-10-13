// Bridge --no-color flag to NO_COLOR env var before yoctocolors evaluates color support at import time
if (process.argv.includes("--no-color") || !process.stdout.isTTY || !process.stderr.isTTY) {
  process.env.NO_COLOR = "1";
}

try {
  const { main } = await import("./cli.ts");
  await main();
} catch (e) {
  const { errorExitCode, formatFromArgv, printError, wasErrorPrinted } =
    await import("./error-output.ts");

  if (wasErrorPrinted(e)) {
    process.exitCode = errorExitCode(e);
  } else {
    process.exitCode = printError(e, formatFromArgv(process.argv.slice(2)));
  }
}
