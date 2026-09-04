# Plainspeak development

## Overview

A self-contained Claude Code plugin: a `PostToolUse` hook that checks newly written
text against a banned-word list, word-frequency rarity, sentence readability, and a
bundled idiom list, plus two skills (`ban-term`, `unban-term`) that grow and shrink
the banned-word list from conversation. Ported from
[Odame/claude-code-toolbox](https://github.com/Odame/claude-code-toolbox); see the
root `README.md`'s Plugins section for how it's installed from this repo.

It is a member of this repo's root `uv` workspace (`[tool.uv.workspace]` in the root
`pyproject.toml`), but otherwise self-contained: its own `pyproject.toml`, its own
`hooks/hooks.json`, its own tests.

## Commands

Run from the repo root:

- Install/sync: `uv sync --all-packages`
- Lint: `uv run ruff check plugins/plainspeak`
- Format check: `uv run ruff format --check plugins/plainspeak`
- Test: `uv run pytest plugins/plainspeak`
- Test a single test: `uv run pytest plugins/plainspeak/tests/test_file.py::test_name`

Before considering a change done: `pytest` passes, `ruff check` and
`ruff format --check` pass clean, and `git status` shows nothing gitignore-worthy
staged.

## Domain terms

See `CONTEXT.md` in this directory (Check, Block, Warn, Wordlist, Allowlist).

## Design decisions

See `docs/adr/` in this directory. Notably `0006` on why each check module is
imported lazily, gated on its own `config.toml` `enabled` flag, rather than as an
unconditional side effect of importing the package.
