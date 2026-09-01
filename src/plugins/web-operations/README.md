# Experimental freee Web operations

This module bridges operations that freee exposes through its Web product but not through its official APIs.
Its commands are temporary: once an official API can produce and verify the same final state, freee-cli replaces the Web command with a stable command outside `freee web` and deletes the Web implementation in the same release.

“Official API” means an endpoint documented in freee's official [Accounting OpenAPI](https://github.com/freee/freee-api-schema/blob/master/v2020_06_15/open-api-3/api-schema.json) or [Invoice OpenAPI](https://github.com/freee/freee-api-schema/blob/master/iv/open-api-3/api-schema.yml).

## Scope

Web operations cover frequent, deterministic actions on one known freee resource. Complex postings, freee-generated suggestions, and low-frequency screen workflows remain in freee Web when their inputs cannot be represented completely by a command.

| Web command                  | Missing official capability                                                                                                                          | Removal criterion                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `walletable sync`            | The official API can read synchronization status and the last successful synchronization, but cannot start synchronization.                          | The official API can start one-walletable and bulk synchronization, identify the walletables participating in a bulk request, and report their terminal outcomes. |
| `wallet-txn apply-rules`     | The official `user_matchers` API manages rule definitions but cannot preview or apply the current rules to existing unprocessed wallet transactions. | The official API can preview the current match set and apply the rules while returning the affected wallet transaction IDs.                                       |
| `wallet-txn ignore`          | The official wallet transaction API has no status mutation; deleting a transaction is not the same as ignoring a synchronized statement.             | The official API can mark a specific synchronized wallet transaction as ignored and report that state.                                                            |
| `wallet-txn register`        | Creating a Deal through the official API does not link or process the synchronized wallet transaction that supplied it.                              | The official API creates and links a Deal from a specific wallet transaction, then reports the statement as processed.                                            |
| `wallet-txn restore`         | The official API cannot return an ignored synchronized statement to unprocessed.                                                                     | The official API can restore a specific ignored wallet transaction and report that state.                                                                         |
| `wallet-txn settle`          | Creating a Deal payment does not link or process the synchronized wallet transaction that supplied the payment.                                      | The official API accepts a wallet transaction ID, existing Deal ID, and settlement amount, then reports the statement as linked and processed.                    |
| `wallet-txn transfer`        | Creating an account transfer does not link or process the synchronized wallet transaction that supplied it.                                          | The official API creates or links an account transfer from a specific wallet transaction and reports the statement as processed.                                  |
| `invoice set-sending-status` | The Invoice API reports the sending status but cannot change it without delivering the invoice.                                                      | The official API sets a specific invoice to `sent` or `unsent` without delivering it and reports the resulting sending status.                                    |
| `invoice register-deal`      | The Invoice API stores accounting fields but has no action that registers the prepared invoice as a Deal.                                            | The official API registers a Deal from a specific invoice and exposes the resulting Deal ID and registered state.                                                 |

The removal criterion is semantic rather than endpoint-name based.
An endpoint is not a replacement until the stable command can preserve the Web command's final state and verification behavior.

`wallet-txn register` handles one full-amount, single-line Deal whose accounting judgment consists only of an account item, tax classification, and description. The statement supplies the date, direction, amount, and payment account. A successful result includes the created Deal ID after freee reports a single linked Deal. Use freee Web directly when a Deal needs multiple lines, a partner, item, section, tag, segment, or invoice settings.
