"""Matching written text against the live banned-word list, to block serious violations."""

from dataclasses import dataclass

from plainspeak.checks import CheckSpec, Severity, register_check
from plainspeak.config import CheckerSettings
from plainspeak.matcher import find_matches
from plainspeak.paths import LIVE_PATHS
from plainspeak.wordlist import load_wordlist

BANNED_WORD_CHECK_NAME = "banned-word"


@dataclass(frozen=True)
class BannedWordSettings:
    enabled: bool
    terms: tuple[str, ...]


def _settings_of(_settings: CheckerSettings) -> BannedWordSettings:
    """There is no config toggle for this check: it is on whenever the wordlist has terms."""
    terms = tuple(load_wordlist(LIVE_PATHS.wordlist_path))
    return BannedWordSettings(enabled=bool(terms), terms=terms)


def _detect(text: str, settings: BannedWordSettings) -> list[str]:
    return find_matches(text, settings.terms)


def _describe(hits: list[str]) -> str:
    return (
        "Banned word(s) used: "
        f"{', '.join(hits)}. Re-read the root CLAUDE.md (Simplified Technical "
        "English rules) before continuing, then rewrite with simpler wording. "
        "Do not restate the full banned list."
    )


register_check(
    CheckSpec(
        name=BANNED_WORD_CHECK_NAME,
        severity=Severity.BLOCK,
        settings_of=_settings_of,
        detect=_detect,
        describe=_describe,
    )
)
