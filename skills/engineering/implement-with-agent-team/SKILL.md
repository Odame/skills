---
name: implement-with-agent-team
description: Build a set of tickets in parallel with one fresh teammate each, as far as their blocking edges allow.
disable-model-invocation: true
---

Build tickets that already carry their own specs. You are the **lead**: you dispatch, triage and merge. Teammates write every line of code.

**The tracker holds the state, not you.** Every command below reads it fresh, so nothing has to be remembered between turns and a notification you never saw costs you nothing: ask again and it tells you where the run stands.

Resolve the tool once, then keep the variable for the session:

```bash
T=$(find ~/.claude -path '*implement-with-agent-team/scripts/tickets.mjs' -not -path '*/node_modules/*' | head -1)
node $T --help
```

Every command takes tickets as `owner/repo#123`. A run is either an epic or an explicit list:

```bash
node $T <command> --epic acme/api#412 [--repo acme/api]
node $T <command> --tickets acme/api#413,acme/web#87
```

`--repo` narrows an epic to one repository, which is what "the backend tickets of #412" means.

## Start

```bash
node $T preflight --epic <id>
```

It reports what must hold before anything is dispatched, including how much of the run can go in parallel and whether a previous run left tickets claimed. Fix what it names before going further.

## The loop

Run it until `frontier` exits `0`.

```bash
node $T frontier --epic <id>
```

The **frontier** is every open ticket whose blockers have all closed: what is takeable right now. Each ticket gets one status.

| Status | Meaning | Your move |
|---|---|---|
| `READY` | Takeable now | Claim and dispatch it |
| `BUILDING` | A teammate has it | Wait |
| `REVIEW` | A teammate returned | Verify, then merge |
| `BLOCKED` | A blocker is still open | Nothing; it frees itself |
| `STUCK` | Nothing here can move it | Report it; the run continues without it |
| `DONE` | Closed | Nothing |

Its last line says what to do next, and its exit code answers "is this finished": `0` everything closed, `2` work remains.

Then, each turn:

1. **Read the frontier.** First move every turn, including the turn that resumes a crashed run.
2. **Take each `READY` ticket**, up to seven at once. This is also what stops the next read offering it again:
   ```bash
   node $T claim --ticket <id> --model sonnet
   ```
   It prints the branch and base to build on. Add `--redispatch` only to replace a teammate that is gone.

   By default each ticket lands on the repository's default branch as it finishes, which is what a tracer-bullet ticket is sized for. To hold a run back until it is whole, claim every ticket with `--base <branch>` instead, and see Landing on a branch below.
3. **Dispatch them all in one message**, one `Agent` call per ticket. The parallelism lives here: spawning one at a time and waiting between makes the whole run serial for nothing.
4. **Take each return.** Verify it, record it, merge it. See below.
5. Back to step 1.

**A ticket only starts once its blockers have merged, so the base branch already contains them.** Every teammate branches off it, nothing is stacked, and no rebase chain has to land at the end.

## Dispatch

One teammate builds one ticket and is then discarded. Give it a second and it builds against a compacted summary of the first.

```
Agent(
  name: "tkt-1126",              # tkt-<ticket number>
  model: "sonnet",               # always explicit; see Cost
  isolation: "worktree",         # its own tree, so teammates never collide
  prompt: <the brief>
)
```

The brief holds the ticket and the facts only you have:

- **The ticket body, pasted whole.** It is already the spec. Anything you write beside it re-decides a settled question, and the teammate follows your version.
- Invoke the `implement` skill and follow it.
- The branch and base that `claim` printed.
- Open a PR when green, with `Closes #<number>` in the body.
- Return: the PR number, what was run and its counts, the `code-review` output **verbatim**, and one fix-or-refute-with-evidence line per finding.
- If a rule in the ticket is wrong or impossible, say so with evidence rather than complying quietly.

## When a teammate returns

**Verify before you believe it.** The teammate's report is its own account of its own work:

```bash
node $T check-pr --ticket <id>
```

It reads the PR itself and fails with the remedy when something is wrong. Only when it passes:

```bash
node $T return --ticket <id> --pr <number>
gh pr merge <number> --repo <repo> --squash
node $T check-merged --ticket <id>
```

