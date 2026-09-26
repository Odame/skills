"""Console-script entry point for the plainspeak hook."""

import json
import sqlite3
import sys
from collections.abc import Iterable
from importlib import resources
from pathlib import Path

from plainspeak.checks import Severity, emit_findings, run_checks
from plainspeak.config import load_config
from plainspeak.hook_payload import changed_text_segments, session_id_of
from plainspeak.paths import LIVE_PATHS
from plainspeak.tracking import BLOCK_OUTCOME, NO_TERM, WARN_OUTCOME, record_outcome
from plainspeak.wordlist import load_wordlist

SEED_WORDLIST_RESOURCE = "seed_wordlist.txt"
SEED_CONFIG_RESOURCE = "seed_config.toml"
POST_TOOL_USE_EVENT_NAME = "PostToolUse"


def _record_outcome_without_failing_the_check(
    payload: dict, check_name: str, outcome: str, term: str
) -> None:
    """Tracking is a usage signal, so a broken store must never change a check's outcome."""
    try:
        record_outcome(
            LIVE_PATHS.tracking_database_path,
            session_id=session_id_of(payload),
            check_name=check_name,
            outcome=outcome,
            term=term,
        )
    except (sqlite3.Error, OSError):
        pass


def check(argv: list[str]) -> int:
    """Read a PostToolUse hook payload from stdin, then warn on stdout and block on stderr.

    A warn and a block can both fire on one edit. The warn is still delivered as
    `additionalContext` on stdout, and the block's exit code 2 wins (see docs/adr/0002).
    """
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0

    segments = changed_text_segments(payload)
    if not segments:
        return 0

    written_text = "\n".join(segments)
    settings = load_config(LIVE_PATHS.config_path)
    _import_enabled_checks(settings)

    findings = run_checks(written_text, settings)
    for finding in findings:
        outcome = BLOCK_OUTCOME if finding.severity is Severity.BLOCK else WARN_OUTCOME
        for term in finding.terms or (NO_TERM,):
            _record_outcome_without_failing_the_check(payload, finding.check_name, outcome, term)

    return emit_findings(findings, additional_context_output=_additional_context_output)


def _import_enabled_checks(settings) -> None:
    """Import each check module only when its config calls for it.

    A module registers itself with `checks.CHECKS` as a side effect of import (see
    `checks.py`). `wordfreq` and `textstat` load real corpus data on import, so a
    disabled check, or one never turned on, must not pay for that load on every
    Write/Edit/MultiEdit. The banned-word check has no `enabled` flag of its own
    (see `banned_word_check.py`), so it always imports.
    """
    from plainspeak import banned_word_check  # noqa: F401

    if settings.wordfreq.enabled:
        from plainspeak import wordfreq_check  # noqa: F401
    if settings.textstat.enabled:
        from plainspeak import textstat_check  # noqa: F401
    if settings.idiom.enabled:
        from plainspeak import idiom_check  # noqa: F401


def _additional_context_output(finding: str) -> dict:
    return {
        "continue": True,
        "hookSpecificOutput": {
            "hookEventName": POST_TOOL_USE_EVENT_NAME,
            "additionalContext": finding,
        },
    }


def ban(argv: list[str]) -> int:
    """Add a term to the banned wordlist, from an agent following the `ban-term` skill."""
    if not argv:
        print("usage: plainspeak ban <term>", file=sys.stderr)
        return 1
    from plainspeak import term_editor

    result = term_editor.ban_term(" ".join(argv))
    if result.wordlist_changed:
        print(f"'{result.term}' is now banned.")
    else:
        print(f"'{result.term}' was already banned.")
    return 0


def unban(argv: list[str]) -> int:
    """Remove a term everywhere it's flagged, from an agent following the `unban-term` skill."""
    if not argv:
        print("usage: plainspeak unban <term>", file=sys.stderr)
        return 1
    from plainspeak import term_editor

    result = term_editor.unban_term(" ".join(argv))
    print(f"wordlist: {'removed' if result.wordlist_changed else 'was not banned'}")
    print(
        f"wordfreq allowlist: {'added' if result.wordfreq_allowlist_changed else 'already there'}"
    )
    print(f"idiom allowlist: {'added' if result.idiom_allowlist_changed else 'already there'}")
    return 0


def seed(argv: list[str]) -> int:
    """Copy the seed wordlist and seed config to their live paths, never clobbering."""
    _copy_seed_file(LIVE_PATHS.wordlist_path, SEED_WORDLIST_RESOURCE)
    _copy_seed_file(LIVE_PATHS.config_path, SEED_CONFIG_RESOURCE)
    return 0


def _copy_seed_file(live_path: Path, resource_name: str) -> None:
    if live_path.exists():
        return
    live_path.parent.mkdir(parents=True, exist_ok=True)
    seed_text = resources.files("plainspeak").joinpath(resource_name).read_text(encoding="utf-8")
    live_path.write_text(seed_text, encoding="utf-8")


def list_terms(argv: list[str]) -> int:
    """Print every term list plainspeak matches against, so no file needs opening by hand."""
    from plainspeak import idiom_check

    settings = load_config(LIVE_PATHS.config_path)
    _print_term_list("banned words", load_wordlist(LIVE_PATHS.wordlist_path))
    _print_term_list("wordfreq allowlist", settings.wordfreq.allowlist)
    _print_term_list("idiom allowlist", settings.idiom.allowlist)
    _print_term_list("bundled idioms", idiom_check.bundled_idioms())
    return 0


def _print_term_list(label: str, terms: Iterable[str]) -> None:
    terms = list(terms)
    print(f"{label} ({len(terms)}):")
    for term in terms:
        print(f"  {term}")
    print()


def stats(argv: list[str]) -> int:
    """Print each check's block/warn totals, plus its top flagged terms where recorded."""
    from plainspeak.tracking import summarize

    summaries = summarize(LIVE_PATHS.tracking_database_path)
    if not summaries:
        print("no data recorded yet")
        return 0

    for summary in summaries:
        print(
            f"{summary.check_name} ({summary.outcome}): {summary.total} total since {summary.since}"
        )
        for term, count in summary.top_terms:
            print(f"  {term}  {count}")
        print()
    return 0


COMMANDS = {
    "check": check,
    "seed": seed,
    "ban": ban,
    "unban": unban,
    "list": list_terms,
    "stats": stats,
}

USAGE = f"usage: plainspeak {{{','.join(COMMANDS)}}} ..."

HELP_FLAGS = {"--help", "-h"}


def main() -> None:
    """Dispatch to a subcommand, printing usage instead of ever silently running `check`.

    `check` reads stdin and blocks waiting for it, so a typo'd or missing subcommand
    must never fall through to it: an interactive `plainspeak` or `plainspeak status`
    would otherwise hang instead of failing loudly.
    """
    argv = sys.argv[1:]
    if not argv or argv[0] in HELP_FLAGS:
        print(USAGE)
        sys.exit(0)

    command_name, remaining = argv[0], argv[1:]
    if command_name not in COMMANDS:
        print(f"plainspeak: unknown command '{command_name}'", file=sys.stderr)
        print(USAGE, file=sys.stderr)
        sys.exit(1)

    sys.exit(COMMANDS[command_name](remaining))


if __name__ == "__main__":
    main()
