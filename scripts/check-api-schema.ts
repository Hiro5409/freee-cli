import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as v from "valibot";

const SCHEMA_REPOSITORY = "https://github.com/freee/freee-api-schema.git";
const SCHEMA_RAW_BASE_URL = "https://raw.githubusercontent.com/freee/freee-api-schema";
const SCHEMA_REF = "refs/heads/master";
const PINNED_SCHEMA_PATTERN =
  /https:\/\/raw\.githubusercontent\.com\/freee\/freee-api-schema\/([0-9a-f]{40})/;

const API_SPECS = [
  {
    api: "accounting",
    schemaPath: "v2020_06_15/open-api-3/api-schema.json",
    sdkPath: "src/types/freee/sdk.gen.ts",
  },
  {
    api: "invoice",
    schemaPath: "iv/open-api-3/api-schema.yml",
    sdkPath: "src/types/freee-invoice/sdk.gen.ts",
  },
  {
    api: "hr",
    schemaPath: "hr/open-api-3/api-schema.json",
    sdkPath: "src/types/freee-hr/sdk.gen.ts",
  },
] as const;

type ApiName = (typeof API_SPECS)[number]["api"];

type Endpoint = {
  method: string;
  path: string;
};

type ImportedSdkOperation = {
  api: ApiName;
  operation: string;
};

const OasChangeSchema = v.object({
  id: v.string(),
  level: v.number(),
  operation: v.optional(v.string()),
  operationId: v.optional(v.string()),
  path: v.optional(v.string()),
  text: v.string(),
});

type OasChange = v.InferOutput<typeof OasChangeSchema>;

type CommandResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

type ValidationResult = CommandResult & {
  name: string;
};

const SDK_DIRECTORY_TO_API: Record<string, ApiName> = {
  freee: "accounting",
  "freee-invoice": "invoice",
  "freee-hr": "hr",
};

function formatCommandOutput(result: CommandResult): string {
  return [result.stdout, result.stderr]
    .map((output) => output.trim())
    .filter(Boolean)
    .join("\n");
}

function endpointKey(endpoint: Endpoint): string {
  return `${endpoint.method.toUpperCase()} ${endpoint.path}`;
}

export function extractPinnedRevision(configSource: string): string {
  const revision = configSource.match(PINNED_SCHEMA_PATTERN)?.[1];
  if (!revision) throw new Error("Cannot find the pinned freee API schema commit");
  return revision;
}

export function extractSdkEndpoints(source: string): Map<string, Endpoint> {
  const endpoints = new Map<string, Endpoint>();
  const declarations = [...source.matchAll(/^[ \t]*export const ([A-Za-z_$][\w$]*)\s*=/gm)];

  for (const [index, declaration] of declarations.entries()) {
    const name = declaration[1];
    if (name === undefined) continue;

    const nextDeclaration = declarations[index + 1];
    const block = source.slice(declaration.index, nextDeclaration?.index ?? source.length);
    const method = block.match(
      /\(options\??\.client \?\? client\)\.(get|post|put|patch|delete)\s*(?:<|\()/,
    )?.[1];
    const path = block.match(/\burl:\s*"([^"]+)"/)?.[1];
    if (method && path) endpoints.set(name, { method: method.toUpperCase(), path });
  }

  return endpoints;
}

export function extractImportedSdkOperations(source: string): Array<ImportedSdkOperation> {
  const operations: Array<ImportedSdkOperation> = [];
  const imports =
    /import\s*\{([^}]*)\}\s*from\s*["'][^"']*types\/(freee|freee-invoice|freee-hr)\/sdk\.gen\.ts["']/g;
  const sdkReferences = /["'][^"']*types\/(freee|freee-invoice|freee-hr)\/sdk\.gen\.ts["']/g;
  const matchedImports = [...source.matchAll(imports)];

  if (matchedImports.length !== [...source.matchAll(sdkReferences)].length) {
    throw new Error("Unsupported generated SDK import or export");
  }

  for (const match of matchedImports) {
    const names = match[1];
    const api = match[2] ? SDK_DIRECTORY_TO_API[match[2]] : undefined;
    if (!names || !api) continue;

    for (const importedName of names.split(",")) {
      const operation = importedName
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0];
      if (operation) operations.push({ api, operation });
    }
  }

  return operations;
}

