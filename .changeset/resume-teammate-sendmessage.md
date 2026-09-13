---
"odame-skills": patch
---

fix(implement-with-agent-team): resume an idle teammate with `SendMessage`. Never call `Agent` again with the same name. That spawns a duplicate into the shared worktree.
