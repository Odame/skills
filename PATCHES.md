# Local patches

This fork tracks [`mattpocock/skills`](https://github.com/mattpocock/skills) and
carries the divergences below. Each row is a content shape,
checked by [`scripts/verify-patches.mjs`](./scripts/verify-patches.mjs)
against present/absent marker strings, not a commit count: a divergence can
land as several commits over time, and a merge from upstream can undo one
inside a conflict resolution without touching any of those commits.

| What                                                                                                                                             | Divergence                                                                                                                    | Why                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`productivity/grilling`](./skills/productivity/grilling/SKILL.md)                                                                               | Puts the frontier to the user one question at a time, through the native ask-user-question tool, instead of a numbered batch. | A batch asks for several decisions at once, so the later answers are given before the earlier ones have reshaped the design tree. `grill-me` and `grill-with-docs` both delegate here, so this one file covers every entry point.                                                                    |
| [`engineering/implement`](./skills/engineering/implement/SKILL.md), [`engineering/implement-spec`](./skills/engineering/implement-spec/SKILL.md) | Call `odame-skills:code-review` by its plugin name, where upstream says plain `code-review`.                                  | Claude Code has a built-in `code-review` skill that hunts for bugs only. The plain name can reach it instead of the two-axis review (Standards and Spec) these skills expect.                                                                                                                        |
| `.changeset/config.json`, `package.json`                                                                                                         | Point at this fork rather than upstream.                                                                                      | Releases are cut here, so the generated changelog must cite this repo's pull requests and commits. Pointed at upstream, every entry would link to a pull request that produced something else.                                                                                                       |
| `.gitignore`                                                                                                                                     | Ignores `.claude/*` with `!.claude/skills/` re-included, instead of ignoring `.claude` whole.                                 | Upstream ignores the whole directory, which would silently drop [`sync-upstream`](./.claude/skills/sync-upstream/SKILL.md) from every commit. A bare `.claude` entry stops git descending, so a negation inside it never applies; the contents must be ignored instead. Local settings stay ignored. |
| `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`, `package.json`                                                                  | Marketplace named `odame`, not `mattpocock`; plugin renamed `odame-skills`.                                                   | Two marketplaces cannot share a name, and one called `mattpocock` that serves this fork would misreport where the skills came from. Renaming the plugin too keeps the install id consistent with the marketplace id; skill and slash-command names are untouched, so nothing Matt documents changes. |

## Pulling upstream

Ask any agent working in this repo to sync with upstream; it loads
[`.claude/skills/sync-upstream`](./.claude/skills/sync-upstream/SKILL.md). By hand:

```bash
git fetch --multiple origin upstream
git switch -c chore/update-from-upstream origin/main
git merge --no-ff upstream/main
node scripts/verify-patches.mjs   # expects: PATCHES OK
claude plugin validate . --strict
git push -u origin chore/update-from-upstream
gh pr create --base main && gh pr merge --merge
```

Merge, never rebase: releases are cut from `main`, and a rebase would push every
published tag out of its history. Land the pull request with a merge commit, not
squash or rebase-merge, so Matt's commits keep their SHAs. Upstream changesets
name `"mattpocock-skills"`; rename each to `"odame-skills"` or the release job
fails.

Resolve conflicts by intent, not by side: take upstream's rewritten wording as
the base, then restate the divergence in it. `verify-patches.mjs` checks every
divergence in both directions, so a merge that silently reverts one turns red
rather than passing.

## Retiring a divergence

A divergence exists to be deleted. When upstream's version does the same job,
take it whole and remove the row here **and** its entry in
`scripts/verify-patches.mjs`. A fork that only grows is a fork nobody keeps in sync.
