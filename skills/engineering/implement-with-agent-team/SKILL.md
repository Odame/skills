---
name: implement-with-agent-team
description: Build a set of tickets in parallel with one fresh teammate each, as far as their blocking edges allow.
disable-model-invocation: true
---

You are the **lead**: you dispatch, verify and merge. Teammates write the code.

Resolve the tool once and keep the variable for the session:

```bash
T=$(find ~/.claude -path '*implement-with-agent-team/scripts/tickets.mjs' -not -path '*/node_modules/*' | head -1)
node $T --help
```

## Start

```bash
node $T preflight --epic <id>
```

Resolve everything it reports before dispatching. No `--base` given: this creates the epic's integration branch in every repo the run touches. See **Landing**.

## The loop

Run it until `frontier` exits `0`.

1. **Read the frontier.** First move of every turn, including the turn that resumes a crashed run.

   ```bash
   node $T frontier --epic <id>
   ```

2. **Claim each `READY` ticket**, up to seven at once.

   ```bash
   node $T claim --ticket <id> --model sonnet
   ```

3. **Dispatch every ticket you claimed in one message**, one `Agent` call each.
4. **Take each return**: verify, record, merge.
5. Back to 1.

| Status     | Your move                 |
| ---------- | ------------------------- |
| `READY`    | Claim and dispatch it     |
| `BUILDING` | Wait                      |
| `REVIEW`   | Verify and merge it       |
| `BLOCKED`  | Leave it; it frees itself |
| `STUCK`    | Report it and carry on    |
| `DONE`     | Leave it                  |

## Dispatch

One teammate, one ticket.

```
Agent(
  name: "tkt-1126",
  model: "sonnet",
  isolation: "worktree",
  prompt: <the brief>
)
```

The brief carries:

- The ticket, as `owner/repo#number`, for the teammate to read.
- Invoke the `implement` skill and follow it.
- The branch and base that `claim` printed.
- Open a PR when green, with `Closes #<number>` in the body.
- Return the PR number, what was run and its counts, the `code-review` output verbatim, and one fix-or-refute-with-evidence line per finding.
- Say so with evidence where a rule in the ticket is wrong or impossible.

Spawn every ticket, including one that looks too small to spawn and one in the repository you are already sitting in. Where a ticket seems undelegatable, add the missing fact to its brief, or hand it back.

## On return

```bash
node $T check-pr --ticket <id>              # resolve everything it reports first
node $T return --ticket <id> --pr <number>
gh pr merge <number> --repo <repo> --squash
node $T check-merged --ticket <id>
```

Triage the `code-review` output the teammate returned. Where triage turns something up, spawn an independent reviewer and give it the exact command:

```bash
git -C <absolute worktree path> diff <base>...<branch>
```

## When a ticket stops

The build found a dependency the graph lacks:

```bash
node $T hand-back --ticket <id> --blocked-on <blocker id> --reason "<what would unblock it>"
```

Nothing available can move it:

```bash
node $T hand-back --ticket <id> --stuck --reason "<what would unblock it>"
```

Reach for `--stuck` once `--blocked-on` is ruled out.

## Landing

By default a run lands on `epic/<number>-<slug>`, an integration branch `preflight` names after the epic and creates if it does not exist. Every ticket's PR targets it, not `main`, so merge each one same as any other on-return step, no approval needed: it is not shared history yet. Close each ticket by hand once its PR is merged (a merge into an integration branch does not close it), and open, never merge, the final PR from `epic/<number>-<slug>` into `main` once the frontier reports the run finished.

Pass `--base <branch>` to `preflight` and `claim` to land somewhere else instead: an existing branch, or a new one you name. Creates it if it doesn't exist yet, same as the epic default. Pass your repo's actual default branch (e.g. `--base main`) to skip an integration branch entirely: tickets then close on merge, and there is no final PR to open.

A `--tickets` run with no `--epic` has no epic to name a branch after: `--base` is required.

## Staying awake

```
Monitor(command: "node $T watch --epic <id>", description: "<epic name> tickets", timeout_ms: 3600000)
```

## Models

State the model on every spawn. Use `sonnet`. Choose `opus` where the ticket needs judgment no spec can pre-make, and say why as you choose it. Report the split at the end.

## Where you work

Work from the directory the session started in. Reach another tree as an argument: `git -C <absolute path>`, and absolute paths in tool calls.

Refer to tickets by name.
