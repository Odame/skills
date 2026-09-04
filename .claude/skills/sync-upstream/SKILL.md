---
name: sync-upstream
description: Rebase this fork onto mattpocock/skills and prove every local divergence survived. Use when asked to sync, rebase, or pull in Matt's latest skills.
---

This repo is a fork. It carries a short list of deliberate divergences from
`mattpocock/skills`, each recorded in [PATCHES.md](../../../PATCHES.md). A rebase
can drop one silently: git reports success, the skill quietly returns to
upstream's wording, and nothing says so. The job here is the rebase **and** the
proof.

## Sync

```bash
git fetch upstream
git rebase upstream/main
```

Resolve each conflict by **intent, not by side**. Take upstream's rewritten text
as the base, then restate the divergence in Matt's new wording. Choosing "ours"
wholesale reverts his improvements to the rest of the file; choosing "theirs"
drops the divergence. Neither is the answer.

If a conflict is large, invoke `/resolving-merge-conflicts`.

## Retire a divergence that upstream has adopted

A divergence exists to be deleted. When Matt's new version already does what the
divergence did, **drop it**: take upstream's text whole, remove its row from
`PATCHES.md`, and remove its entry from `scripts/verify-patches.mjs`. A fork that
only grows is a fork nobody rebases.

## Prove it

Both must pass before pushing. Neither is optional; the first is the only thing
standing between a silent revert and a working skill.

```bash
node scripts/verify-patches.mjs   # expects: PATCHES OK
claude plugin validate . --strict
```

`verify-patches.mjs` checks each divergence in both directions: that its text is
present, and that upstream's superseded text has not come back. It exits non-zero
and names every loss. Do not push while it is red, and do not weaken an entry to
make it green: fix the file, or retire the divergence deliberately as above.

If this sync is running under an `unlazy` ledger, that script is the gate:

```markdown
- [ ] G1: every recorded divergence survived the rebase
  CHECK: node scripts/verify-patches.mjs
  EXPECT: PATCHES OK
  EVIDENCE: pending
```

## Publish

```bash
git push --force-with-lease origin main
claude plugin update odame-skills@odame
```

`--force-with-lease`, never `--force`: the rebase rewrites history, and the lease
refuses if the remote moved under you.

Report what actually changed: which upstream commits arrived, which divergences
needed re-applying, and any that were retired.
