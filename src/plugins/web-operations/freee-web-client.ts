import * as v from "valibot";

import { OutcomeUnknownError } from "../../errors.ts";
import { createAgentBrowserSession, type AgentBrowserSession } from "./agent-browser.ts";
import { runSubprocess, type RunSubprocess } from "./subprocess.ts";

const FREEE_ORIGIN = "https://secure.freee.co.jp";
const FREEE_LOGIN_URL = `${FREEE_ORIGIN}/`;

const FreeeSessionStateSchema = v.object({
  origin: v.string(),
  companyId: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
const FreeeWebResponseSchema = v.object({
  origin: v.literal(FREEE_ORIGIN),
  status: v.pipe(v.number(), v.integer()),
  body: v.string(),
});

type FreeeWebRequest = {
  method: "GET" | "PUT";
  path: `/${string}`;
};

export type FreeeWebClient = {
  request<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
    input: FreeeWebRequest,
    schema: TSchema,
  ): Promise<v.InferOutput<TSchema>>;
  close(): Promise<void>;
};

function parseJson(value: string, description: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${description} returned invalid JSON.`, { cause: error });
  }
}

async function sessionState(browser: AgentBrowserSession) {
  const result = await browser.evaluate(`JSON.stringify({
  origin: location.origin,
  companyId: Number(document
    .querySelector('meta[name="current_company_id"],meta[name="company-id"]')
    ?.getAttribute("content") ?? 0)
})`);
  return v.parse(FreeeSessionStateSchema, parseJson(result, "freee session state"));
}

async function ensureFreeeSession(
  browser: AgentBrowserSession,
  companyId: number,
  authProfile: string,
): Promise<void> {
  await browser.run(["open", FREEE_LOGIN_URL]);
  let state = await sessionState(browser);
  if (state.origin !== FREEE_ORIGIN) {
    try {
      await browser.run(["auth", "login", authProfile]);
    } catch (error) {
      throw new Error(
        `freee login is required. Save credentials with "agent-browser auth save ${authProfile} --url ${FREEE_LOGIN_URL} --username <email> --password-stdin" and retry.`,
        { cause: error },
      );
    }
    await browser.run(["open", FREEE_LOGIN_URL]);
    state = await sessionState(browser);
  }
  if (state.origin !== FREEE_ORIGIN) {
    throw new Error(
      `freee login is required. Save credentials with "agent-browser auth save ${authProfile} --url ${FREEE_LOGIN_URL} --username <email> --password-stdin" and retry.`,
    );
  }
  if (state.companyId !== companyId) {
    throw new Error(
      `The Agent Browser auth profile "${authProfile}" selected company ${state.companyId}, expected ${companyId}. Open it with 'agent-browser --namespace freee-web --session ${browser.sessionId} --restore --headed open "${FREEE_LOGIN_URL}"', select company ${companyId}, and retry. If company ${companyId} is not listed, use an Auth Profile whose freee Web login can access it.`,
    );
  }
}

function buildRequestScript(companyId: number, input: FreeeWebRequest): string {
  const method = JSON.stringify(input.method);
  const path = JSON.stringify(input.path);
  const mutationHeaders =
    input.method === "GET"
      ? ""
      : `
  const csrfToken = document
    .querySelector('meta[name="csrf-token"]')
    ?.getAttribute("content");
  if (!csrfToken) throw new Error("freee CSRF token is unavailable");
  headers.set("X-CSRF-Token", csrfToken);
  headers.set("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");`;

  return `(async () => {
  if (location.origin !== ${JSON.stringify(FREEE_ORIGIN)}) {
    throw new Error("Unexpected freee origin");
  }
  const currentCompanyId = Number(document
    .querySelector('meta[name="current_company_id"],meta[name="company-id"]')
    ?.getAttribute("content") ?? 0);
  if (currentCompanyId !== ${companyId}) {
    throw new Error("FREEE_COMPANY_MISMATCH");
  }
  const headers = new Headers({ Accept: "application/json" });${mutationHeaders}
  const response = await fetch(${path}, {
    method: ${method},
    headers,
    credentials: "same-origin",
  });
  return JSON.stringify({
    origin: location.origin,
    status: response.status,
    body: await response.text(),
  });
})()`;
}

function parseWebResponse<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  result: string,
  schema: TSchema,
  mutation: boolean,
): v.InferOutput<TSchema> {
  let envelope: unknown;
  try {
    envelope = parseJson(result, "freee Web request");
  } catch (error) {
    if (mutation) {
      throw new OutcomeUnknownError("freee Web write confirmation was lost.", { cause: error });
    }
    throw error;
  }
  const response = v.safeParse(FreeeWebResponseSchema, envelope);
  if (!response.success) {
    const error = new Error("freee Web returned an unexpected response envelope.", {
      cause: response.issues,
    });
    if (mutation) {
      throw new OutcomeUnknownError("freee Web write confirmation was lost.", { cause: error });
    }
    throw error;
  }
  if (response.output.status === 401 || response.output.status === 403) {
    throw new Error("The freee Web session is not authenticated.");
  }
  if (mutation && response.output.status >= 500) {
    throw new OutcomeUnknownError(
      `freee Web write returned HTTP ${response.output.status}; its outcome is unknown.`,
    );
  }
  if (response.output.status < 200 || response.output.status >= 300) {
    throw new Error(`freee Web returned HTTP ${response.output.status}.`);
  }

  let body: unknown;
  try {
    body = parseJson(response.output.body, "freee Web");
  } catch (error) {
    if (mutation) {
      throw new OutcomeUnknownError("freee Web accepted the write but returned unreadable data.", {
        cause: error,
      });
    }
    throw error;
  }
  const parsed = v.safeParse(schema, body);
  if (!parsed.success) {
    const error = new Error("freee Web returned an unexpected response format.", {
      cause: parsed.issues,
    });
    if (mutation) {
      throw new OutcomeUnknownError("freee Web accepted the write but its result was unreadable.", {
        cause: error,
      });
    }
    throw error;
  }
  return parsed.output;
}

function isPreDispatchFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return [
    "Unexpected freee origin",
    "FREEE_COMPANY_MISMATCH",
    "freee CSRF token is unavailable",
  ].some((message) => error.message.includes(message));
}

export function createFreeeWebClient(input: {
  companyId: number;
  authProfile: string;
  environment?: Record<string, string | undefined>;
  run?: RunSubprocess;
}): FreeeWebClient {
  const environment = input.environment ?? process.env;
  const { authProfile } = input;
  if (!/^[A-Za-z0-9_-]+$/.test(authProfile)) {
    throw new Error("The Agent Browser Auth Profile name is invalid.");
  }
  const run = input.run ?? runSubprocess;
  let browser: Promise<AgentBrowserSession> | undefined;
  let ready: Promise<void> | undefined;

  function browserInstance(): Promise<AgentBrowserSession> {
    browser ??= createAgentBrowserSession({
      namespace: "freee-web",
      sessionPrefix: "fw",
      companyId: input.companyId,
      authProfile,
      environment,
      run,
    });
    return browser;
  }

  async function ensureReady(): Promise<AgentBrowserSession> {
    const instance = await browserInstance();
    ready ??= ensureFreeeSession(instance, input.companyId, authProfile);
    await ready;
    return instance;
  }

  return {
    async request(request, schema) {
      const instance = await ensureReady();
      const mutation = request.method === "PUT";
      let data: string;
      try {
        data = await instance.evaluate(buildRequestScript(input.companyId, request));
      } catch (error) {
        if (mutation && !isPreDispatchFailure(error)) {
          throw new OutcomeUnknownError("freee Web write confirmation was lost.", { cause: error });
        }
        throw error;
      }
      return parseWebResponse(data, schema, mutation);
    },
    async close() {
      const instance = await browser?.catch(() => undefined);
      if (instance) await instance.dispose();
    },
  };
}
