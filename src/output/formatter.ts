export function formatValue(data: unknown, format: string, human: string): string {
  return format === "json" ? JSON.stringify(data, null, 2) : human;
}

type DryRunRequest = {
  method: "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
};

export function formatDryRun(format: string, request: DryRunRequest, human: string): string {
  return formatValue({ dryRun: true, request }, format, human);
}

export function formatOutput(data: Record<string, unknown>[], format: string): string {
  if (format === "json") {
    return JSON.stringify(data, null, 2);
  }

  // table format
  const first = data[0];
  if (!first) {
    return "No results.";
  }

  const keys = Object.keys(first);
  const widths = keys.map((k) =>
    Math.max(k.length, ...data.map((row) => String(row[k] ?? "").length)),
  );

  const pad = (s: string, i: number) => s.padEnd(widths[i] ?? 0);
  const header = keys.map((k, i) => pad(k, i)).join("  ");
  const separator = widths.map((w) => "─".repeat(w)).join("──");
  const rows = data.map((row) => keys.map((k, i) => pad(String(row[k] ?? ""), i)).join("  "));

  return [header, separator, ...rows].join("\n");
}
