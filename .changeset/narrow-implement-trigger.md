---
"odame-skills": patch
---

Narrow `implement`'s auto-fire trigger and give `grill-with-docs` an explicit closing step, so a grilling session stops at `/to-spec` instead of drifting into `implement`.

- `implement`'s description dropped "handed a spec or ticket to build", a branch broad enough to match any plan just settled in conversation, including one `grill-with-docs` had just settled. It now reads "once a written spec or ticket already exists to build from". The teammate-briefing branch `implement-with-agent-team` depends on is untouched.
- Fixed `implement/agents/openai.yaml`, which still carried `policy.allow_implicit_invocation: false` from before `implement` went model-invoked: Codex was blocking implicit invocation the whole time while Claude Code allowed it.
- `grill-with-docs` now ends every session by naming its own next step, per `grill-with-docs → to-spec → to-tickets → implement → code-review`, instead of leaving the close open-ended.
- Re-synced `docs/engineering/grill-with-docs.md`'s "What should I do when the session ends?" answer, which described the open-ended close as a known rough edge; it now states the fix.