export function classifyChanges(
  changes: ReadonlyArray<OasChange>,
  usedEndpoints: ReadonlySet<string>,
): {
  apiWideChanges: Array<OasChange>;
  opportunities: Array<OasChange>;
  usedOperationChanges: Array<OasChange>;
} {
  return {
    apiWideChanges:
      usedEndpoints.size === 0
        ? []
        : changes.filter(
            ({ id, operation, path }) =>
              id !== "endpoint-added" && operation === undefined && path === undefined,
          ),
    opportunities: changes.filter(({ id }) => id === "endpoint-added"),
    usedOperationChanges: changes.filter(
      ({ id, level, operation, path }) =>
        id !== "endpoint-added" &&
        level >= 2 &&
        operation !== undefined &&
        path !== undefined &&
        usedEndpoints.has(endpointKey({ method: operation, path })),
    ),
  };
}

export function parseOasChanges(source: string): Array<OasChange> {
  try {
    const parsed: unknown = JSON.parse(source);
    return v.parse(v.array(OasChangeSchema), parsed);
  } catch {
    throw new Error("Cannot parse the oasdiff changelog JSON");
  }
}

async function run(command: Array<string>, cwd: string): Promise<CommandResult> {
  const subprocess = Bun.spawn(command, {
    cwd,
    env: process.env,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stderr).text(),
    new Response(subprocess.stdout).text(),
  ]);
  return { exitCode, stderr, stdout };
}

async function getLatestRevision(repoRoot: string): Promise<string> {
  const result = await run(["git", "ls-remote", SCHEMA_REPOSITORY, SCHEMA_REF], repoRoot);
  if (result.exitCode !== 0) {
    throw new Error(`Cannot read the latest freee API schema commit:\n${result.stderr.trim()}`);
  }

  const revision = result.stdout.match(/^([0-9a-f]{40})\s/)?.[1];
  if (!revision) throw new Error("Cannot parse the latest freee API schema commit");
  return revision;
}

async function createWorkingCopy(repoRoot: string): Promise<string> {
  const workingCopy = await mkdtemp(join(tmpdir(), "freee-cli-api-schema-"));
  try {
    const listedFiles = await run(
      ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      repoRoot,
    );
    if (listedFiles.exitCode !== 0) {
      throw new Error(`Cannot list repository files:\n${formatCommandOutput(listedFiles)}`);
    }

    for (const path of listedFiles.stdout.split("\0").filter(Boolean)) {
      const target = join(workingCopy, path);
      await mkdir(dirname(target), { recursive: true });
      await cp(join(repoRoot, path), target);
    }
    await symlink(join(repoRoot, "node_modules"), join(workingCopy, "node_modules"), "dir");
    return workingCopy;
  } catch (error) {
    await moveToTrash(workingCopy);
    throw error;
  }
}

async function moveToTrash(path: string): Promise<void> {
  const result = await run(["/usr/bin/trash", path], dirname(path));
  if (result.exitCode !== 0) {
    throw new Error(`Cannot move the temporary working copy to Trash:\n${result.stderr.trim()}`);
  }
}

async function replacePinnedRevision(
  workingCopy: string,
  pinnedRevision: string,
  latestRevision: string,
): Promise<void> {
  const configPath = join(workingCopy, "openapi-ts.config.ts");
  const source = await readFile(configPath, "utf8");
  const updated = source.replaceAll(pinnedRevision, latestRevision);
  if (source === updated) {
    throw new Error("Cannot update the schema commit in the working copy");
  }
  await writeFile(configPath, updated);
}

export async function collectUsedEndpoints(repoRoot: string): Promise<Map<ApiName, Set<string>>> {
  const endpointMaps = new Map<ApiName, Map<string, Endpoint>>();
  for (const { api, sdkPath } of API_SPECS) {
    endpointMaps.set(api, extractSdkEndpoints(await readFile(join(repoRoot, sdkPath), "utf8")));
  }

  const usedEndpoints = new Map<ApiName, Set<string>>(
    API_SPECS.map(({ api }) => [api, new Set<string>()]),
  );
  const sourceFiles = new Bun.Glob("src/**/*.ts");

  for await (const path of sourceFiles.scan({ cwd: repoRoot, onlyFiles: true })) {
    if (path.includes("/types/") || path.endsWith(".test.ts")) continue;

    const source = await readFile(join(repoRoot, path), "utf8");
    for (const { api, operation } of extractImportedSdkOperations(source)) {
      const endpoint = endpointMaps.get(api)?.get(operation);
      if (!endpoint) {
        throw new Error(`Cannot map imported ${api} SDK function ${operation} to an endpoint`);
      }
      usedEndpoints.get(api)?.add(endpointKey(endpoint));
    }
  }

  return usedEndpoints;
}

