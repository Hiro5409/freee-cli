import { randomBytes } from "node:crypto";

import { define } from "gunshi";
import { args, boolean, merge, withDefault } from "gunshi/combinators";
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
import { formatValue } from "../../output/formatter.ts";
import { loginFreeeWeb } from "../../plugins/web-operations/freee-web.ts";
import {
  assertProfileWritable,
  resolveFreeeScope,
  defaultProfileAfterLogin,
  resolveConfiguredLoginProfile,
} from "../../profiles.ts";

export const loginCommand = define({
  name: "login",
  description: "Log in through OAuth, or use --web to renew the browser login",
  args: merge(
    globalArgs,
    args({
      web: withDefault(
        boolean({ description: "Log in to the configured company's browser session" }),
        false,
      ),
      replace: withDefault(
        boolean({ description: "Replace credentials already stored under this profile name" }),
        false,
      ),
      "set-default": withDefault(
        boolean({ description: "Make this profile the persistent default after login" }),
        false,
      ),
    }),
  ),
  examples: `$ freee auth login --profile work
$ freee auth login --profile work --replace`,
  run: async (ctx) => {
    if (ctx.values.web) {
      if (ctx.values.replace || ctx.values["set-default"]) {
        throw new ConfigError("--web cannot be combined with --replace or --set-default.");
      }
      const scope = resolveFreeeScope(ctx.values.profile);
      console.error(
        `Log in and select freee company ${scope.companyId} in the browser. Waiting up to 5 minutes.`,
      );
      const result = await loginFreeeWeb(scope);
      return formatValue(
        { ...result, method: "web" },
        ctx.values.format,
        `Browser login ready: profile=${scope.profile} company=${scope.companyId}`,
      );
    }
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

    return formatValue(
      { profile, method: "api", status: "ready" },
      ctx.values.format,
      colors.green(`Authenticated successfully as profile "${profile}".`),
    );
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
