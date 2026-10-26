# freee CLI

The CLI operates on freee accounting and HR resources within a selected company.

## Language

**Company**:
A freee business entity with its own accounting records and access permissions.
_Avoid_: Workspace, profile, login account

**Profile**:
A named local connection that associates authentication with a selected Company. Several Profiles can address the same Company.
_Avoid_: Company, session

**Authentication**:
Authorization to access freee as an identity. API authorization and browser authentication are independent forms of access.
_Avoid_: Profile, Company

**Browser session**:
An authenticated browser context that can access a Company through the freee Web product.
_Avoid_: Profile, API token

**Wallet transaction**:
An entry in a freee bank, card, or wallet account awaiting or recording bookkeeping treatment. It is distinct from the accounting transaction it may be linked to.
_Avoid_: Deal, payment

**Deal**:
An accounting transaction that records income or expense and may have payments.
_Avoid_: Wallet transaction, bank statement

**Payment**:
An amount applied to a Deal from a payment source. Creating a Payment and linking an imported Wallet transaction are distinct operations.
_Avoid_: Wallet transaction, transfer
