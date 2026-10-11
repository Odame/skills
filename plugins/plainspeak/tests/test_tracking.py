import sqlite3
from datetime import date
from pathlib import Path

from plainspeak.tracking import BLOCK_OUTCOME, WARN_OUTCOME, record_outcome, summarize


def read_rows(database_path: Path) -> list[tuple]:
    with sqlite3.connect(database_path) as connection:
        return connection.execute(
            "SELECT date, session_id, check_name, outcome, term, count"
            " FROM check_outcomes ORDER BY date, session_id, check_name, outcome, term"
        ).fetchall()


def test_record_outcome_creates_store_and_first_row(tmp_path: Path):
    database_path = tmp_path / "nested" / "tracking.sqlite3"

    record_outcome(
        database_path,
        session_id="session-a",
        check_name="banned-word",
        outcome=BLOCK_OUTCOME,
        today=date(2026, 8, 19),
    )

    assert read_rows(database_path) == [("2026-08-19", "session-a", "banned-word", "block", "", 1)]


def test_record_outcome_increments_existing_row(tmp_path: Path):
    database_path = tmp_path / "tracking.sqlite3"
    for _ in range(3):
        record_outcome(
            database_path,
            session_id="session-a",
            check_name="banned-word",
            outcome=BLOCK_OUTCOME,
            today=date(2026, 8, 19),
        )

    assert read_rows(database_path) == [("2026-08-19", "session-a", "banned-word", "block", "", 3)]


def test_record_outcome_keys_rows_separately(tmp_path: Path):
    database_path = tmp_path / "tracking.sqlite3"
    record_outcome(
        database_path,
        session_id="session-a",
        check_name="banned-word",
        outcome=BLOCK_OUTCOME,
        today=date(2026, 8, 19),
    )
    record_outcome(
        database_path,
        session_id="session-b",
        check_name="banned-word",
        outcome=BLOCK_OUTCOME,
        today=date(2026, 8, 19),
    )
    record_outcome(
        database_path,
        session_id="session-a",
        check_name="wordfreq",
        outcome=WARN_OUTCOME,
        today=date(2026, 8, 19),
    )
    record_outcome(
        database_path,
        session_id="session-a",
        check_name="banned-word",
        outcome=BLOCK_OUTCOME,
        today=date(2026, 8, 20),
    )

    assert read_rows(database_path) == [
        ("2026-08-19", "session-a", "banned-word", "block", "", 1),
        ("2026-08-19", "session-a", "wordfreq", "warn", "", 1),
        ("2026-08-19", "session-b", "banned-word", "block", "", 1),
        ("2026-08-20", "session-a", "banned-word", "block", "", 1),
    ]


def test_record_outcome_keys_rows_by_term_too(tmp_path: Path):
    database_path = tmp_path / "tracking.sqlite3"
    record_outcome(
        database_path,
        session_id="session-a",
        check_name="banned-word",
        outcome=BLOCK_OUTCOME,
        term="utilize",
        today=date(2026, 8, 19),
    )
    record_outcome(
        database_path,
        session_id="session-a",
        check_name="banned-word",
        outcome=BLOCK_OUTCOME,
        term="leverage",
        today=date(2026, 8, 19),
    )
    record_outcome(
        database_path,
        session_id="session-a",
        check_name="banned-word",
        outcome=BLOCK_OUTCOME,
        term="utilize",
        today=date(2026, 8, 19),
    )

    assert read_rows(database_path) == [
        ("2026-08-19", "session-a", "banned-word", "block", "leverage", 1),
        ("2026-08-19", "session-a", "banned-word", "block", "utilize", 2),
    ]


def test_store_records_no_file_paths_or_sentence_content(tmp_path: Path):
    database_path = tmp_path / "tracking.sqlite3"
    record_outcome(
        database_path,
        session_id="session-a",
        check_name="banned-word",
        outcome=BLOCK_OUTCOME,
        today=date(2026, 8, 19),
    )

    with sqlite3.connect(database_path) as connection:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(check_outcomes)")}

    assert columns == {"date", "session_id", "check_name", "outcome", "term", "count"}


