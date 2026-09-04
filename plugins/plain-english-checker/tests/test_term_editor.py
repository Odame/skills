from pathlib import Path

from plain_english_checker import term_editor
from plain_english_checker.config import load_config


def test_ban_an_absent_term_appends_it(tmp_path: Path):
    wordlist_path = tmp_path / "banned-words.txt"

    result = term_editor.ban_term("synergize", wordlist_path=wordlist_path)

    assert result == term_editor.BanResult(term="synergize", wordlist_changed=True)
    assert wordlist_path.read_text(encoding="utf-8") == "synergize\n"


def test_ban_an_already_present_term_is_a_no_op(tmp_path: Path):
    wordlist_path = tmp_path / "banned-words.txt"
    wordlist_path.write_text("utilize\n", encoding="utf-8")

    result = term_editor.ban_term("Utilize", wordlist_path=wordlist_path)

    assert result == term_editor.BanResult(term="utilize", wordlist_changed=False)
    assert wordlist_path.read_text(encoding="utf-8") == "utilize\n"


def test_ban_strips_quotes_and_whitespace_and_lowercases(tmp_path: Path):
    wordlist_path = tmp_path / "banned-words.txt"

    result = term_editor.ban_term("  'Leverage'  ", wordlist_path=wordlist_path)

    assert result.term == "leverage"
    assert "leverage" in wordlist_path.read_text(encoding="utf-8")


def test_ban_appends_after_a_file_missing_a_trailing_newline(tmp_path: Path):
    wordlist_path = tmp_path / "banned-words.txt"
    wordlist_path.write_text("utilize", encoding="utf-8")

    term_editor.ban_term("leverage", wordlist_path=wordlist_path)

    assert wordlist_path.read_text(encoding="utf-8") == "utilize\nleverage\n"


def test_ban_creates_a_missing_parent_directory(tmp_path: Path):
    wordlist_path = tmp_path / "nested" / "banned-words.txt"

    result = term_editor.ban_term("utilize", wordlist_path=wordlist_path)

    assert result.wordlist_changed is True
    assert wordlist_path.is_file()


def test_unban_a_term_present_only_in_the_wordlist(tmp_path: Path):
    wordlist_path = tmp_path / "banned-words.txt"
    config_path = tmp_path / "config.toml"
    wordlist_path.write_text("utilize\nleverage\n", encoding="utf-8")

    result = term_editor.unban_term(
        "leverage", wordlist_path=wordlist_path, config_path=config_path
    )

    assert result == term_editor.UnbanResult(
        term="leverage",
        wordlist_changed=True,
        wordfreq_allowlist_changed=True,
        idiom_allowlist_changed=True,
    )
    assert wordlist_path.read_text(encoding="utf-8") == "utilize\n"
    settings = load_config(config_path)
    assert settings.wordfreq.allowlist == ("leverage",)
    assert settings.idiom.allowlist == ("leverage",)


def test_unban_an_already_fully_unbanned_term_changes_nothing(tmp_path: Path):
    wordlist_path = tmp_path / "banned-words.txt"
    config_path = tmp_path / "config.toml"
    wordlist_path.write_text("utilize\n", encoding="utf-8")
    config_path.write_text(
        '[wordfreq]\nallowlist = ["leverage"]\n\n[idiom]\nallowlist = ["leverage"]\n',
        encoding="utf-8",
    )

    result = term_editor.unban_term(
        "leverage", wordlist_path=wordlist_path, config_path=config_path
    )

    assert result == term_editor.UnbanResult(
        term="leverage",
        wordlist_changed=False,
        wordfreq_allowlist_changed=False,
        idiom_allowlist_changed=False,
    )


def test_unban_preserves_comments_and_unrelated_lines_in_the_wordlist(tmp_path: Path):
    wordlist_path = tmp_path / "banned-words.txt"
    original = "# a comment\nutilize\n\nleverage\n# another comment\n"
    wordlist_path.write_text(original, encoding="utf-8")

    term_editor.unban_term("leverage", wordlist_path=wordlist_path, config_path=tmp_path / "c.toml")

    assert (
        wordlist_path.read_text(encoding="utf-8") == "# a comment\nutilize\n\n# another comment\n"
    )


def test_unban_preserves_comments_and_other_settings_in_the_config(tmp_path: Path):
    config_path = tmp_path / "config.toml"
    original = (
        "[wordfreq]\n"
        "# Flags rare words.\n"
        "enabled = true\n"
        "zipf_threshold = 2.5\n"
        'allowlist = ["idempotent"]\n'
    )
    config_path.write_text(original, encoding="utf-8")

    term_editor.unban_term("leverage", wordlist_path=tmp_path / "w.txt", config_path=config_path)

    rewritten = config_path.read_text(encoding="utf-8")
    assert "# Flags rare words." in rewritten
    assert "zipf_threshold = 2.5" in rewritten
    settings = load_config(config_path)
    assert settings.wordfreq.enabled is True
    assert settings.wordfreq.zipf_threshold == 2.5
    assert set(settings.wordfreq.allowlist) == {"idempotent", "leverage"}


def test_unban_creates_config_with_only_the_two_allowlisted_sections(tmp_path: Path):
    config_path = tmp_path / "config.toml"

    term_editor.unban_term("leverage", wordlist_path=tmp_path / "w.txt", config_path=config_path)

    settings = load_config(config_path)
    assert settings.wordfreq.allowlist == ("leverage",)
    assert settings.idiom.allowlist == ("leverage",)


def test_unban_a_missing_wordlist_reports_it_was_never_banned(tmp_path: Path):
    result = term_editor.unban_term(
        "leverage", wordlist_path=tmp_path / "does-not-exist.txt", config_path=tmp_path / "c.toml"
    )

    assert result.wordlist_changed is False


def test_unban_does_not_duplicate_an_allowlist_entry(tmp_path: Path):
    config_path = tmp_path / "config.toml"
    config_path.write_text('[wordfreq]\nallowlist = ["Leverage"]\n', encoding="utf-8")

    result = term_editor.unban_term(
        "leverage", wordlist_path=tmp_path / "w.txt", config_path=config_path
    )

    assert result.wordfreq_allowlist_changed is False
    settings = load_config(config_path)
    assert settings.wordfreq.allowlist == ("Leverage",)
