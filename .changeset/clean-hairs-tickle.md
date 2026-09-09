---
"odame-skills": patch
---

`implement-with-agent-team` now scopes each run to one repo, matching how its worktree-based dispatch actually works. `isolation: "worktree"` can only worktree the repo the lead session started in. A ticket in a different repo could never actually be built by it, despite `preflight` supporting multi-repo epics.

- **Where you work** states the rule directly: one run, one repo, every ticket it dispatches must live in `<lead dir>`'s repo. An epic spanning more than one repo now runs once per repo, each from that repo's own checkout, scoped with `--repo <owner/repo>`.
- Notes that blocking edges still resolve across those separate runs, since a ticket's status comes from GitHub's issue graph, not local git.
- **Start**'s `preflight` example now scopes with `--repo`, matched to `<lead dir>`.
- **Landing** now says a multi-repo epic gets one `epic/<number>-<slug>` branch and one final PR per repo, each from that repo's own run.
