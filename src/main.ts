try {
  const { main } = await import("./cli.ts");
  await main();
} catch (e) {
  const { errorExitCode, printError, wasErrorPrinted } = await import("./error-output.ts");

  if (wasErrorPrinted(e)) {
    process.exitCode = errorExitCode(e);
  } else {
    process.exitCode = printError(e);
  }
}
