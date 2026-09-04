# Replace `ban-term`/`unban-term` written instructions with tested `ban_term`/`unban_term` functions

`skills/ban-term/SKILL.md` and `skills/unban-term/SKILL.md` used to instruct an
agent, in plain sentences, to hand-edit `banned-words.txt` and `config.toml`'s
allowlist arrays: case-insensitive matching, `#`-comment preservation, TOML array
editing. Every one of those rules already existed as tested code
(`wordlist.parse_wordlist`, `config._string_tuple`), so the written instructions were
a second, untested copy of the same rules, running as an LLM literally reading and
rewriting text files with no shared function keeping the two in sync. Filed as
[claude-code-toolbox#15](https://github.com/Odame/claude-code-toolbox/issues/15).

## Decision

Added `term_editor.py`: `ban_term(term)` appends to the wordlist unless an
equal-ignoring-case entry exists; `unban_term(term)` removes it from the wordlist and
adds it to both the `wordfreq` and `idiom` allowlists, reporting all three outcomes.
Both normalize the term the same way the original instructions specified (strip quotes,
trim, lowercase). Two thin `cli.py` subcommands, `ban` and `unban`, wrap them; the
two `SKILL.md` files shrink to the trigger description plus running that subcommand
and relaying its printed output.

The wordlist edit reads and rewrites the file as plain text, keeping every other
line's exact bytes (comments included) untouched via `str.splitlines(keepends=True)`.
The config edit needed a different tool: `config.py`'s `load_config` uses stdlib
`tomllib`, which is read-only and does not preserve comments or formatting on a
round trip, fine for a defensive best-effort read but not for a write path that
must not corrupt the comments the seed config ships with. `term_editor.py` adds
`tomlkit` (parse, mutate, dump) as a new runtime dependency for that reason, and
its write path finishes by calling the already-tested `load_config` (stdlib
`tomllib`) on the file it just wrote, raising rather than silently reporting
success if the term doesn't parse back out.

## Consequence

An agent following either skill now runs one command and relays its output, instead
of re-deriving the matching/parsing rules from written instructions on every invocation. The
matching, parsing, and TOML-editing rules live in exactly one place, covered by
`tests/test_term_editor.py` (new-entry, already-present, comment/setting
preservation, missing-file, and duplicate-allowlist-entry cases) instead of running
untested.
