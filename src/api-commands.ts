import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { toJsonSchema } from "@valibot/to-json-schema";
import { define, type SubCommandable } from "gunshi";
import {
  args as defineArgs,
  boolean,
  choice,
  combinator,
  map,
  merge,
  multiple,
  number,
  positional,
  required,
  string,
  withDefault,
} from "gunshi/combinators";
import * as v from "valibot";

import { commandGroup } from "./command-group.ts";
import { CliError, errorHints } from "./errors.ts";
import { companyArgs, globalArgs } from "./global-args.ts";
import { initClient, initCommand } from "./helpers.ts";

type Parameter = {
  name: string;
  location: string;
  required: boolean;
  type: string;
  multiple: boolean;
  choices?: ReadonlyArray<number | string>;
  description: string;
};

type BodyField = { name: string; required: boolean; type: string };

type RequestOptions = {
  path?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
  parseAs?: "arrayBuffer";
};

type ApiCommand = {
  call: (options: RequestOptions) => Promise<{ data?: unknown; response: Response }>;
  request: v.GenericSchema;
  command: ReadonlyArray<string>;
  summary: string;
  method: string;
  path: string;
  parameters: ReadonlyArray<Parameter>;
  body?: { required: boolean; fields: ReadonlyArray<BodyField> };
  companyIds?: ReadonlyArray<string>;
  paging?: { size: number; key?: string };
  download?: boolean;
};

const RESERVED = new Set(["profile", "company-id", "dry-run", "body", "all", "output"]);

export type ApiDefinition = {
  name: string;
  description: string;
  baseUrl: string;
  commands: ReadonlyArray<ApiCommand>;
};

const flag = (name: string) => name.replace(/[_[\]]+/g, "-").replace(/-+$/, "");

function integerArg(description: string) {
  return combinator({
    description,
    metavar: "integer",
    parse: (text) => {
      const value = Number(text);
      if (!/^-?\d+$/.test(text) || !Number.isSafeInteger(value)) {
        throw new Error(`Expected an integer between -(2^53 - 1) and 2^53 - 1.`);
      }
      return value;
    },
  });
}

function parameterArg(parameter: Parameter) {
  const { choices, description } = parameter;
  const base = choices
    ? map(choice(choices.map(String), { description }), (text) =>
        choices.find((value) => String(value) === text),
      )
    : parameter.type === "integer"
      ? integerArg(description)
      : parameter.type === "number"
        ? number({ description })
        : parameter.type === "boolean"
          ? boolean({ description })
          : string({ description });
  const arg = parameter.multiple ? multiple(base) : base;
  return parameter.required ? required(arg) : arg;
}

function invalidRequestError(issues: ReadonlyArray<v.BaseIssue<unknown>>) {
  const details = issues.map((issue) => {
    const at = issue.path?.map((item) => String(item.key)).join(".") || "request";
    return `${at}: expected ${issue.expected ?? issue.kind}`;
  });
  return new CliError(`Invalid request: ${details.join("; ")}`, {
    code: "INVALID_INPUT",
    why: "The request does not match the freee API schema.",
    hint: errorHints.invalidValue,
  });
}

