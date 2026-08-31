## What it does

Takes a set of tickets that already carry their own specs and builds them, one fresh [subagent](https://www.aihero.dev/ai-coding-dictionary/subagent) per ticket, running as many at once as the tickets' blocking edges allow. You stay the lead: you dispatch, you verify what comes back, you merge.

It stores nothing of its own. The graph is the tickets' native blocked-by links, progress is open versus closed, and a merged PR closes its ticket, so every command re-reads the tracker rather than a ledger it keeps on the side. That is what makes a dropped teammate notification survivable: the run re-reads and carries on, where a private ledger would have to be reconciled against git and the tracker before anyone could trust it again.

## When to reach for it

You invoke this by typing `/implement-with-agent-team`, and the agent won't reach for it on its own.

| Your situation | Reach for |
|---|---|
| Several tickets, with blocking edges between them | this skill |
| One ticket, nothing depending on it | [implement](https://aihero.dev/skills-implement) |
| Tickets that don't exist yet | [to-tickets](https://aihero.dev/skills-to-tickets) first |
| A shape too foggy to slice into tickets at all | [wayfinder](https://aihero.dev/skills-wayfinder) first |

## Prerequisites

The tickets must live on a real issue tracker and declare their dependencies as **native blocking links**, because those links are the graph. A set that arrives without them never finished `to-tickets`, and the skill hands it back rather than inventing an order nobody approved. `gh` must be authenticated for every repository the tickets live in; an epic whose tickets span several repositories works, and can be narrowed to one.

## The frontier

The **frontier** is every open ticket whose blockers have all closed: what is takeable right now. It is a command rather than something the lead remembers, so it survives a compaction and reads the same for any session that asks.

Work is dispatched a frontier at a time, not a round at a time. A ticket starts the moment its own blockers land, rather than waiting for whatever else happened to be dispatched alongside it, and that idle time is what compounds across a long chain.

One consequence is worth knowing, because it removes a whole category of work: since a ticket only starts once its blockers have merged, the base branch already contains them. Every teammate branches off it, nothing is stacked on anything, and no rebase chain has to be landed at the end.

## Verification is a command, not a judgement

A teammate's report is its own account of its own work. Rather than reading it and forming a view, the lead runs a check that reads the pull request itself: whether it closes the ticket, what it targets, whether it has commits, whether it is green and mergeable. A second check, after the merge, confirms the ticket actually closed. That one sounds like ceremony and is not: a merge that leaves its ticket open frees nothing downstream, and the run would circle a frontier that never advances.

The same applies when a build stops. The question is not what went wrong but what would unblock it, and the two answers behave differently:

- **A dependency the graph was missing** is recorded as a real blocking link, and the ticket frees itself when that blocker lands. Nobody is waiting on anyone.
- **A ticket nothing available can move** is reported as stuck, and the run continues without it.

Most stops are the first kind. Treating them all as the second is how a run quietly parks half its work.

## Common questions

**Why not keep a state file, so a crashed run can pick up where it left off?**

Because that file becomes a third thing to trust, alongside git and the tracker, and the three drift. Everything a ledger would hold is already on the tracker, so a resumed run reads it and continues. There is nothing to reconcile because there is nothing to disagree with.

**What happens when a teammate's completion notification goes missing?**

Nothing is lost. The next read of the frontier sees the pull request and moves the ticket along. What can happen is that the run sits idle waiting for news that never comes, so the skill also emits a change feed that reports each ticket as it moves, including a teammate that went quiet without ever opening a pull request.

**Won't every teammate cost as much as the lead?**

Only if a spawn forgets to say otherwise. The `model` parameter is optional and inherits the lead's, and a specced ticket rarely needs the expensive one. A guard refuses any teammate spawn that has not named its model, so the omission fails loudly instead of quietly costing several times more.

## It's working if

- Two tickets that share a blocker start together the moment it merges, rather than one waiting for the other to finish.
- A ticket that came back with a broken pull request is caught before you merge it, not after.
- Closing your laptop mid-run costs you nothing: the next session reads the tracker and carries on.
- Every ticket that stopped tells you what would unblock it, and most of them unblock themselves.

## Where it fits

A **chain step**, at the same point as [implement](https://aihero.dev/skills-implement) and in place of it: `grill-with-docs → to-spec → to-tickets → implement-with-agent-team → code-review`. It replaces the loop of running [implement](https://aihero.dev/skills-implement) per ticket and clearing between each one, which is the right thing for a single ticket and the slow thing for twenty.

Its immediate neighbour upstream is [to-tickets](https://aihero.dev/skills-to-tickets), because the blocking edges it writes are the graph this skill dispatches against. Downstream, each teammate runs [implement](https://aihero.dev/skills-implement) itself, which ends in [code-review](https://aihero.dev/skills-code-review), so the review happens once per ticket rather than once at the end.

For the whole map, see [ask-matt](https://aihero.dev/skills-ask-matt).
