---
name: sync-upstream
description: Merge mattpocock/skills into this fork and prove every local divergence survived. Use when asked to sync, update from upstream, or pull in Matt's latest skills.
---

This repo is a fork. It carries a short list of deliberate divergences from
`mattpocock/skills`, each recorded in [PATCHES.md](../../../PATCHES.md). A sync
can drop one silently: git reports success, the skill quietly returns to
upstream's wording, and nothing says so. The job here is the merge **and** the
proof.

## Why merge, not rebase

Releases are cut from this fork's `main`, and their tags must stay in its
history. A rebase rewrites every fork commit, so each published tag falls off
`main`; landing a rebased branch through a pull request is worse, because it
replays the fork's commits on top of themselves and conflicts. A merge only adds
to history and keeps Matt's commits under their own SHAs, so GitHub reports the
fork as level with upstream.

## Sync

Work on a branch cut from `origin/main`, never on `main` itself.

```bash
git fetch --multiple origin upstream
git switch -c chore/update-from-upstream origin/main
git merge --no-ff upstream/main
```

Resolve each conflict by **intent, not by side**. Take upstream's rewritten text
as the base, then restate the divergence in Matt's new wording. Choosing "ours"
wholesale reverts his improvements to the rest of the file; choosing "theirs"
drops the divergence. Neither is the answer.

If a conflict is large, invoke `/resolving-merge-conflicts`.

## Rename the package in upstream changesets

Upstream's changesets name `"mattpocock-skills"`. This fork's package is
`odame-skills`, and Changesets aborts on a package it cannot find, so the release
job fails on the next push to `main`. Point every new changeset at this fork's
package, in its own commit:

```bash
grep -l '"mattpocock-skills"' .changeset/*.md
```

## Retire a divergence that upstream has adopted

A divergence exists to be deleted. When Matt's new version already does what the
divergence did, **drop it**: take upstream's text whole, remove its row from
`PATCHES.md`, and remove its entry from `scripts/verify-patches.mjs`. A fork that
only grows is a fork nobody keeps in sync.

## Prove it

All three must pass before pushing. None is optional; the first is the only thing
standing between a silent revert and a working skill.

```bash
node scripts/verify-patches.mjs   # expects: PATCHES OK
claude plugin validate . --strict
npx @changesets/cli status --since=origin/main   # expects: odame-skills to be bumped
```

`verify-patches.mjs` checks each divergence in both directions: that its text is
present, and that upstream's superseded text has not come back. It exits non-zero
and names every loss. Do not push while it is red, and do not weaken an entry to
make it green: fix the file, or retire the divergence deliberately as above.

If this sync is running under an `unlazy` ledger, that script is the gate:

```markdown
- [ ] G1: every recorded divergence survived the merge
  CHECK: node scripts/verify-patches.mjs
  EXPECT: PATCHES OK
  EVIDENCE: pending
```

## Publish

Open a pull request into `main` and land it with **Create a merge commit**.
Squash or rebase-merge would copy Matt's commits under new SHAs, so the next sync
would meet them again as conflicts.

```bash
git push -u origin chore/update-from-upstream
gh pr create --base main
gh pr merge --merge
claude plugin update odame-skills@odame
```

Report what actually changed: which upstream commits arrived, which divergences
needed re-applying, and any that were retired.
