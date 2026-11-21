import {
  $,
  type DefinePlugin,
  definePluginConfig,
  type IR,
  type Plugin,
} from "@hey-api/openapi-ts";

type CommandsPlugin = DefinePlugin<{ name: "commands" } & Plugin.Hooks & Plugin.Exports>;

type ParamType = "boolean" | "integer" | "number" | "string";

function resolve(plugin: CommandsPlugin["Instance"], schema: IR.SchemaObject): IR.SchemaObject {
  let current = schema;
  while (current.$ref) current = plugin.context.resolveIrRef<IR.SchemaObject>(current.$ref);
  return current;
}

function scalarType(schema: IR.SchemaObject): ParamType {
  if (schema.type === "integer" || schema.type === "number" || schema.type === "boolean") {
    return schema.type;
  }
  return "string";
}

function firstLine(text: string | undefined): string {
  return (
    (text ?? "")
      .replace(/<[^>]+>/g, " ")
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

const kebab = (word: string) => word.replace(/_/g, "-");
const singular = (word: string) =>
  word
    .replace(/ies$/, "y")
    .replace(/(ss|x|ch|sh|us)es$/, "$1")
    .replace(/([^su])s$/, "$1");

const ACTIONS = new Set([
  "apply",
  "bulk_update",
  "cancel",
  "download",
  "ignore",
  "reconcile",
  "remark",
  "reset",
  "search",
  "uncancel",
  "upsert",
  "upsert_by_code",
]);
const isAction = (segment: string) => ACTIONS.has(segment) || segment.startsWith("create_");

function commandPath(path: string, method: string): Array<string> {
  const segments = path
    .replace(/^\/api\/(1|v1)\//, "/")
    .split("/")
    .filter(Boolean);
  const isParam = (segment: string | undefined) => segment?.startsWith("{") ?? false;
  const last = segments.at(-1);
  const literals = segments.filter((segment) => !isParam(segment));
  const keepVerbatim = literals[0] === "reports";
  const groups = literals.map((segment, index) =>
    kebab(keepVerbatim && index > 0 ? segment : singular(segment)),
  );
  if (last && isAction(last)) return [...groups.slice(0, -1), kebab(last)];
  const action =
    method === "get"
      ? isParam(last) || singular(last ?? "") === last || groups[0] === "report"
        ? "show"
        : "list"
      : method === "post"
        ? "create"
        : method === "delete"
          ? "delete"
          : "update";
  return [...groups, action];
}

function parameterValue(plugin: CommandsPlugin["Instance"], parameter: IR.ParameterObject) {
  const schema = resolve(plugin, parameter.schema);
  const item =
    schema.type === "array" && schema.items?.[0] ? resolve(plugin, schema.items[0]) : undefined;
  const choices = (
    schema.type === "enum" ? schema.items : item?.type === "enum" ? item.items : undefined
  )
    ?.map((member) => member.const)
    .filter((value) => typeof value === "string" || typeof value === "number");
  return {
    name: parameter.name,
    location: parameter.location,
    required: parameter.required ?? false,
    type: scalarType(item ?? schema),
    multiple: schema.type === "array",
    ...(choices?.length ? { choices } : {}),
    description: firstLine(parameter.description) || parameter.name,
  };
}

function objectBranches(
  plugin: CommandsPlugin["Instance"],
  schema: IR.SchemaObject,
): Array<IR.SchemaObject> {
  const resolved = resolve(plugin, schema);
  if (resolved.logicalOperator && resolved.items) {
    return resolved.items.flatMap((item) => objectBranches(plugin, item));
  }
  return resolved.properties ? [resolved] : [];
}

function bodyFields(plugin: CommandsPlugin["Instance"], branches: ReadonlyArray<IR.SchemaObject>) {
  const fields = new Map<string, { name: string; required: boolean; type: string }>();
  for (const branch of branches) {
    for (const [name, field] of Object.entries(branch.properties ?? {})) {
      if (name === "company_id" || fields.has(name)) continue;
      const resolved = resolve(plugin, field);
      fields.set(name, {
        name,
        required: branches.length === 1 && (branch.required?.includes(name) ?? false),
        type: resolved.format === "binary" ? "file" : (resolved.type ?? "unknown"),
      });
    }
  }
  return [...fields.values()];
}

function listKey(plugin: CommandsPlugin["Instance"], operation: IR.OperationObject) {
  const success = Object.entries(operation.responses ?? {}).find(([code]) =>
    code.startsWith("2"),
  )?.[1];
  const schema = success ? resolve(plugin, success.schema) : undefined;
  if (!schema || schema.type === "array") return undefined;
  const arrays = Object.entries(schema.properties ?? {})
    .filter(([, value]) => resolve(plugin, value).type === "array")
    .map(([name]) => name);
  const resource = operation.path
    .split("/")
    .filter((segment) => !segment.startsWith("{"))
    .at(-1);
  const key =
    arrays.find((name) => name === resource) ?? (arrays.length === 1 ? arrays[0] : undefined);
  if (!key) throw new Error(`Cannot find the list in ${operation.method} ${operation.path}`);
  return key;
}

function returnsFile(operation: IR.OperationObject): boolean {
  const success = Object.entries(operation.responses ?? {}).find(([code]) =>
    code.startsWith("2"),
  )?.[1];
  return success?.mediaType !== undefined && !success.mediaType.includes("json");
}

const handler: CommandsPlugin["Handler"] = ({ plugin }) => {
  const commands: Array<ReturnType<typeof $.object>> = [];
  plugin.forEach("operation", ({ operation }) => {
    if (operation.deprecated) return;
    const parameters = [
      ...Object.values(operation.parameters?.path ?? {}),
      ...Object.values(operation.parameters?.query ?? {}),
    ];
    const branches = operation.body ? objectBranches(plugin, operation.body.schema) : [];
    const companyIds = [
      ...parameters.filter((parameter) => parameter.name === "company_id").map((p) => p.location),
      ...(branches.some((branch) => branch.properties?.company_id) ? ["body"] : []),
    ];
    const query = operation.parameters?.query ?? {};
    const listed = query.offset && query.limit ? listKey(plugin, operation) : null;
    const paging =
      query.limit && listed !== null
        ? {
            size: resolve(plugin, query.limit.schema).maximum ?? 100,
            ...(listed ? { key: listed } : {}),
          }
        : undefined;
    const sdk = plugin.referenceSymbol({
      category: "sdk",
      resource: "operation",
      resourceId: operation.id,
    });
    const metadata = {
      command: commandPath(operation.path, operation.method),
      summary: firstLine(operation.summary ?? operation.description),
      method: operation.method.toUpperCase(),
      path: operation.path,
      parameters: parameters
        .filter((parameter) => parameter.name !== "company_id")
        .map((parameter) => parameterValue(plugin, parameter)),
      ...(operation.body
        ? {
            body: {
              required: operation.body.required ?? false,
              fields: bodyFields(plugin, branches),
            },
          }
        : {}),
      ...(companyIds.length ? { companyIds } : {}),
      ...(paging ? { paging } : {}),
      ...(returnsFile(operation) ? { download: true } : {}),
    };
    const data = plugin.querySymbol({
      artifact: "valibot",
      category: "schema",
      resource: "operation",
      resourceId: operation.id,
      role: "data",
    });
    if (!data) throw new Error(`No request schema for ${operation.method} ${operation.path}`);
    const call = $.func()
      .param("options", (p) => p.type("unknown"))
      .do($(sdk).call($("options").as("never")).return());
    const entry = $.object().prop("call", call).prop("request", $(data));
    for (const [key, value] of Object.entries(metadata)) entry.prop(key, $.fromValue(value));
    commands.push(entry);
  });
  const symbol = plugin.symbol("commands");
  plugin.node(
    $.const(symbol)
      .export()
      .assign($.array(...commands)),
  );
};

const defaultConfig: CommandsPlugin["Config"] = {
  config: { includeInEntry: false },
  dependencies: ["@hey-api/sdk", "valibot"],
  handler,
  name: "commands",
  symbolMeta: () => ({ artifact: "commands" }),
};

export const defineConfig = definePluginConfig(defaultConfig);
