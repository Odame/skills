---
"odame-skills": minor
---

Adds `plainspeak` as a second, opt-in plugin in this repo's marketplace, ported from [Odame/claude-code-toolbox](https://github.com/Odame/claude-code-toolbox) (now archived), where it was named `plain-english-checker`. It's a `PostToolUse` hook that blocks banned jargon on Write/Edit, warns on uncommon words, hard-to-read sentences, and idioms, and two skills (`ban-term`, `unban-term`) that grow and shrink the ban list from conversation.

It ships as its own plugin rather than folded into `odame-skills`, because its hook fires on every Write/Edit/MultiEdit in any project where it's installed: bundling it would force that check on every `odame-skills` user, whether they want writing-style checks or not. Install it separately: `claude plugin install plainspeak@odame`.

While porting, each check module (`wordfreq`, `textstat`, `idiom`) now imports lazily, gated on its own `config.toml` `enabled` flag, instead of unconditionally on every hook invocation. `wordfreq` and `textstat` load real corpus data on import; a disabled check was already skipped when producing findings, but paid the full import cost regardless. Measured locally: ~380ms per `check` invocation with all three enabled (the shipped default), ~110ms with all three disabled. See `plugins/plainspeak/docs/adr/0006-lazy-import-of-corpus-backed-checks.md`.

Also implements two RFCs that were filed against the original repo and never built there: the three independent live-path constants collapse into one mutable `PluginPaths` singleton (`paths.py`, ADR-0007), and `ban-term`/`unban-term` no longer describe file edits in English for an agent to carry out by hand; they now invoke tested `ban_term`/`unban_term` functions through new `ban`/`unban` CLI subcommands (`term_editor.py`, ADR-0008).

The name changed; where it stores your data did not. `~/.claude/plain-english-checker/` (wordlist, config, tracking database) stays exactly where it was, so an existing install carries its banned-term list and config forward untouched. Only the plugin/package/CLI-command identity is `plainspeak` now.
