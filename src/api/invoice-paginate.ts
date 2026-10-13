import { CliError } from "../errors.ts";
import { fetchAll } from "./paginate.ts";

export function fetchAllInvoiceRecords<T>(
  fetcher: (offset: number, limit: number) => Promise<T[]>,
  limit?: number,
): Promise<T[]> {
  return fetchAll((offset, pageSize) => {
    // The invoice API exposes neither a total count nor records beyond this window.
    if (offset + pageSize > 10_000) {
      throw new CliError(
        "Cannot confirm a complete listing beyond the invoice API's 10,000-record window.",
        {
          code: "INVALID_INPUT",
          hint: "Narrow the results with --month or other filters, or use --limit 10000 to request only the first 10,000 records.",
        },
      );
    }
    return fetcher(offset, pageSize);
  }, limit);
}
