---
"odame-skills": minor
---

Move **`implement-with-agent-team`** to `deprecated/`. Upstream's [`implement-spec`](https://github.com/Odame/skills/blob/main/skills/engineering/implement-spec/SKILL.md) now builds a whole spec in one run, so the fork's own version is no longer needed. It leaves the Claude Code plugin, the README, the `ask-matt` router and its docs page. Its teammate-model hook goes with it. The skill stays in the repo so it can come back.
