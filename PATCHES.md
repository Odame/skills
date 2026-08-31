# Local patches

This fork tracks `mattpocock/skills` and carries a small set of deliberate
divergences. Each one is a single commit so `git rebase upstream/main` stays
mechanical.

| Skill | Divergence | Why |
|---|---|---|
| `productivity/grilling` | Puts the frontier to the user one question at a time through the native ask-user-question tool, rather than as a numbered batch. | A batched round asks for several decisions at once, so the later answers are given before the earlier ones have reshaped the tree. `grill-me` and `grill-with-docs` both delegate here, so this one file covers every entry point. |
| `engineering/implement` | Writes an acceptance ledger with the `unlazy` skill before coding, and re-verifies it before reporting the work complete. | Ticket acceptance criteria are already the gates. Holding them in a file rather than in context means they survive a compaction, and the `unlazy` Stop hook refuses to end the session while one is unmet. |

`unlazy` lives at <https://github.com/Leonxlnx/unlazy> and installs separately
into `~/.claude/skills/unlazy`; the `implement` patch names the skill rather
than a path, so it stays portable.

## Pulling upstream

```bash
git fetch upstream
git rebase upstream/main
```

Resolve conflicts in favour of upstream's surrounding prose, then re-apply the
divergence described above.
