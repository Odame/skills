---
"odame-skills": minor
---

Return **`implement`** to upstream's version. It is user-invoked again (type `/implement`), and it no longer writes an `unlazy` `GATES.md` ledger. Both divergences are retired: the teammate that needed to reach it on its own went with `implement-with-agent-team`. `implement` and `implement-spec` now call `odame-skills:code-review` by its plugin name, so they never reach Claude Code's built-in `code-review` skill by mistake.