That last one is not ceremony: a merge that leaves the ticket open frees nothing, and the run would circle a frontier that never advances.

`implement` ends in `code-review`, and the teammate has already fixed what it found, so commissioning a second review by reflex re-derives the same findings at full price. What that review lacks is independence from its author, which is why the brief demands its output verbatim with a fix-or-refute line per finding. Spawn an independent reviewer when triage itself turns something up: a refutation you do not believe, or a teammate that drifted from its ticket. Give it the exact command, because a fresh agent lands nowhere near the branch:

```bash
git -C <absolute worktree path> diff <base>...<branch>
```

## When a ticket cannot be built

Two outcomes, and only one of them needs you to stop.

**The build found a dependency the graph was missing.** Record it, and the ticket frees itself when that blocker lands:

```bash
node $T hand-back --ticket <id> --blocked-on <blocker id> --reason "<what it needs, and why>"
```

**Nothing available can move it**, because the ticket contradicts itself or it needs something outside the repository:

```bash
node $T hand-back --ticket <id> --stuck --reason "<what was tried, and what would unblock it>"
```

The reason is read by whoever picks the ticket up next, most often a later lead deciding whether it can act. Write what would unblock it, not what went wrong.

Reach for `--stuck` only after `--blocked-on` is ruled out. Most stops are a missing edge, a collision with something in flight, or a transient failure worth one re-dispatch, and all three keep moving without anyone's attention.

## Staying awake

Teammate notifications go missing. Nothing is lost when one does, because the frontier re-reads the tracker, but the run can sit idle waiting for news that never arrives. Arm a change feed alongside the work, and each change arrives on its own:

```
Monitor(command: "node $T watch --epic <id>", description: "<epic name> tickets", timeout_ms: 3600000)
```

It emits one line per thing worth acting on, including a teammate that went quiet without opening a PR, and exits when every ticket is closed. Polling is conditional, so most of it costs nothing.

## Landing on a branch

`claim --base <branch>` sends a ticket's work to an integration branch rather than the default one. Give **every** ticket in the run the same base: the frontier reports a run whose claimed tickets disagree, because one run lands in one place.

Two things differ once you do, and the checks carry both:

- A merge into that branch does not close its ticket, so close it yourself once the PR is in. `check-merged` stays red until you do, and nothing the ticket blocks starts before then.
- When the frontier reports the run finished, the work is on that branch. Open one pull request from it to land the whole run.

## Cost

**Every spawn states its model.** The parameter is optional and inherits yours, so one omission puts an Opus teammate on a ticket sized for Sonnet with nothing in the transcript saying so.

`sonnet` builds every ticket whose spec makes the decisions for it, which is what a specced ticket is. Reach for `opus` where the ticket needs judgment no spec can pre-make (security-sensitive logic, subtle trade-offs), and say why as you choose it. Sharpening the ticket is nearly always cheaper. Report the split at the end: how many tickets ran on each model.

## You dispatch; teammates build

Your context is the one thing that must survive the whole run. Building a single ticket yourself fills it, forces a compaction, and degrades every brief and triage after it. Two moments invite the exception and both are the signal to spawn: a ticket small enough to seem not worth spawning, and a ticket in the repository you are already sitting in.

A ticket that seems undelegatable means its brief is missing a fact only you hold, or the ticket is underspecified. Fix the brief, or hand it back.

**Work from the directory the session started in, throughout.** Teammates enter worktrees; you read them from where you stand. Reaching another tree is an argument, not a move: `git -C <absolute path>`, and absolute paths in tool calls. A working directory that has drifted into a teammate's tree reads exactly like home, and the branch you switch there lands under whoever is building in it.

## Refer to tickets by name

"Rename a saved filter", with its number riding inside. A wall of `#413, #414, #417` carries nothing you can reason about, which is why every command prints titles.

## When to use it

For a set of tickets with blocking edges between them, or to resume one a previous session started. For a single ticket with nothing depending on it, run `implement` directly and skip the ceremony.

Tickets that arrive without native blocking links never finished `/to-tickets`. Hand them back rather than inventing a graph nobody approved.
