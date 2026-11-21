import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as v from "valibot";

import { apis } from "../src/api/apis.ts";

const SCHEMA_REPOSITORY = "https://github.com/freee/freee-api-schema.git";
const SCHEMA_RAW_BASE_URL = "https://raw.githubusercontent.com/freee/freee-api-schema";
const SCHEMA_REF = "refs/heads/master";
const PINNED_SCHEMA_PATTERN =
  /https:\/\/raw\.githubusercontent\.com\/freee\/freee-api-schema\/([0-9a-f]{40})/;

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

function formatCommandOutput(result: CommandResult): string {
  return [result.stdout, result.stderr]
    .map((output) => output.trim())
    .filter(Boolean)
    .join("\n");
}

export function extractPinnedRevision(configSource: string): string {
  const revision = configSource.match(PINNED_SCHEMA_PATTERN)?.[1];
  if (!revision) throw new Error("Cannot find the pinned freee API schema commit");
  return revision;
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
      try {
        await cp(join(repoRoot, path), target);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
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

function formatChanges(api: string, changes: ReadonlyArray<OasChange>): Array<string> {
  return changes.map(({ id, operation, path, text }) => {
    const endpoint = operation && path ? `${operation} ${path}` : "API";
    return `- [${api}] ${endpoint}: ${text} (${id})`;
  });
}

async function validateGeneratedClient(workingCopy: string): Promise<Array<ValidationResult>> {
  const validations: ReadonlyArray<{ command: Array<string>; name: string }> = [
    { command: ["bun", "run", "check:format"], name: "format" },
    { command: ["bun", "run", "check:types"], name: "types" },
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

  const changesByApi = await Promise.all(
    apis.map(async ({ name, schema }) => ({
      name,
      changes: await readChangelog(repoRoot, schema, pinnedRevision, latestRevision),
    })),
  );
  const changes = changesByApi.flatMap((api) => formatChanges(api.name, api.changes));

  const workingCopy = await createWorkingCopy(repoRoot);
  try {
    await replacePinnedRevision(workingCopy, pinnedRevision, latestRevision);

    const generation = await run(["bun", "run", "generate-types"], workingCopy);
    if (generation.exitCode !== 0) {
      console.error("The latest freee API schema cannot generate the API clients.");
      console.error(formatCommandOutput(generation));
      return 1;
    }

    const validationResults = await validateGeneratedClient(workingCopy);
    console.error("Update the pinned freee API schema: the generated commands change.");
    if (changes.length > 0) {
      console.error("\nSchema changes:");
      console.error(changes.join("\n"));
    }
    for (const result of validationResults) {
      if (result.exitCode === 0) continue;
      console.error(`\nThe latest schema fails ${result.name}:`);
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
