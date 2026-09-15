---
name: implement-with-agent-team
description: Build a set of tickets in parallel with one fresh teammate each, as far as their blocking edges allow.
disable-model-invocation: true
---

You are the **lead**: you dispatch, verify and merge. Teammates write the code.

## Where you work

One run, one repo. Stay in the directory the session started in, on the integration branch (or `--base` branch), for the whole run: that directory is `<lead dir>` in every command below. Every ticket this run dispatches must live in `<lead dir>`'s repo. Teammates write the code, each in its own worktree via `isolation: "worktree"`. That worktree comes from `<lead dir>`'s repo and cannot reach a different one. Reach another tree as an argument: `git -C <absolute path>`, and absolute paths in tool calls.

An epic spanning more than one repo runs once per repo: repeat the whole loop from each repo's own checkout, scoping every command with `--repo <owner/repo>`. Blocking edges still resolve across runs: a ticket's status comes from GitHub's issue graph, not local git, so a run in one repo still sees a blocker in another repo close.

Refer to tickets by name.

Resolve the tool once and keep the variable for the session:

```bash
T=$(find ~/.claude -path '*implement-with-agent-team/scripts/tickets.mjs' -not -path '*/node_modules/*' | head -1)
node $T --help
```

## Start

```bash
node $T preflight --epic <id> --repo <owner/repo>
```

`--repo` must match `<lead dir>`: it scopes every command in this run to that repo's tickets. Resolve everything preflight reports before dispatching. No `--base` given: this creates the epic's integration branch in this run's repo. See **Landing**.

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
| `BUILDING` | Nudge it, every pass (**Resuming a teammate**): a past reply proves nothing about now |
| `REVIEW`   | Verify and merge it       |
| `BLOCKED`  | Leave it; it frees itself |
| `STUCK`    | Report it and carry on    |
| `DONE`     | Leave it                  |

## Dispatch

One teammate, one ticket. Spawn every ticket, including one that looks too small to spawn and one in the repository you are already sitting in. Where a ticket seems undelegatable, add the missing fact to its prompt, or hand it back.

The prompt is fixed: fill the blanks, never rewrite it. It starts with the skill invocation itself, so it fires without depending on the teammate's own judgement to call it.

```
/odame-skills:implement <owner/repo>#<number>

Branch: <branch>, onto <base>
Base off the CURRENT tip of `origin/<base>`, not a stale local copy: other tickets merge into it while you build.

Any sub-agent you launch, for any step, can stall. Watch it: don't wait on one indefinitely. `TaskStop` it. Then recover the step the way its own purpose demands. Relaunch a fresh sub-agent if it needed a separate context, an independent review, for instance. Finish it yourself only if it didn't. When the lead pings you, re-check every sub-agent you still have running before you reply, and report what that check just found, not what you last assumed.

Commit as you go. Push once, right before opening the PR: a push per commit reruns the pre-push hook every time for nothing.

Open a PR when green, with `Closes #<number>` in the body.

Return:
- The PR number.
- What you ran, and its counts.
- The code-review output, verbatim.
- One fix-or-refute-with-evidence line per finding.

