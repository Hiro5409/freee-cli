---
description: Authenticate profiles and hand interactive OAuth steps to the user.
---

# Authentication

`freee setup` and `freee login` require an interactive terminal and browser.
Coding agents should ask the user to run them.

```sh
freee setup
freee login --profile work
freee status --profile work --format json
```

Pass the same `--profile` to later commands, or add `--set-default` during login.
Use `--replace` only when intentionally replacing credentials stored under the same profile name.
Use `profile-list --format json` to inspect profiles and `profile-set-default` to choose the default.
