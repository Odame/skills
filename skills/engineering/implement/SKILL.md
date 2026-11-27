---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

If the user passes a ticket reference, fetch it from the issue tracker and state its title before starting. If the reference is ambiguous, ask.

Call the Skill tool with "tdd" where possible, at pre-agreed seams.

Run typechecking regularly. Keep every test run **scoped**: the test files your change reaches, or the repo's affected-tests command (such as `vitest related`). Run a full suite only where the repo's own docs call for one, and then once, at the end. CI runs the full suite on the pull request.

Once done, call the Skill tool with `odame-skills:code-review` to review the work.

Commit your work to the current branch.