Where a rule in the ticket is wrong or impossible, say so with evidence.
```

```
Agent(
  name: "tkt-1126",
  model: "sonnet",
  isolation: "worktree",
  prompt: <the fixed prompt above, blanks filled>
)
```

`isolation: "worktree"` is mandatory: it does not clean up after itself once a teammate makes changes (it will). The result carries the worktree's path and branch. **Retire** it once the ticket resolves:

```bash
git -C <lead dir> worktree remove <path>
git -C <lead dir> worktree prune
```

See **On return**, **When a ticket stops**, and **A stalled teammate** for when to retire and what else goes with it.

## Resuming a teammate

Resume an idle teammate with `SendMessage(to: "tkt-1126", ...)`, never a second `Agent` call with that name: the second call spawns a duplicate into the same worktree instead of resuming.

The prompt requires every teammate to re-check its own sub-agents before answering a ping. Trust a reply only if it reports what that fresh check found, never a status repeated from memory. No reply, or one that cannot produce that, past how long that kind of step normally takes (a review finishing in hours, not minutes): see **A stalled teammate**.

## A stalled teammate

A teammate can freeze mid-turn for any reason. The trigger to check is elapsed time past the normal range for whatever it's doing. Transcript growth alone does not clear it: a stalled process can still emit trivial keep-alive activity (a no-op `Bash: true`, seen in practice) that keeps the transcript growing while nothing real happens. Once triggered, read the transcript's actual content, not just whether it moved. Whether it has a free turn to notice this itself varies; do not assume either way.

Check first whether it launched a sub-agent of its own, for any reason: that sub-agent is a likely cause (`odame-skills:code-review`'s standards/spec reviewers are one observed case, not the only possible one). Run `ListAgents`, find the child by its `joined` time (the name's shape varies by run and by what spawned it; read the roster, never match a fixed string), and `TaskStop` it. This frees the teammate's own `Agent` call but does not guarantee it resumes, so give it a couple more pings.

Still stuck after that, do not guess that it is gone. Confirm it: `TaskStop` the teammate itself, `task_id` its bare name (e.g. `tkt-1126`). Only once that returns success is it actually dead.

Never touch a teammate's worktree before that confirmation. A live process writing into a worktree the lead just deleted, or a second teammate racing it on the same branch, is worse than waiting longer.

Once confirmed dead, retire its worktree (**Dispatch**) and re-dispatch fresh: `node $T claim --ticket <id> --model <model> --redispatch`, then a new `Agent` call like any other ticket. Give it a new name; never reuse a name once dispatched. Its commits are already on the branch, so the new teammate picks up from there. Never write the ticket's code yourself.

## On return

```bash
node $T check-pr --ticket <id>              # resolve everything it reports first
node $T return --ticket <id> --pr <number>
gh pr merge <number> --repo <repo> --squash --delete-branch
node $T check-merged --ticket <id>
```

Triage the `code-review` output the teammate returned. Where triage turns something up, spawn an independent reviewer and give it the exact command:

```bash
git -C <absolute worktree path> diff <base>...<branch>
```

Once `check-merged` passes, sync and tear down: pull the merge into the lead's own checkout, retire the teammate's worktree (**Dispatch**), and drop the now-dead local branch (`--delete-branch` above already dropped the remote one).

```bash
git -C <lead dir> pull --ff-only
git -C <lead dir> branch -D <branch>
```

`<path>` and `<branch>` are what the ticket's `Agent` call returned at dispatch. On a resumed run where that is gone, recover `<path>` from `git -C <lead dir> worktree list --porcelain` by matching `<branch>` to the ticket's branch. A merged ticket leaves nothing behind: no worktree, no local branch, no remote branch.

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

Either way, the teammate's `Agent` call has ended: retire its worktree (**Dispatch**) so the next dispatch cannot collide with it.

Leave the branch alone. Its commits are the only copy of that work until the ticket is reclaimed and merged, at which point **On return**'s cleanup deletes it.

## Landing

By default a run lands on `epic/<number>-<slug>`, an integration branch `preflight` names after the epic and creates if it does not exist. Every ticket's PR targets it, not `main`, so merge each one same as any other on-return step, no approval needed: it is not shared history yet. Close each ticket by hand once its PR is merged (a merge into an integration branch does not close it), and open, never merge, the final PR from `epic/<number>-<slug>` into `main` once the frontier reports the run finished. An epic spanning more than one repo gets one `epic/<number>-<slug>` branch and one final PR per repo, each from that repo's own run.

Pass `--base <branch>` to `preflight` and `claim` to land somewhere else instead: an existing branch, or a new one you name. Creates it if it doesn't exist yet, same as the epic default. Pass your repo's actual default branch (e.g. `--base main`) to skip an integration branch entirely: tickets then close on merge, and there is no final PR to open.

A `--tickets` run with no `--epic` has no epic to name a branch after: `--base` is required.

## Staying awake

```
Monitor(command: "node $T watch --epic <id>", description: "<epic name> tickets", timeout_ms: 3600000)
```

## Models

State the model on every spawn. Use `sonnet`. Choose `opus` where the ticket needs judgment no spec can pre-make, and say why as you choose it. Report the split at the end.

