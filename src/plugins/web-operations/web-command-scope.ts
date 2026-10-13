import { configDir, loadConfig } from "../../config/config.ts";
import { ConfigError } from "../../errors.ts";
import { resolveConfiguredProfile } from "../../profiles.ts";
import type { FreeeWebScope } from "./freee-web.ts";

export type WebCommandScope = FreeeWebScope & {
  profile: string;
};

export function resolveWebCommandScope(requestedProfile: unknown): WebCommandScope {
  const directory = configDir();
  const profile = resolveConfiguredProfile(requestedProfile, directory);
  const configuredProfile = loadConfig(directory).profiles[profile];
  if (!configuredProfile) {
    throw new ConfigError(`Profile "${profile}" has no configured freee company.`);
  }
  const web = configuredProfile.experimental?.web;
  if (!web) {
    throw new ConfigError(
      `Experimental freee Web operations are not enabled for profile "${profile}".`,
      {
        hint: `Run "freee setup" in an interactive terminal and enable Web operations for profile "${profile}".`,
      },
    );
  }
  return {
    profile,
    companyId: configuredProfile.companyId,
    authProfile: web.authProfile,
  };
}
