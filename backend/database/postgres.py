"""
PostgreSQL connection and query module using asyncpg.
Loads DATABASE_URL from .env and exposes async helpers
for the repo_reports table.
"""

import os
import asyncpg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL: str = os.getenv("DATABASE_URL", "")

# ---------------------------------------------------------------------------
# Connection pool (initialised once at startup via init_db)
# ---------------------------------------------------------------------------
_pool: asyncpg.Pool | None = None


async def _get_pool() -> asyncpg.Pool:
    """Return the existing pool, creating it on first call."""
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL)
    return _pool


# ---------------------------------------------------------------------------
# Table DDL
# ---------------------------------------------------------------------------
_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS repo_reports (
    id                   SERIAL PRIMARY KEY,
    repo_url             TEXT NOT NULL,
    repo_name            TEXT,
    language             TEXT,
    framework            TEXT,
    architecture_report  TEXT,
    documentation_report TEXT,
    review_report        TEXT,
    dependency_report    TEXT,
    onboarding_report    TEXT,
    dependency_graph_json TEXT,
    final_report         TEXT,
    status               TEXT DEFAULT 'pending',
    created_at           TIMESTAMP DEFAULT NOW()
);
"""

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def init_db() -> None:
    """
    Create the repo_reports table if it does not already exist.
    Call this once at application startup (e.g. in FastAPI's lifespan handler).
    """
    pool = await _get_pool()
    async with pool.acquire() as conn:
        await conn.execute(_CREATE_TABLE_SQL)
    print("[DB] repo_reports table ready.")


async def save_report(repo_url: str) -> int:
    """
    Insert a new row with only repo_url set (status defaults to 'pending').

    Returns:
        The auto-generated integer ``id`` of the new row.
    """
    pool = await _get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO repo_reports (repo_url) VALUES ($1) RETURNING id;",
            repo_url,
        )
    return row["id"]


async def update_field(report_id: int, field_name: str, value: str) -> None:
    """
    Update a single column in the repo_reports row identified by ``report_id``.

    Args:
        report_id:  Primary key of the row to update.
        field_name: Name of the column to set.  Must be one of the columns
                    defined in the table to guard against SQL injection.
        value:      New value (always stored as text).

    Raises:
        ValueError: If ``field_name`` is not a recognised column.
    """
    allowed_fields = {
        "repo_name",
        "language",
        "framework",
        "architecture_report",
        "documentation_report",
        "review_report",
        "dependency_report",
        "onboarding_report",
        "dependency_graph_json",
        "final_report",
        "status",
    }
    if field_name not in allowed_fields:
        raise ValueError(
            f"'{field_name}' is not an updatable field. "
            f"Allowed fields: {sorted(allowed_fields)}"
        )

    # Field name is validated against a whitelist so safe to interpolate.
    sql = f"UPDATE repo_reports SET {field_name} = $1 WHERE id = $2;"
    pool = await _get_pool()
    async with pool.acquire() as conn:
        await conn.execute(sql, value, report_id)


async def get_report(report_id: int) -> dict | None:
    """
    Fetch the complete row for the given ``report_id``.

    Returns:
        A ``dict`` of all columns, or ``None`` if no row with that id exists.
    """
    pool = await _get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM repo_reports WHERE id = $1;",
            report_id,
        )
    return dict(row) if row else None


async def list_reports() -> list[dict]:
    """
    Return a lightweight list of all reports (summary columns only).

    Columns returned:
        id, repo_url, repo_name, language, framework, status, created_at
    """
    sql = """
        SELECT id, repo_url, repo_name, language, framework, status, created_at
        FROM   repo_reports
        ORDER  BY created_at DESC;
    """
    pool = await _get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql)
    return [dict(row) for row in rows]