async function readChangelog(
  repoRoot: string,
  schemaPath: string,
  pinnedRevision: string,
  latestRevision: string,
): Promise<Array<OasChange>> {
  const base = `${SCHEMA_RAW_BASE_URL}/${pinnedRevision}/${schemaPath}`;
  const revision = `${SCHEMA_RAW_BASE_URL}/${latestRevision}/${schemaPath}`;
  const result = await run(
    [
      "mise",
      "exec",
      "github:oasdiff/oasdiff@1.29.1",
      "--",
      "oasdiff",
      "changelog",
      "--format",
      "json",
      base,
      revision,
    ],
    repoRoot,
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `Cannot compare freee API schemas with oasdiff:\n${formatCommandOutput(result)}`,
    );
  }

  return parseOasChanges(result.stdout);
}

function formatChanges(api: ApiName, changes: ReadonlyArray<OasChange>): Array<string> {
  return changes.map(({ id, operation, path, text }) => {
    const endpoint = operation && path ? `${operation} ${path}` : "API";
    return `- [${api}] ${endpoint}: ${text} (${id})`;
  });
}

async function validateGeneratedClient(workingCopy: string): Promise<Array<ValidationResult>> {
  const validations: ReadonlyArray<{ command: Array<string>; name: string }> = [
    { command: ["bun", "run", "typecheck"], name: "typecheck" },
    { command: ["bun", "run", "lint"], name: "lint" },
    { command: ["bun", "run", "test"], name: "test" },
  ];

  return Promise.all(
    validations.map(async ({ command, name }) => ({
      name,
      ...(await run(command, workingCopy)),
    })),
  );
}

async function checkApiSchema(repoRoot: string): Promise<number> {
  const configSource = await readFile(join(repoRoot, "openapi-ts.config.ts"), "utf8");
  const pinnedRevision = extractPinnedRevision(configSource);
  const latestRevision = await getLatestRevision(repoRoot);

  if (pinnedRevision === latestRevision) {
    console.log(`freee API schema is current (${pinnedRevision.slice(0, 12)}).`);
    return 0;
  }

  console.log(
    `Checking freee API schema ${pinnedRevision.slice(0, 12)}..${latestRevision.slice(0, 12)}...`,
  );

  const usedEndpoints = await collectUsedEndpoints(repoRoot);
  const changesByApi = await Promise.all(
    API_SPECS.map(async ({ api, schemaPath }) => ({
      api,
      changes: await readChangelog(repoRoot, schemaPath, pinnedRevision, latestRevision),
    })),
  );

  const opportunities: Array<string> = [];
  const apiWideChanges: Array<string> = [];
  const usedOperationChanges: Array<string> = [];
  for (const { api, changes } of changesByApi) {
    const classified = classifyChanges(changes, usedEndpoints.get(api) ?? new Set());
    opportunities.push(...formatChanges(api, classified.opportunities));
    apiWideChanges.push(...formatChanges(api, classified.apiWideChanges));
    usedOperationChanges.push(...formatChanges(api, classified.usedOperationChanges));
  }

  const workingCopy = await createWorkingCopy(repoRoot);
  try {
    await replacePinnedRevision(workingCopy, pinnedRevision, latestRevision);

    const generation = await run(["bun", "run", "generate-types"], workingCopy);
    if (generation.exitCode !== 0) {
      console.error("Action required: the latest schema cannot generate the API clients.");
      console.error(formatCommandOutput(generation));
      return 1;
    }

    const validationResults = await validateGeneratedClient(workingCopy);
    const failedValidations = validationResults
      .filter(({ exitCode }) => exitCode !== 0)
      .map(({ name }) => name);

    if (
      opportunities.length === 0 &&
      apiWideChanges.length === 0 &&
      usedOperationChanges.length === 0 &&
      failedValidations.length === 0
    ) {
      console.log("No CLI action required. The pinned schema can remain unchanged.");
      return 0;
    }

    console.error("Action required for the latest freee API schema.");
    if (opportunities.length > 0) {
      console.error("\nNew API opportunities:");
      console.error(opportunities.join("\n"));
    }
    if (apiWideChanges.length > 0) {
      console.error("\nAPI-wide changes:");
      console.error(apiWideChanges.join("\n"));
    }
    if (usedOperationChanges.length > 0) {
      console.error("\nChanges to API operations used by the CLI:");
      console.error(usedOperationChanges.join("\n"));
    }
    for (const result of validationResults) {
      if (result.exitCode === 0) continue;
      console.error(`\nGenerated clients failed ${result.name}:`);
      console.error(formatCommandOutput(result));
    }
    return 1;
  } finally {
    await moveToTrash(workingCopy);
  }
}

if (import.meta.main) {
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  process.exitCode = await checkApiSchema(repoRoot);
}