def test_a_pre_term_column_table_is_dropped_and_recreated(tmp_path: Path):
    database_path = tmp_path / "tracking.sqlite3"
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            "CREATE TABLE check_outcomes ("
            "date TEXT NOT NULL, session_id TEXT NOT NULL, check_name TEXT NOT NULL, "
            "outcome TEXT NOT NULL, count INTEGER NOT NULL, "
            "PRIMARY KEY (date, session_id, check_name, outcome))"
        )
        connection.execute(
            "INSERT INTO check_outcomes VALUES ('2026-08-01', 'old-session', 'banned-word',"
            " 'block', 5)"
        )

    record_outcome(
        database_path,
        session_id="session-a",
        check_name="banned-word",
        outcome=BLOCK_OUTCOME,
        term="utilize",
        today=date(2026, 8, 19),
    )

    assert read_rows(database_path) == [
        ("2026-08-19", "session-a", "banned-word", "block", "utilize", 1)
    ]


def test_rows_older_than_the_retention_window_are_pruned(tmp_path: Path):
    database_path = tmp_path / "tracking.sqlite3"
    record_outcome(
        database_path,
        session_id="session-a",
        check_name="banned-word",
        outcome=BLOCK_OUTCOME,
        today=date(2026, 1, 1),
        retention_day_limit=30,
    )
    record_outcome(
        database_path,
        session_id="session-a",
        check_name="banned-word",
        outcome=BLOCK_OUTCOME,
        today=date(2026, 8, 19),
        retention_day_limit=30,
    )

    assert read_rows(database_path) == [("2026-08-19", "session-a", "banned-word", "block", "", 1)]


def test_rows_beyond_the_row_limit_are_pruned_oldest_first(tmp_path: Path):
    database_path = tmp_path / "tracking.sqlite3"
    for day in (17, 18, 19):
        record_outcome(
            database_path,
            session_id="session-a",
            check_name="banned-word",
            outcome=BLOCK_OUTCOME,
            today=date(2026, 8, day),
            retention_row_limit=2,
        )

    assert read_rows(database_path) == [
        ("2026-08-18", "session-a", "banned-word", "block", "", 1),
        ("2026-08-19", "session-a", "banned-word", "block", "", 1),
    ]


def test_concurrent_increments_are_not_lost(tmp_path: Path):
    from concurrent.futures import ThreadPoolExecutor

    database_path = tmp_path / "tracking.sqlite3"
    record_count = 40

    def record_once(_: int) -> None:
        record_outcome(
            database_path,
            session_id="session-a",
            check_name="banned-word",
            outcome=BLOCK_OUTCOME,
            today=date(2026, 8, 19),
        )

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(record_once, range(record_count)))

    assert read_rows(database_path) == [
        ("2026-08-19", "session-a", "banned-word", "block", "", record_count)
    ]


def test_summarize_with_no_database_returns_nothing(tmp_path: Path):
    assert summarize(tmp_path / "tracking.sqlite3") == []


def test_summarize_totals_and_ranks_terms_per_check_and_outcome(tmp_path: Path):
    database_path = tmp_path / "tracking.sqlite3"
    record_outcome(
        database_path,
        session_id="s",
        check_name="banned-word",
        outcome=BLOCK_OUTCOME,
        term="utilize",
        today=date(2026, 8, 19),
    )
    for _ in range(2):
        record_outcome(
            database_path,
            session_id="s",
            check_name="banned-word",
            outcome=BLOCK_OUTCOME,
            term="leverage",
            today=date(2026, 8, 20),
        )
    record_outcome(
        database_path,
        session_id="s",
        check_name="textstat",
        outcome=WARN_OUTCOME,
        today=date(2026, 8, 19),
    )

    summaries = {
        (summary.check_name, summary.outcome): summary for summary in summarize(database_path)
    }

    banned_word = summaries[("banned-word", "block")]
    assert banned_word.total == 3
    assert banned_word.since == "2026-08-19"
    assert banned_word.top_terms == (("leverage", 2), ("utilize", 1))

    textstat = summaries[("textstat", "warn")]
    assert textstat.total == 1
    assert textstat.top_terms == ()


def test_summarize_top_terms_respects_the_limit(tmp_path: Path):
    database_path = tmp_path / "tracking.sqlite3"
    for term in ("a", "b", "c"):
        record_outcome(
            database_path,
            session_id="s",
            check_name="banned-word",
            outcome=BLOCK_OUTCOME,
            term=term,
            today=date(2026, 8, 19),
        )

    summaries = summarize(database_path, top_term_limit=2)

    assert len(summaries[0].top_terms) == 2
