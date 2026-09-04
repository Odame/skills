---
"odame-skills": minor
---

Adds `plain-english-checker` as a second, opt-in plugin in this repo's marketplace, ported from [Odame/claude-code-toolbox](https://github.com/Odame/claude-code-toolbox) (now archived). It's a `PostToolUse` hook that blocks banned jargon on Write/Edit, warns on uncommon words, hard-to-read sentences, and idioms, and two skills (`ban-term`, `unban-term`) that grow and shrink the ban list from conversation.

It ships as its own plugin rather than folded into `odame-skills`, because its hook fires on every Write/Edit/MultiEdit in any project where it's installed: bundling it would force that check on every `odame-skills` user, whether they want writing-style checks or not. Install it separately: `claude plugin install plain-english-checker@odame`.

While porting, each check module (`wordfreq`, `textstat`, `idiom`) now imports lazily, gated on its own `config.toml` `enabled` flag, instead of unconditionally on every hook invocation. `wordfreq` and `textstat` load real corpus data on import; a disabled check was already skipped when producing findings, but paid the full import cost regardless. Measured locally: ~380ms per `check` invocation with all three enabled (the shipped default), ~110ms with all three disabled. See `plugins/plain-english-checker/docs/adr/0006-lazy-import-of-corpus-backed-checks.md`.
