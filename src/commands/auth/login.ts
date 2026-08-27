import { randomBytes } from "node:crypto";

import { define } from "gunshi";
import colors from "yoctocolors";

import {
  buildAuthorizationUrl,
  CALLBACK_HOST,
  CALLBACK_PORT,
  exchangeCodeForToken,
  generateCodeChallenge,
  generateCodeVerifier,
} from "../../api/auth.ts";
import { openBrowser } from "../../browser.ts";
import { configDir, loadConfig, saveConfig } from "../../config/config.ts";
import { loadCredentials, updateCredentials } from "../../config/credentials.ts";
import { loadOAuthCredentials } from "../../config/oauth.ts";
import { ConfigError } from "../../errors.ts";
import { globalArgs } from "../../global-args.ts";
import {
  assertProfileWritable,
  defaultProfileAfterLogin,
  resolveConfiguredLoginProfile,
} from "../../profiles.ts";

export const loginCommand = define({
  name: "login",
  description: "Interactive OAuth login; coding agents should ask the user to run it",
  args: {
    ...globalArgs,
    replace: {
      type: "boolean" as const,
      description: "Replace credentials already stored under this profile name",
      default: false,
    },
    "set-default": {
      type: "boolean" as const,
      description: "Make this profile the persistent default after login",
      default: false,
    },
  },
  examples: `$ freee login --profile work
$ freee login --profile work --replace`,
  run: async (ctx) => {
    const dir = configDir();
    const storedProfiles = Object.keys(loadCredentials(dir));
    const profile = resolveConfiguredLoginProfile(ctx.values.profile, dir);
    assertProfileWritable(profile, storedProfiles, ctx.values.replace);

    const storedOAuth = loadOAuthCredentials(dir);
    const clientId = process.env.FREEE_CLIENT_ID ?? storedOAuth?.clientId;
    const clientSecret = process.env.FREEE_CLIENT_SECRET ?? storedOAuth?.clientSecret;

    if (!clientId || !clientSecret) {
      throw new ConfigError('Run "freee setup" or set FREEE_CLIENT_ID and FREEE_CLIENT_SECRET.');
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = randomBytes(16).toString("hex");

    const authUrl = buildAuthorizationUrl({ clientId, codeChallenge, state });

    console.error(colors.dim("Opening browser for authentication..."));
    console.error(`If the browser doesn't open, visit:\n${authUrl}\n`);

    if (!openBrowser(authUrl)) {
      console.error(colors.yellow("Could not open a browser. Open the URL above manually."));
    }

    const { code } = await waitForCallback(state);

    const tokenSet = await exchangeCodeForToken({
      clientId,
      clientSecret,
      code,
      codeVerifier,
    });

    await updateCredentials(dir, (credentials) => {
      credentials[profile] = tokenSet;
    });

    const config = loadConfig(dir);
    config.activeProfile = defaultProfileAfterLogin(
      config.activeProfile,
      storedProfiles,
      profile,
      ctx.values["set-default"],
    );
    saveConfig(dir, config);

    return colors.green(`Authenticated successfully as profile "${profile}".`);
  },
});

function waitForCallback(expectedState: string): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    const server = Bun.serve({
      port: CALLBACK_PORT,
      hostname: CALLBACK_HOST,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname !== "/callback") {
          return new Response("Not found", { status: 404 });
        }

        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");

        if (returnedState !== expectedState) {
          clearTimeout(timeout);
          void server.stop();
          reject(new Error("State mismatch — possible CSRF attack"));
          return new Response("State mismatch. Authentication failed.", { status: 400 });
        }

        if (!code) {
          const error =
            url.searchParams.get("error_description") ?? "No authorization code received";
          clearTimeout(timeout);
          void server.stop();
          reject(new Error(error));
          return new Response(`Authentication failed: ${error}`, { status: 400 });
        }

        clearTimeout(timeout);
        void server.stop();
        resolve({ code });
        return new Response("Authentication successful! You can close this tab.", {
          headers: { "Content-Type": "text/html" },
        });
      },
    });

    const timeout = setTimeout(() => {
      void server.stop();
      reject(new Error("Authentication timed out after 120 seconds"));
    }, 120_000);
  });
}
