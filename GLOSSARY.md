# freee Domain

freee-cli uses these terms to distinguish authorization scope, business records, posted accounting records, and conclusions drawn from historical treatment.

## Access context

**Profile**:
A named authorization identity used to access freee. One Profile may have access to multiple Companies.
_Avoid_: User, Company, Workspace

**Company (事業所)**:
A freee business workspace that owns accounting data and master data.
_Avoid_: Profile, Partner, Organization

## Master data

**Partner (取引先)**:
A counterparty master that may represent either a customer or a supplier.
_Avoid_: Customer, Vendor, Company

**Account Item (勘定科目)**:
A named account in the chart of accounts. `Account` is acceptable inside established terms such as Account Coding.
_Avoid_: Item, Category, Expense Type

**Item (品目)**:
A product-or-service classification assigned to accounting or document lines.
_Avoid_: Account Item, Line Item

**Tax Category (税区分)**:
The consumption-tax treatment attached to one side of an accounting line.
_Avoid_: Tax Rate, Account Item

**Tax Code**:
The numeric freee API identifier for a Tax Category. Use Tax Category for the business concept and Tax Code for the API value.
_Avoid_: Tax Rate, Tax Category ID

## Accounting records

**Walletable (口座)**:
A source or destination of funds, such as a bank account, credit card, cash wallet, or private account.
_Avoid_: Wallet when referring to all types, Account Item

**Wallet Transaction (明細)**:
A statement-like line associated with a Walletable that may be linked to a Deal or Transfer. It is source evidence, not proof of how an expense was recorded.
_Avoid_: Transaction, Deal, Journal Entry

**Deal (取引)**:
A freee income or expense record, including its accounting lines and settlement state.
_Avoid_: Wallet Transaction, Journal Entry

**Deal Line (取引明細行)**:
An income or expense component of a Deal, carrying its Account Item, Tax Category, amount, and dimensions.
_Avoid_: Invoice Line, Journal Line, Item

**Deal Payment (決済)**:
A settlement line on a Deal that records an amount, date, and Walletable. It reduces the Deal's outstanding balance.
_Avoid_: Wallet Transaction, Invoice Payment Status

**Transfer (口座振替)**:
A movement of funds between Walletables that is neither income nor expense.
_Avoid_: Deal, Deal Payment

**Manual Journal (振替伝票)**:
A directly entered double-entry record that is not represented by a Deal or Transfer.
_Avoid_: Deal, Transfer

**Journal Entry (仕訳)**:
The posted double-entry accounting record, originating from a Deal, Transfer, Manual Journal, or another accounting event. It is the authoritative source for how a transaction was recorded.
_Avoid_: Deal, Wallet Transaction

**Journal Line (仕訳行)**:
One debit-and-credit line within a Journal Entry.
_Avoid_: Transaction

**File Box Document (ファイルボックスの証憑)**:
An uploaded evidence file, classified as a receipt, invoice, or other document, that may be attached to a Deal.
_Avoid_: Receipt, Invoice

**Invoice (請求書)**:
A sales document requesting payment from a Partner. It may be linked to a Deal but is not itself the accounting record.
_Avoid_: Deal, File Box Document

**Invoice Line (請求明細行)**:
A priced content line on an Invoice. It may carry accounting fields for a linked Deal draft but is not a Deal Line or Journal Line.
_Avoid_: Deal Line, Journal Line, Item

**Invoice Payment Status**:
The collection or settlement lifecycle state of an Invoice.
_Avoid_: Deal Payment, Wallet Transaction

## Automation and analysis

**Auto-Registration Rule (自動登録ルール)**:
A persistent rule that matches Wallet Transactions and either suggests or registers their accounting treatment.
_Avoid_: Workflow, Account Coding History

**Account Coding**:
The accounting treatment expressed by the debit and credit Account Items and Tax Categories assigned to Journal Lines.
_Avoid_: Categorization, Booking

**Account Coding Pattern**:
A distinct Account Coding observed in one or more historical Journal Entries, together with its frequency and examples.
_Avoid_: Recommendation, Rule

**Account Coding History**:
Evidence describing the Account Coding Patterns previously recorded for matching Journal Entries. It states what was recorded, not what should be recorded next.
_Avoid_: How Booked, Recommendation

**Account Coding Suggestion**:
A proposed Account Coding for an unrecorded item, based on current evidence and subject to review.
_Avoid_: Account Coding History, Decision

## Integration boundaries

**freee Web operation**:
An experimental operation based on observed freee Web behavior when the official API does not expose the required action.
_Avoid_: Browser command, Public API Operation, Screen Automation
