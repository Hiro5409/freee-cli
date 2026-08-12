import { configDir, loadConfig, saveConfig } from "./config/config.ts";
import { loadCredentials } from "./config/credentials.ts";
import { AuthError, ConfigError } from "./errors.ts";

type ProfileSelection = {
  requested?: unknown;
  environment?: string;
  defaultProfile?: string;
  storedProfiles: string[];
};

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function selectedProfile(selection: ProfileSelection): string | undefined {
  return nonEmptyString(selection.requested) ?? nonEmptyString(selection.environment);
}

function defaultOrOnlyProfile(
  defaultProfile: string | undefined,
  storedProfiles: string[],
): string | undefined {
  const configured = nonEmptyString(defaultProfile);
  if (configured && storedProfiles.includes(configured)) return configured;
  if (storedProfiles.length === 1) return storedProfiles[0];
  return undefined;
}

function requireStoredProfile(profile: string, storedProfiles: string[]): string {
  if (storedProfiles.includes(profile)) return profile;
  throw new AuthError(
    `No credentials found for profile "${profile}". Run "freee login --profile ${profile}" first.`,
  );
}

export function resolveProfile(selection: ProfileSelection): string {
  const selected = selectedProfile(selection);
  if (selected) return requireStoredProfile(selected, selection.storedProfiles);

  const defaultProfile = defaultOrOnlyProfile(selection.defaultProfile, selection.storedProfiles);
  if (defaultProfile) return defaultProfile;

  if (selection.storedProfiles.length === 0) {
    throw new AuthError('No credentials found. Run "freee login --profile <name>" first.');
  }

  throw new ConfigError(
    'Multiple profiles are authenticated. Use --profile, set FREEE_PROFILE, or run "freee profile-set-default".',
  );
}

export function resolveProfileName(selection: ProfileSelection): string {
  const selected = selectedProfile(selection);
  if (selected) return selected;

  const defaultProfile = nonEmptyString(selection.defaultProfile);
  if (defaultProfile) return defaultProfile;

  if (selection.storedProfiles.length === 1) {
    const onlyProfile = selection.storedProfiles[0];
    if (onlyProfile) return onlyProfile;
  }

  if (selection.storedProfiles.length === 0) return "default";

  throw new ConfigError(
    'Multiple profiles are authenticated. Use --profile, set FREEE_PROFILE, or run "freee profile-set-default".',
  );
}

export function resolveLoginProfile(selection: ProfileSelection): string {
  const selected = selectedProfile(selection);
  if (selected) return selected;

  if (selection.storedProfiles.length === 0) return "default";

  const defaultProfile = defaultOrOnlyProfile(selection.defaultProfile, selection.storedProfiles);
  if (defaultProfile) return defaultProfile;

  throw new ConfigError(
    'Multiple profiles are authenticated. Choose the login target with "--profile <name>".',
  );
}

function configuredSelection(
  requested: unknown,
  dir: string,
  environment: string | undefined,
): ProfileSelection {
  const config = loadConfig(dir);
  return {
    requested,
    environment,
    defaultProfile: config.activeProfile,
    storedProfiles: Object.keys(loadCredentials(dir)),
  };
}

export function resolveConfiguredProfile(
  requested: unknown,
  dir = configDir(),
  environment = process.env.FREEE_PROFILE,
): string {
  return resolveProfile(configuredSelection(requested, dir, environment));
}

export function resolveConfiguredLoginProfile(
  requested: unknown,
  dir = configDir(),
  environment = process.env.FREEE_PROFILE,
): string {
  return resolveLoginProfile(configuredSelection(requested, dir, environment));
}

export function resolveConfiguredProfileName(
  requested: unknown,
  dir = configDir(),
  environment = process.env.FREEE_PROFILE,
): string {
  return resolveProfileName(configuredSelection(requested, dir, environment));
}

export function assertProfileWritable(
  profile: string,
  storedProfiles: string[],
  replace: boolean,
): void {
  if (!replace && storedProfiles.includes(profile)) {
    throw new AuthError(
      `Profile "${profile}" is already authenticated. Use another profile name or pass --replace to re-authenticate it.`,
    );
  }
}

export function defaultProfileAfterLogin(
  currentDefault: string,
  storedProfilesBeforeLogin: string[],
  loggedInProfile: string,
  setDefault: boolean,
): string {
  if (setDefault || storedProfilesBeforeLogin.length === 0) return loggedInProfile;
  return defaultOrOnlyProfile(currentDefault, storedProfilesBeforeLogin) ?? currentDefault;
}

export function setDefaultProfile(profile: string, dir = configDir()): void {
  const storedProfiles = Object.keys(loadCredentials(dir));
  requireStoredProfile(profile, storedProfiles);

  const config = loadConfig(dir);
  config.activeProfile = profile;
  saveConfig(dir, config);
}

export type ProfileSummary = {
  profile: string;
  default: boolean;
  company_id: number | null;
  company_name: string | null;
};

export function listProfiles(dir = configDir()): ProfileSummary[] {
  const config = loadConfig(dir);
  const storedProfiles = Object.keys(loadCredentials(dir)).sort();
  const effectiveDefault = defaultOrOnlyProfile(config.activeProfile, storedProfiles);

  return storedProfiles.map((profile) => {
    const company = config.profiles[profile];
    return {
      profile,
      default: profile === effectiveDefault,
      company_id: company?.companyId ?? null,
      company_name: company?.name ?? null,
    };
  });
}
