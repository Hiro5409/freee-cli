import * as clack from "@clack/prompts";
import { define } from "gunshi";

import { openBrowser as openBrowserUrl } from "../browser.ts";
import { configDir, loadConfig, saveConfig } from "../config/config.ts";
import { loadOAuthCredentials, saveOAuthCredentials } from "../config/oauth.ts";
import { CliError, ConfigError } from "../errors.ts";

const DEVELOPER_APP_URL = "https://app.secure.freee.co.jp/developers";

type TextOptions = {
  defaultValue?: string;
  initialValue?: string;
  message: string;
  validate?: (value: string | undefined) => string | Error | undefined;
};

export type SetupPrompts = {
  cancel(message: string): void;
  confirm(options: { initialValue?: boolean; message: string }): Promise<unknown>;
  intro(message: string): void;
  isCancel(value: unknown): boolean;
  note(message: string, title?: string): void;
  outro(message: string): void;
  password(options: {
    message: string;
    validate?: (value: string | undefined) => string | Error | undefined;
  }): Promise<unknown>;
  text(options: TextOptions): Promise<unknown>;
  warn(message: string): void;
};

const clackPrompts: SetupPrompts = {
  cancel: (message) => clack.cancel(message),
  confirm: (options) => clack.confirm(options),
  intro: (message) => clack.intro(message),
  isCancel: (value) => clack.isCancel(value),
  note: (message, title) => clack.note(message, title),
  outro: (message) => clack.outro(message),
  password: (options) => clack.password(options),
  text: (options) => clack.text(options),
  warn: (message) => clack.log.warn(message),
};

type SetupProcess = { exited: Promise<number> };
type SetupSpawn = (
  command: string[],
  options: {
    cwd: string;
    env: Record<string, string | undefined>;
    stderr: "inherit";
    stdin: "inherit";
    stdout: "inherit";
  },
) => SetupProcess;

type SetupWizardOptions = {
  configDirectory?: string;
  cwd?: string;
  entrypoint?: string;
  interactive?: boolean;
  openBrowser?: (url: string) => boolean;
  prompts?: SetupPrompts;
  runtime?: string;
  spawn?: SetupSpawn;
};

class SetupCancelled extends Error {}

function cliEntrypoint(main = Bun.main): string {
  return main.startsWith("/$bunfs/") ? "" : main;
}

function stopSetup(prompts: SetupPrompts): never {
  prompts.cancel("Setup cancelled.");
  throw new SetupCancelled();
}

function stringAnswer(value: unknown, prompts: SetupPrompts): string {
  if (prompts.isCancel(value)) stopSetup(prompts);
  if (typeof value !== "string") {
    throw new CliError("The setup prompt returned an invalid text value.", {
      code: "UNEXPECTED",
    });
  }
  return value;
}

function booleanAnswer(value: unknown, prompts: SetupPrompts): boolean {
  if (prompts.isCancel(value)) stopSetup(prompts);
  if (typeof value !== "boolean") {
    throw new CliError("The setup prompt returned an invalid confirmation value.", {
      code: "UNEXPECTED",
    });
  }
  return value;
}

function required(value: string | undefined): string | undefined {
  return value?.trim() ? undefined : "This value is required.";
}

function positiveInteger(value: string | undefined): string | undefined {
  if (value === undefined) return "Enter a positive integer.";
  return /^[1-9]\d*$/.test(value) ? undefined : "Enter a positive integer.";
}

function authProfileName(value: string | undefined): string | undefined {
  if (value === undefined || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return "Use only letters, numbers, underscores, and hyphens.";
  }
  return undefined;
}

