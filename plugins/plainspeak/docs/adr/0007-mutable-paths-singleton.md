# Replace 3 independent path constants with one mutable `LIVE_PATHS` singleton

`wordlist.py`, `config.py`, and `tracking.py` each computed their own live filesystem
path at import time (`LIVE_WORDLIST_PATH`, `LIVE_CONFIG_PATH`, `TRACKING_DATABASE_PATH`).
`config.py`'s path derived from `wordlist.py`'s, but `tracking.py` recomputed the
same `.claude/plain-english-checker` base directory independently: nothing enforced
that the three stayed in the same place. Every module that read one of these
constants directly, rather than through `cli.py`, was also a silent test-isolation
gap: `tests/test_cli.py` patched `cli`'s imported references, so a module bypassing
`cli` (as `banned_word_check.py`, `wordfreq_check.py`, `textstat_check.py`, and
`idiom_check.py` all did) could read the real `~/.claude/...` path during a test run
without any test failing to say so.

Filed as [claude-code-toolbox#14](https://github.com/Odame/claude-code-toolbox/issues/14).

## Decision

Added `paths.py`: a `PluginPaths` dataclass with one field, `base_directory`, and
three properties (`wordlist_path`, `config_path`, `tracking_database_path`) computed
from it. `LIVE_PATHS` is the one shared instance every module imports. Every prior
consumer of the three constants now reads `LIVE_PATHS.<name>` instead. This makes
the "one shared directory" invariant structural rather than conventional: there is
exactly one field the three paths can diverge from, so they cannot diverge.

Path lookups are properties, not fields snapshotted at construction, and
`ban_term`/`unban_term` (see `0008`) resolve their path defaults inside the function
body rather than as a parameter default, for the same reason: a snapshot taken once,
at import or definition time, stops tracking `base_directory` after a test (or a
future caller) points it elsewhere.

## Consequence

`tests/test_cli.py` collapses its three separate fixtures into one autouse
`live_paths` fixture that patches `LIVE_PATHS.base_directory`; `wordlist_path`,
`tracking_database_path`, and `config_path` remain as thin fixtures returning
`live_paths.<name>`, kept under their original names since ~35 existing tests
reference them directly. A test needing one path to diverge from the shared
directory (the unwritable-tracking-store test) makes `base_directory` itself
unwritable rather than patching a single path in isolation, since the properties
have no independent setter to patch.
