# Import each check module lazily, gated on its own `enabled` flag

`wordfreq` pulls in `nltk` and loads compressed frequency data on import; `textstat`
carries its own syllable/readability tables. Both used to be imported unconditionally,
as a side effect of importing the `plain_english_checker` package itself
(`__init__.py` imported `wordfreq_check` and `textstat_check` alongside
`banned_word_check` and `idiom_check`, so every one of them registered with
`checks.CHECKS` on every CLI invocation).

That cost was paid on the `PostToolUse` hook for every Write/Edit/MultiEdit, and on
the `SessionStart` seed hook too, regardless of whether `config.toml` had
`[wordfreq].enabled` or `[textstat].enabled` set to `false`. A disabled check still
skipped emitting a finding (`checks.run_checks` checks `enabled` before calling
`detect`), but the interpreter had already paid for importing and initialising the
corpus-backed library first.

Measured on this machine: a `check` invocation with wordfreq/textstat/idiom all
enabled (the shipped default) took ~380ms; the same invocation with all three
disabled in `config.toml` (only the banned-word check, which has no corpus and no
`enabled` flag, left running) took ~110ms. The 270ms difference is import and
corpus-load time that a disabled check has no business paying, on a hook that fires
on every single file edit in a session.

## Decision

`cli.check` now calls `_import_enabled_checks(settings)` after loading config, and
that function imports each check module only when its corresponding `enabled` flag
is true. `banned_word_check` has no config toggle (see `banned_word_check.py`:
it's on whenever the wordlist has terms), so it always imports; it has no heavy
dependency, so this costs nothing. The package `__init__.py` no longer imports
anything: each check module registers itself with `checks.CHECKS` only when `cli`
actually imports it, not as a side effect of importing the package.

## Consequence

A check disabled in `config.toml`, or a fresh install running with only the
banned-word list populated, pays no `wordfreq`/`textstat` import cost at all. Turning
a check on costs exactly what it already cost to run that check when this hook
first imported it: nothing new was made lazy that wasn't already gated by `enabled`
at the `run_checks` level, only the earlier and larger cost of the import itself.
