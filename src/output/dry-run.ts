type DryRunRequest = {
  method: "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
};

export function dryRunOutput(request: DryRunRequest): string {
  return JSON.stringify({ dryRun: true, request });
}
