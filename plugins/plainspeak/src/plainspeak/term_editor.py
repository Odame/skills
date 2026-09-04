"""Banning and unbanning a term: the file edits `ban-term`/`unban-term` used to do by hand.

`ban_term`/`unban_term` take an optional path override for testing, but default to
`None` rather than snapshotting `LIVE_PATHS.wordlist_path` (etc.) as a parameter
default. A default value is computed once, at import time; resolving it inside the
function body instead means a test that points `LIVE_PATHS.base_directory` at a
`tmp_path` is respected on every call, not just the first one (see `paths.py`).
"""

from dataclasses import dataclass
from pathlib import Path

import tomlkit

from plainspeak.config import IDIOM_SECTION, WORDFREQ_SECTION, load_config
from plainspeak.paths import LIVE_PATHS
from plainspeak.wordlist import load_wordlist

_QUOTE_CHARACTERS = "\"'"


@dataclass(frozen=True)
class BanResult:
    term: str
    wordlist_changed: bool


@dataclass(frozen=True)
class UnbanResult:
    term: str
    wordlist_changed: bool
    wordfreq_allowlist_changed: bool
    idiom_allowlist_changed: bool


def ban_term(term: str, *, wordlist_path: Path | None = None) -> BanResult:
    """Add `term` to the banned wordlist, unless an equal-ignoring-case entry exists."""
    path = wordlist_path if wordlist_path is not None else LIVE_PATHS.wordlist_path
    normalized = _normalize_term(term)

    existing_terms = {existing.lower() for existing in load_wordlist(path)}
    if normalized in existing_terms:
        return BanResult(term=normalized, wordlist_changed=False)

    path.parent.mkdir(parents=True, exist_ok=True)
    current_text = path.read_text(encoding="utf-8") if path.is_file() else ""
    if current_text and not current_text.endswith("\n"):
        current_text += "\n"
    path.write_text(f"{current_text}{normalized}\n", encoding="utf-8")
    return BanResult(term=normalized, wordlist_changed=True)


def unban_term(
    term: str,
    *,
    wordlist_path: Path | None = None,
    config_path: Path | None = None,
) -> UnbanResult:
    """Remove `term` from the wordlist and add it to the wordfreq and idiom allowlists."""
    resolved_wordlist_path = (
        wordlist_path if wordlist_path is not None else LIVE_PATHS.wordlist_path
    )
    resolved_config_path = config_path if config_path is not None else LIVE_PATHS.config_path
    normalized = _normalize_term(term)

    return UnbanResult(
        term=normalized,
        wordlist_changed=_remove_from_wordlist(normalized, resolved_wordlist_path),
        wordfreq_allowlist_changed=_add_to_allowlist(
            normalized, resolved_config_path, WORDFREQ_SECTION
        ),
        idiom_allowlist_changed=_add_to_allowlist(normalized, resolved_config_path, IDIOM_SECTION),
    )


def _normalize_term(term: str) -> str:
    trimmed = term.strip()
    if len(trimmed) >= 2 and trimmed[0] in _QUOTE_CHARACTERS and trimmed[-1] == trimmed[0]:
        trimmed = trimmed[1:-1].strip()
    return trimmed.lower()


def _remove_from_wordlist(term: str, path: Path) -> bool:
    if not path.is_file():
        return False

    original_lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    kept_lines = [line for line in original_lines if line.strip().lower() != term]
    if len(kept_lines) == len(original_lines):
        return False

    path.write_text("".join(kept_lines), encoding="utf-8")
    return True


def _add_to_allowlist(term: str, path: Path, section_name: str) -> bool:
    """Add `term` to `[section_name].allowlist`, creating the section/key/file as needed.

    Uses `tomlkit`, not the stdlib `tomllib` `config.py` reads with, because this is a
    write path: it must round-trip every comment and every other setting in the file
    untouched, not just parse it.
    """
    document = (
        tomlkit.parse(path.read_text(encoding="utf-8")) if path.is_file() else tomlkit.document()
    )

    section = document.get(section_name)
    if section is None:
        section = tomlkit.table()
        document[section_name] = section

    allowlist = section.get("allowlist")
    if allowlist is None:
        allowlist = tomlkit.array()
        section["allowlist"] = allowlist

    if any(str(existing).lower() == term for existing in allowlist):
        return False

    allowlist.append(term)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(tomlkit.dumps(document), encoding="utf-8")
    _verify_allowlist_round_trip(term, path, section_name)
    return True


def _verify_allowlist_round_trip(term: str, path: Path, section_name: str) -> None:
    """Refuse to report success if the write doesn't parse back the way it should.

    `config.py`'s `load_config` silently falls back to defaults for anything it can't
    read (a hand-edited file must not take a check offline by accident, see
    `config.py`), so a `tomlkit`/`tomllib` round-trip drift here would otherwise pass
    unnoticed and quietly leave the check unprotected by the allowlist entry this
    function just claimed to add.
    """
    settings = load_config(path)
    allowlist = (
        settings.wordfreq.allowlist
        if section_name == WORDFREQ_SECTION
        else settings.idiom.allowlist
    )
    if term not in {entry.lower() for entry in allowlist}:
        raise RuntimeError(
            f"Wrote {section_name}.allowlist to {path} but it doesn't parse back with "
            f"{term!r} present."
        )
