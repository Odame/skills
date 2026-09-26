"""Counts-only SQLite store of check outcomes (see docs/adr/0003)."""

import sqlite3
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

BLOCK_OUTCOME = "block"
WARN_OUTCOME = "warn"

RETENTION_DAY_LIMIT = 90
RETENTION_ROW_LIMIT = 5000

CONCURRENT_WRITER_WAIT_SECONDS = 10.0

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS check_outcomes (
    date TEXT NOT NULL,
    session_id TEXT NOT NULL,
    check_name TEXT NOT NULL,
    outcome TEXT NOT NULL,
    term TEXT NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (date, session_id, check_name, outcome, term)
)
"""

_UPSERT_COUNT = """
INSERT INTO check_outcomes (date, session_id, check_name, outcome, term, count)
VALUES (?, ?, ?, ?, ?, 1)
ON CONFLICT (date, session_id, check_name, outcome, term)
DO UPDATE SET count = count + 1
"""

NO_TERM = ""
"""Sentinel `term` for a check that never records literal hits (see `checks.CheckSpec`)."""

_DELETE_ROWS_BEYOND_LIMIT = """
DELETE FROM check_outcomes
WHERE rowid NOT IN (
    SELECT rowid FROM check_outcomes ORDER BY date DESC, rowid DESC LIMIT ?
)
"""


def record_outcome(
    database_path: Path,
    *,
    session_id: str,
    check_name: str,
    outcome: str,
    term: str = NO_TERM,
    today: date | None = None,
    retention_day_limit: int = RETENTION_DAY_LIMIT,
    retention_row_limit: int = RETENTION_ROW_LIMIT,
) -> None:
    """Increment the count for one check outcome, then prune by age and by row count.

    The increment is a single SQLite upsert, so concurrent hook invocations from
    separate sessions serialise on SQLite's own write lock instead of racing.
    """
    recorded_on = today or date.today()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    oldest_date_kept = (recorded_on - timedelta(days=retention_day_limit)).isoformat()

    connection = sqlite3.connect(database_path, timeout=CONCURRENT_WRITER_WAIT_SECONDS)
    try:
        connection.execute("PRAGMA journal_mode = WAL")
        _drop_table_predating_the_term_column(connection)
        connection.execute(_CREATE_TABLE)
        with connection:
            connection.execute(
                _UPSERT_COUNT, (recorded_on.isoformat(), session_id, check_name, outcome, term)
            )
            connection.execute("DELETE FROM check_outcomes WHERE date < ?", (oldest_date_kept,))
            connection.execute(_DELETE_ROWS_BEYOND_LIMIT, (retention_row_limit,))
    finally:
        connection.close()


DEFAULT_TOP_TERM_LIMIT = 10


@dataclass(frozen=True)
class CheckSummary:
    check_name: str
    outcome: str
    total: int
    since: str
    top_terms: tuple[tuple[str, int], ...]


def summarize(
    database_path: Path, *, top_term_limit: int = DEFAULT_TOP_TERM_LIMIT
) -> list[CheckSummary]:
    """Return one summary per (check, outcome) recorded, most-recently-created check first.

    `top_terms` only ever has entries for a check that records literal terms (see
    `checks.CheckSpec.records_terms_in_tracking`); a check that never does contributes
    an empty `top_terms` and its `total` still reflects every outcome recorded for it.
    """
    if not database_path.is_file():
        return []
    with sqlite3.connect(database_path) as connection:
        totals = connection.execute(
            "SELECT check_name, outcome, SUM(count), MIN(date)"
            " FROM check_outcomes GROUP BY check_name, outcome ORDER BY check_name, outcome"
        ).fetchall()
        return [
            CheckSummary(
                check_name,
                outcome,
                total,
                since,
                tuple(_top_terms(connection, check_name, outcome, top_term_limit)),
            )
            for check_name, outcome, total, since in totals
        ]


def _top_terms(
    connection: sqlite3.Connection, check_name: str, outcome: str, limit: int
) -> list[tuple[str, int]]:
    return connection.execute(
        "SELECT term, SUM(count) FROM check_outcomes"
        " WHERE check_name = ? AND outcome = ? AND term != ''"
        " GROUP BY term ORDER BY SUM(count) DESC, term LIMIT ?",
        (check_name, outcome, limit),
    ).fetchall()


def _drop_table_predating_the_term_column(connection: sqlite3.Connection) -> None:
    """Discard a `check_outcomes` table from before the `term` column existed.

    Those rows can never answer a per-term question, and none of them hold anything
    the counts-only design (docs/adr/0003) didn't already intend to be disposable, so
    starting the count over is simpler than backfilling a sentinel into a changed
    primary key.
    """
    table_exists = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'check_outcomes'"
    ).fetchone()
    if not table_exists:
        return
    columns = {row[1] for row in connection.execute("PRAGMA table_info(check_outcomes)")}
    if "term" not in columns:
        connection.execute("DROP TABLE check_outcomes")
