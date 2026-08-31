---
"mattpocock-skills": minor
---

Add the `implement-with-agent-team` skill (engineering bucket, user-invoked). It builds a set of tickets in parallel, one fresh teammate per ticket, as far as the tickets' blocking edges allow, and the lead dispatches, verifies and merges rather than writing code.

- The skill stores nothing of its own. The graph is the tickets' native blocked-by links, progress is open versus closed, and a merged PR closes its ticket, so every command re-reads the tracker instead of a ledger kept beside it. A teammate notification that goes missing therefore costs a re-read rather than a ticket.
- `scripts/tickets.mjs` owns the checks the lead would otherwise make by eye: what must hold before dispatch, the frontier and its six statuses, claiming a ticket, and the two verifications that sit between a teammate's self-report and a merge. Each command answers on its last line and repeats that answer in its exit code, so a hook or a gate can read it without a model, and each failure names the remedy rather than the fault. There is no cycle check, because the tracker refuses any blocking link that would close one.
- Handing a ticket back splits by what would unblock it. A dependency the graph was missing is recorded as a real blocking link and the ticket frees itself when that blocker lands; only a ticket nothing available can move is reported as stuck.
- `hooks/model-guard.mjs` is a `PreToolUse` guard, scoped to spawns named `tkt-<number>`, that refuses a teammate spawn which has not named its model. The model parameter is optional and inherits the lead's, so an omission would otherwise put an expensive teammate on a ticket sized for a cheap one with nothing in the transcript saying so.

`implement` becomes model-invocable in the same change, so a teammate dispatched to build one ticket can reach it on its own. Its docs page carried two claims this makes false, that nothing but a person can invoke it and that fanning a ticket queue out across subagents does not exist, and both are corrected.