function bodyDescription(fields: ReadonlyArray<BodyField>): string {
  const listed = fields
    .filter((field) => field.type !== "file")
    .map((field) => `${field.name}${field.required ? "*" : ""}`)
    .join(", ");
  return `Request body as JSON, @<path>, or - for standard input (* required): ${listed}. See "freee schema" for the full shape.`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function hasUnsafeInteger(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && !Number.isSafeInteger(value);
  if (Array.isArray(value)) return value.some(hasUnsafeInteger);
  return isRecord(value) && Object.values(value).some(hasUnsafeInteger);
}

async function readBody(source: unknown): Promise<Record<string, unknown> | undefined> {
  if (typeof source !== "string") return undefined;
  const fromFile = source.startsWith("@") ? Bun.file(resolve(source.slice(1))) : undefined;
  if (fromFile && !(await fromFile.exists())) {
    throw new CliError(`File not found: ${source.slice(1)}`, {
      code: "INVALID_INPUT",
      hint: "Pass --body @<path> with an existing JSON file.",
    });
  }
  const text = source === "-" ? await Bun.stdin.text() : fromFile ? await fromFile.text() : source;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {}
  if (isRecord(value)) {
    if (hasUnsafeInteger(value)) {
      throw new CliError(
        "--body has an integer beyond 2^53 - 1, which JSON numbers cannot hold exactly.",
        {
          code: "INVALID_INPUT",
          hint: "Pass integers between -(2^53 - 1) and 2^53 - 1.",
        },
      );
    }
    return value;
  }
  throw new CliError("--body must be a JSON object.", {
    code: "INVALID_INPUT",
    why: "The request body is sent to freee as a JSON object.",
    hint: "Pass --body as a JSON object, @<path> to a JSON file, or - to read standard input.",
  });
}

async function fetchAllPages(
  command: ApiCommand,
  options: RequestOptions,
  paging: { size: number; key?: string },
) {
  const items: Array<unknown> = [];
  let first: Record<string, unknown> | undefined;
  for (let offset = 0; ; offset += paging.size) {
    const { data } = await command.call({
      ...options,
      query: { ...options.query, offset, limit: paging.size },
    });
    const page: unknown = paging.key && isRecord(data) ? data[paging.key] : data;
    if (!Array.isArray(page)) {
      throw new CliError("freee returned a page without a list.", { code: "UPSTREAM_FAILURE" });
    }
    if (isRecord(data)) first ??= data;
    items.push(...(page as ReadonlyArray<unknown>));
    if (page.length < paging.size) break;
  }
  return paging.key ? { ...first, [paging.key]: items } : items;
}

function saveDownload(target: string, data: unknown, response: Response): string {
  const path = resolve(target);
  if (!(data instanceof ArrayBuffer) || response.headers.get("Content-Type")?.includes("json")) {
    throw new CliError("freee returned an invalid download response.", {
      code: "UPSTREAM_FAILURE",
    });
  }
  writeFileSync(path, new Uint8Array(data), { flag: "wx" });
  return JSON.stringify({
    path,
    mimeType: response.headers.get("Content-Type") ?? "application/octet-stream",
    bytes: data.byteLength,
  });
}

const dryRunFlag = defineArgs({
  "dry-run": withDefault(
    boolean({ description: "Print the request without sending it to freee" }),
    false,
  ),
});

function leaf(command: ApiCommand, baseUrl: string) {
  const parameters = command.parameters.map((parameter) => ({
    ...parameter,
    flag: flag(parameter.name),
  }));
  const files = command.body?.fields.filter((field) => field.type === "file") ?? [];
  const argDefinitions: Record<string, ReturnType<typeof parameterArg>> = {};
  for (const { flag: name, ...parameter } of parameters) {
    if (RESERVED.has(name) || name in argDefinitions) {
      throw new Error(
        `${command.method} ${command.path}: parameter --${name} collides with another flag`,
      );
    }
    argDefinitions[name] = parameterArg(parameter);
  }
  for (const file of files) {
    const arg = string({ description: `Path of the file sent as ${file.name}` });
    argDefinitions[flag(file.name)] = file.required ? required(arg) : arg;
  }
  const bodyArg = string({ description: bodyDescription(command.body?.fields ?? []) });
  const takesJsonBody = command.body?.fields.some((field) => field.type !== "file") ?? false;
  const extra = defineArgs({
    ...argDefinitions,
    ...(takesJsonBody
      ? { body: command.body?.required && files.length === 0 ? required(bodyArg) : bodyArg }
      : {}),
    ...(command.paging
      ? { all: withDefault(boolean({ description: "Fetch every page" }), false) }
      : {}),
    ...(command.download
      ? { output: required(string({ description: "Path to write the downloaded file to" })) }
      : {}),
  });
  const base = merge(command.companyIds ? companyArgs : globalArgs, dryRunFlag);

  return define({
    name: command.command.at(-1) ?? "",
    description: command.summary,
    args: merge(base, extra),
    run: async (ctx) => {
      const values = ctx.values as Record<string, unknown>;
      let companyId: number | undefined;
      if (command.companyIds) companyId = initCommand(ctx).companyId;
      else initClient(ctx);
      const companyAt = (location: string) =>
        command.companyIds?.includes(location) ? { company_id: companyId } : {};
      const pick = (location: string) =>
        Object.fromEntries(
          parameters
            .filter(
              (parameter) =>
                parameter.location === location && values[parameter.flag] !== undefined,
            )
            .map((parameter) => [parameter.name, values[parameter.flag]]),
        );
      const fetchAll = command.paging !== undefined && values.all === true;
      if (fetchAll && (values.offset !== undefined || values.limit !== undefined)) {
        throw new CliError(
          "--all reads every page, so it cannot be combined with --offset or --limit.",
          {
            code: "INVALID_INPUT",
            hint: "Remove --offset and --limit, or remove --all.",
          },
        );
      }
      const path: Record<string, unknown> = { ...pick("path"), ...companyAt("path") };
      for (const [name, value] of Object.entries(path)) {
        if (value === "." || value === "..") {
          throw new CliError(`--${flag(name)} cannot be "${value}".`, {
            code: "INVALID_INPUT",
            why: "A dot segment would change the request path.",
          });
        }
      }
      const query = {
        ...pick("query"),
        ...companyAt("query"),
        ...(fetchAll && command.paging ? { offset: 0, limit: command.paging.size } : {}),
      };
      const filePaths = Object.fromEntries(
        files
          .filter((file) => values[flag(file.name)] !== undefined)
          .map((file) => [file.name, resolve(String(values[flag(file.name)]))]),
      );
      for (const filePath of Object.values(filePaths)) {
        if (!(await Bun.file(filePath).exists())) {
          throw new CliError(`File not found: ${filePath}`, {
            code: "INVALID_INPUT",
            hint: "Pass the path of an existing file.",
          });
        }
      }
      const jsonBody = { ...(await readBody(values.body)), ...companyAt("body") };
      const body =
        command.body === undefined
          ? undefined
          : {
              ...jsonBody,
              ...Object.fromEntries(
                Object.entries(filePaths).map(([name, filePath]) => [name, Bun.file(filePath)]),
              ),
            };
      const options: RequestOptions = {
        ...(Object.keys(path).length ? { path } : {}),
        ...(Object.keys(query).length ? { query } : {}),
        ...(body === undefined ? {} : { body }),
      };

      const validation = await v.safeParseAsync(command.request, options);
      if (!validation.success) throw invalidRequestError(validation.issues);

      const target = command.download ? resolve(String(values.output)) : undefined;
      if (target && existsSync(target)) {
        throw new CliError(`Output path already exists: ${target}`, {
          code: "INVALID_INPUT",
          why: "freee-cli does not overwrite downloaded files.",
          hint: "Choose a new --output path.",
        });
      }

      if (values["dry-run"]) {
        const url = command.path.replace(/\{(\w+)\}/g, (_, name: string) =>
          encodeURIComponent(String(path[name])),
        );
        return JSON.stringify({
          dryRun: true,
          request: {
            method: command.method,
            url: `${baseUrl}${url}`,
            query,
            ...(body === undefined ? {} : { body: { ...jsonBody, ...filePaths } }),
          },
        });
      }
      if (command.download) {
        const { data, response } = await command.call({ ...options, parseAs: "arrayBuffer" });
        return saveDownload(String(target), data, response);
      }
      if (fetchAll && command.paging) {
        return JSON.stringify(await fetchAllPages(command, options, command.paging));
      }
      const { data } = await command.call(options);
      return JSON.stringify(data ?? {});
    },
  });
}

type Tree = { commands: Map<string, SubCommandable>; groups: Map<string, Tree> };

function commandTree({ name, description, baseUrl, commands }: ApiDefinition) {
  const root: Tree = { commands: new Map(), groups: new Map() };
  const place = (path: ReadonlyArray<string>, command: SubCommandable) => {
    let node = root;
    for (const segment of path.slice(0, -1)) {
      const child = node.groups.get(segment) ?? { commands: new Map(), groups: new Map() };
      node.groups.set(segment, child);
      node = child;
    }
    const leafName = path.at(-1) ?? "";
    if (node.commands.has(leafName)) throw new Error(`Duplicate command: ${path.join(" ")}`);
    node.commands.set(leafName, command);
  };
  for (const command of commands) place(command.command, leaf(command, baseUrl));
  const build = (groupName: string, groupDescription: string, tree: Tree): SubCommandable => {
    const subCommands: Record<string, SubCommandable> = Object.fromEntries(tree.commands);
    for (const [childName, child] of tree.groups) {
      if (childName in subCommands)
        throw new Error(`Command and group share the name ${childName}`);
      subCommands[childName] = build(childName, childName.replace(/-/g, " "), child);
    }
    return commandGroup(groupName, groupDescription, subCommands);
  };
  return build(name, description, root);
}

function schemaCommand(apis: ReadonlyArray<ApiDefinition>) {
  const byPath = new Map(
    apis.flatMap((api) =>
      api.commands.map((command) => [[api.name, ...command.command].join(" "), command] as const),
    ),
  );
  return define({
    name: "schema",
    description: "Print the JSON Schema of an API command's request",
    args: defineArgs({
      command: positional(
        multiple(string({ description: "Command path, such as accounting deal show" })),
      ),
    }),
    examples: "$ freee schema accounting manual-journal create",
    run: (ctx) => {
      const path = (ctx.values.command ?? []).join(" ");
      const command = byPath.get(path);
      if (!command) {
        throw new CliError(`Unknown API command: ${path || "(none)"}`, {
          code: "INVALID_INPUT",
          why: "The schema command describes one generated API command.",
          hint: 'Pass the command path, for example "freee schema accounting deal create".',
        });
      }
      return JSON.stringify({
        command: path,
        method: command.method,
        path: command.path,
        request: toJsonSchema(command.request, {
          errorMode: "ignore",
          typeMode: "input",
          overrideSchema: ({ valibotSchema }) =>
            valibotSchema.type === "bigint"
              ? { type: "integer" }
              : valibotSchema.type === "blob"
                ? { type: "string", format: "binary" }
                : undefined,
        }),
      });
    },
  });
}

export function apiCommands(apis: ReadonlyArray<ApiDefinition>): Record<string, SubCommandable> {
  return {
    ...Object.fromEntries(apis.map((api) => [api.name, commandTree(api)])),
    schema: schemaCommand(apis),
  };
}
