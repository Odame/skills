# Local patches

This fork tracks [`mattpocock/skills`](https://github.com/mattpocock/skills) and
carries the divergences below. Each is a single commit, so
`git rebase upstream/main` stays mechanical.

| What                                                                                               | Divergence                                                                                                                                                      | Why                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`productivity/grilling`](./skills/productivity/grilling/SKILL.md)                                 | Puts the frontier to the user one question at a time, through the native ask-user-question tool, instead of a numbered batch.                                   | A batch asks for several decisions at once, so the later answers are given before the earlier ones have reshaped the design tree. `grill-me` and `grill-with-docs` both delegate here, so this one file covers every entry point.                                                                                                                                          |
| [`engineering/implement`](./skills/engineering/implement/SKILL.md)                                 | Writes an acceptance ledger with the [`unlazy`](https://github.com/Leonxlnx/unlazy) skill before coding, and re-verifies it before reporting the work complete. | Ticket acceptance criteria are already the gates. Holding them in a file rather than in context means they survive a compaction, and unlazy's Stop hook refuses to end the session while one is unmet.                                                                                                                                                                     |
| [`engineering/implement`](./skills/engineering/implement/SKILL.md)                                 | Model-invocable, where upstream is user-invoked only.                                                                                                           | A teammate spawned to build one ticket has to reach it on its own. A user-invoked skill has no description, so nothing but a person can fire it. The cost is a description held in context every turn.                                                                                                                                                                     |
| [`engineering/implement-with-agent-team`](./skills/engineering/implement-with-agent-team/SKILL.md) | New skill, no upstream counterpart.                                                                                                                             | Builds a ticket set in parallel as far as the blocking edges allow, one fresh teammate per ticket. Keeps no state of its own: the tracker holds the graph, the progress and the completion. Its `scripts/tickets.mjs` owns every verification the lead would otherwise do by eye, and `SKILL.md` names those commands by what they achieve rather than how they record it. |
| `.changeset/config.json`, `package.json`                                                           | Point at this fork rather than upstream.                                                                                                                        | Releases are cut here, so the generated changelog must cite this repo's pull requests and commits. Pointed at upstream, every entry would link to a pull request that produced something else.                                                                                                                                                                             |
| `.gitignore`                                                                                       | Ignores `.claude/*` with `!.claude/skills/` re-included, instead of ignoring `.claude` whole.                                                                   | Upstream ignores the whole directory, which would silently drop [`sync-upstream`](./.claude/skills/sync-upstream/SKILL.md) from every commit. A bare `.claude` entry stops git descending, so a negation inside it never applies; the contents must be ignored instead. Local settings stay ignored.                                                                       |
| `.claude-plugin/marketplace.json`                                                                  | Marketplace named `odame`, not `mattpocock`.                                                                                                                    | Two marketplaces cannot share a name, and one called `mattpocock` that serves this fork would misreport where the skills came from. The plugin name stays `mattpocock-skills`, so no slash command changes.                                                                                                                                                                |

`unlazy` installs separately into `~/.claude/skills/unlazy`. The `implement`
patch names the skill rather than a path, so it stays portable.

## Pulling upstream

Ask any agent working in this repo to sync with upstream; it loads
[`.claude/skills/sync-upstream`](./.claude/skills/sync-upstream/SKILL.md). By hand:

```bash
git fetch upstream
git rebase upstream/main
node scripts/verify-patches.mjs   # expects: PATCHES OK
claude plugin validate . --strict
git push --force-with-lease origin main
```

Resolve conflicts by intent, not by side: take upstream's rewritten wording as
the base, then restate the divergence in it. `verify-patches.mjs` checks every
divergence in both directions, so a rebase that silently reverts one turns red
rather than passing.

## Retiring a divergence

A divergence exists to be deleted. When upstream's version does the same job,
take it whole and remove the row here **and** its entry in
`scripts/verify-patches.mjs`. A fork that only grows is a fork nobody rebases.