async function runSetupFlow(options: SetupWizardOptions): Promise<void> {
  const interactive =
    options.interactive ?? (process.stdin.isTTY === true && process.stdout.isTTY === true);
  if (!interactive) {
    throw new CliError("Setup requires an interactive terminal.", {
      code: "INVALID_INPUT",
      hint: 'Run "freee setup" directly in a terminal.',
    });
  }

  const prompts = options.prompts ?? clackPrompts;
  const dir = options.configDirectory ?? configDir();
  const runtime = options.runtime ?? process.execPath;
  const entrypoint = options.entrypoint ?? cliEntrypoint();
  const spawn: SetupSpawn =
    options.spawn ?? ((command, spawnOptions) => Bun.spawn(command, spawnOptions));
  const cwd = options.cwd ?? process.cwd();
  const runCli = async (args: string[]): Promise<void> => {
    const command = [runtime, ...(entrypoint ? [entrypoint] : []), ...args];
    const child = spawn(command, {
      cwd,
      env: {
        ...process.env,
        FREEE_CLIENT_ID: undefined,
        FREEE_CLIENT_SECRET: undefined,
        FREEE_CLI_CONFIG_DIR: dir,
      },
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    const exitCode = await child.exited;
    if (exitCode !== 0) {
      throw new CliError(`Setup step "${args[0]}" stopped with exit code ${exitCode}.`, {
        code: "UNEXPECTED",
      });
    }
  };

  prompts.intro("freee CLI setup");
  prompts.note(
    "Create or open the OAuth application used by this CLI.\n" +
      `Set its callback URL to http://localhost:8080/callback\n${DEVELOPER_APP_URL}`,
    "1/4 · Create a freee application",
  );
  const openBrowser = options.openBrowser ?? openBrowserUrl;
  if (!openBrowser(DEVELOPER_APP_URL)) {
    prompts.warn(`Could not open a browser. Visit ${DEVELOPER_APP_URL}`);
  }
  const applicationReady = booleanAnswer(
    await prompts.confirm({ message: "Is the OAuth application ready?", initialValue: true }),
    prompts,
  );
  if (!applicationReady) stopSetup(prompts);

  prompts.note(
    "Credentials are stored only in the local freee CLI configuration directory.",
    "2/4 · Save OAuth credentials",
  );
  const storedOAuth = loadOAuthCredentials(dir);
  const keepStoredOAuth =
    storedOAuth === undefined
      ? false
      : booleanAnswer(
          await prompts.confirm({
            message: "Use the stored OAuth credentials?",
            initialValue: true,
          }),
          prompts,
        );

  if (keepStoredOAuth && storedOAuth) {
    saveOAuthCredentials(dir, storedOAuth);
  } else {
    const clientId = stringAnswer(
      await prompts.text({
        message: "Client ID",
        initialValue: storedOAuth?.clientId,
        validate: required,
      }),
      prompts,
    );
    const clientSecret = stringAnswer(
      await prompts.password({ message: "Client Secret", validate: required }),
      prompts,
    );
    saveOAuthCredentials(dir, { clientId, clientSecret });
  }

  prompts.note(
    "Authentication opens a browser and stores tokens in the local configuration directory.",
    "3/4 · Authenticate and select a company",
  );
  const profile = stringAnswer(
    await prompts.text({
      message: "Profile name",
      defaultValue: "default",
      validate: required,
    }),
    prompts,
  );
  const alreadyAuthenticated = booleanAnswer(
    await prompts.confirm({
      message: `Is profile "${profile}" already authenticated?`,
      initialValue: false,
    }),
    prompts,
  );

  if (alreadyAuthenticated) {
    await runCli(["profile-set-default", "--name", profile]);
  } else {
    await runCli(["login", "--profile", profile, "--set-default"]);
  }
  await runCli(["company-list", "--profile", profile]);

  const companyId = stringAnswer(
    await prompts.text({
      message: "Company ID to use",
      validate: positiveInteger,
    }),
    prompts,
  );
  await runCli(["company-switch", "--profile", profile, "--id", companyId]);

  prompts.note(
    "These commands use freee's unsupported Web interface through an encrypted Agent Browser session and may require maintenance when freee changes.",
    "4/4 · Experimental Web operations",
  );
  const config = loadConfig(dir);
  const configuredProfile = config.profiles[profile];
  const enableWeb = booleanAnswer(
    await prompts.confirm({
      message: `Enable experimental freee Web operations for profile "${profile}"?`,
      initialValue: configuredProfile?.experimental?.web !== undefined,
    }),
    prompts,
  );
  if (enableWeb) {
    if (!configuredProfile) {
      throw new ConfigError(`Profile "${profile}" has no configured freee company.`);
    }
    const authProfile = stringAnswer(
      await prompts.text({
        message: "Agent Browser Auth Profile",
        initialValue: configuredProfile.experimental?.web.authProfile ?? "freee-web",
        validate: authProfileName,
      }),
      prompts,
    );
    configuredProfile.experimental = { web: { authProfile } };
    saveConfig(dir, config);
    prompts.note(
      `Save the freee Web login separately:\nagent-browser auth save ${authProfile} --url https://secure.freee.co.jp/ --username <email> --password-stdin`,
      "Agent Browser authentication",
    );
  } else if (configuredProfile?.experimental) {
    delete configuredProfile.experimental;
    saveConfig(dir, config);
  }

  prompts.outro("Setup complete.");
}

export async function runSetupWizard(options: SetupWizardOptions = {}): Promise<void> {
  try {
    await runSetupFlow(options);
  } catch (error) {
    if (error instanceof SetupCancelled) return;
    throw error;
  }
}

export const setupCommand = define({
  name: "setup",
  description: "Interactive setup; coding agents should ask the user to run it",
  examples: "$ freee setup",
  run: () => runSetupWizard(),
});
