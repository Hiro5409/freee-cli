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

export function formatResource(data: Record<string, unknown>, format: string): string {
  return format === "json" ? JSON.stringify(data, null, 2) : formatOutput([data], format);
}

function terminalSafe(value: unknown): string {
  let safe = "";
  for (const character of stripVTControlCharacters(String(value ?? ""))) {
    const code = character.charCodeAt(0);
    if (code >= 0x20 && (code < 0x7f || code > 0x9f)) safe += character;
  }
  return safe;
}

export function formatOutput(data: Record<string, unknown>[], format: string): string {
  if (format === "json") {
    return JSON.stringify(data, null, 2);
  }

  const first = data[0];
  if (!first) {
    return "No results.";
  }

  const keys = Object.keys(first);
  const rows = data.map((row) => keys.map((key) => terminalSafe(row[key])));
  const widths = keys.map((key, index) =>
    Math.max(key.length, ...rows.map((row) => row[index]?.length ?? 0)),
  );

  const pad = (s: string, i: number) => s.padEnd(widths[i] ?? 0);
  const header = keys.map((k, i) => pad(k, i)).join("  ");
  const separator = widths.map((w) => "─".repeat(w)).join("──");
  const formattedRows = rows.map((row) => row.map((value, i) => pad(value, i)).join("  "));

  return [header, separator, ...formattedRows].join("\n");
}
import { stripVTControlCharacters } from "node:util";
