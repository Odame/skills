---
"odame-skills": minor
---

`implement-with-agent-team` now lands a run on an integration branch by default: `epic/<number>-<slug>`, named after the epic. It's created, in every repo the run touches, the first time it's needed. This replaces merging each ticket straight into `main`. Twenty tickets now land as one review at the end, not twenty scattered across the week. Merging a ticket's PR onto that branch needs no approval, since it isn't shared history yet. Only one final PR into `main` gets opened, never merged, for a human to review.

- `--base <branch>` still overrides: an existing or new branch, created if it doesn't exist. Pass the repo's own default branch to opt back into the old straight-to-`main` flow, where each PR closes its ticket on merge.
- `claim` derives the branch on its own from a ticket's parent epic, via GitHub's sub-issues `/parent` endpoint, so it needs no `--epic` flag of its own and stays a single-ticket command.
- A `--tickets` run with no `--epic` has no epic to name a branch after, so it now requires `--base` explicitly.
