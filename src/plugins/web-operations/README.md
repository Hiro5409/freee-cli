# Experimental freee Web operations

This module implements invoice registration, invoice sending-status changes, and account synchronization through freee's authenticated Web interfaces. Account statement processing uses the official Accounting API in `src/commands/wallet-transaction/process.ts`.

| Operation                    | Missing official capability                                                |
| ---------------------------- | -------------------------------------------------------------------------- |
| `walletable sync`            | Start one-wallet or bulk synchronization and identify its terminal outcome |
| `invoice set-sending-status` | Set sending status without delivering the invoice                          |
| `invoice register-deal`      | Register the prepared invoice as a linked Deal                             |

The selected profile and company identify the encrypted browser session. Every browser operation verifies that company before dispatch. When an official API represents an operation and its final state, its implementation belongs to the corresponding resource command.
