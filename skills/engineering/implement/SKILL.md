---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Before you write any code, call the Skill tool with "unlazy" and write a `GATES.md` ledger for this work. Turn every acceptance criterion in the spec or ticket into one gate, stated as an outcome you can observe. Give a gate a `CHECK:` and an `EXPECT:` whenever a command can decide it, and leave it manual only when no command can. Approve and run the ledger before you start, so you know which gates fail today.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Re-run the whole ledger with `--reverify` once you believe the work is done. A gate whose evidence is missing or still `pending` is not met. Do not report the work as complete while any gate is unmet: either finish it, or record `ABANDON: <id> <reason>` and hand it back.

Once done, use /code-review to review the work.

Commit your work to the current branch.
