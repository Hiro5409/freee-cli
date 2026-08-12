---
description: Choose the correct freee product and resource before running a command.
---

# Resource boundaries

Commands are typed around a specific freee product and resource.
Do not infer a command from a similar resource name.

- `receipt-*` handles file-box receipts in the accounting API.
- `invoice-*` handles invoices in the invoice API.
- `hr-*` reads payroll and employee data from the HR API.
- Accounting and invoice API resources with similar names are not interchangeable.

Run `freee --help` to discover supported operations and the selected command's `--help` before constructing arguments.
When no typed command exists, use freee's official MCP or API documentation instead of guessing an endpoint or payload.
