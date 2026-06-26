"""
analyze.py
FastAPI router for repository analysis endpoints.

Endpoints
---------
POST   /analyze              – Submit a repo URL, kick off background analysis
GET    /status/{report_id}   – Lightweight status poll
GET    /report/{report_id}   – Full report JSON
GET    /reports              – List all reports (summary)
GET    /stream/{report_id}   – SSE stream of agent-completion events
"""

from __future__ import annotations

import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from database.postgres import get_report, list_reports, save_report
from graph.workflow import compiled_graph

router = APIRouter()


# ── Request / Response models ─────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    repo_url: str


# ── Background runner ─────────────────────────────────────────────────────────

async def _run_graph(report_id: int, repo_url: str) -> None:
    """Invoke the compiled LangGraph workflow as a background task."""
    initial_state = {
        "repo_url":             repo_url,
        "report_id":            report_id,
        "metadata":             {},
        "chunks":               [],
        "architecture_report":  "",
        "documentation_report": "",
        "review_report":        "",
        "dependency_report":    "",
        "onboarding_report":    "",
        "dependency_graph_json": "",
        "final_report":         "",
        "agent_status":         {},
    }
    try:
        await compiled_graph.ainvoke(initial_state)
    except Exception as exc:
        print(f"[workflow ERROR] report_id={report_id}: {exc}")
        # Persist error status so the frontend knows something went wrong
        from database.postgres import update_field
        try:
            await update_field(report_id, "status", "error")
        except Exception:
            pass


# ── 1. POST /analyze ──────────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze(request: AnalyzeRequest, background_tasks: BackgroundTasks):
    """
    Submit a GitHub repository URL for analysis.

    - Validates that the URL starts with ``https://github.com/``
    - Creates a DB row and returns its ``report_id``
    - Launches the full LangGraph pipeline in the background
    """
    repo_url = request.repo_url.strip()

    if not repo_url.startswith("https://github.com/"):
        raise HTTPException(
            status_code=400,
            detail="repo_url must start with 'https://github.com/'",
        )

    report_id = await save_report(repo_url)
    background_tasks.add_task(_run_graph, report_id, repo_url)

    return {"report_id": report_id}


# ── 2. GET /status/{report_id} ────────────────────────────────────────────────

# Maps DB column names → logical agent names used in the status response
_FIELD_TO_AGENT: list[tuple[str, str]] = [
    ("repo_name",            "cloning"),
    ("architecture_report",  "architecture"),
    ("documentation_report", "documentation"),
    ("review_report",        "review"),
    ("dependency_report",    "dependency"),
    ("onboarding_report",    "onboarding"),
    ("final_report",         "merge"),
]

# Pipeline stages whose completion we always want to report
_ALL_STAGES = [
    "cloning",
    "parsing",
    "embedding",
    "architecture",
    "documentation",
    "review",
    "dependency",
    "onboarding",
    "merge",
]


def _derive_agent_status(row: dict) -> dict:
    """
    Derive per-agent status from the presence of non-null / non-empty fields.

    The DB row doesn't store parsing / embedding results directly, so we infer
    those from downstream fields being present.
    """
    status: dict[str, str] = {stage: "pending" for stage in _ALL_STAGES}

    # cloning  – repo_name populated
    if row.get("repo_name"):
        status["cloning"] = "completed"

    # parsing  – if cloning done AND at least architecture started/done
    #            (chunks aren't stored in DB; use architecture as a proxy)
    if status["cloning"] == "completed":
        status["parsing"] = "completed"

    # embedding – same proxy: if any report exists, embedding must have run
    if row.get("architecture_report") or row.get("documentation_report"):
        status["embedding"] = "completed"

    # Individual agent reports
    for field, agent in _FIELD_TO_AGENT:
        if agent in status and row.get(field):
            status[agent] = "completed"

    return status


@router.get("/status/{report_id}")
async def get_status(report_id: int):
    """Return the current processing status for a report."""
    row = await get_report(report_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found")

    return {
        "status":       row["status"],
        "agent_status": _derive_agent_status(row),
    }


# ── 3. GET /report/{report_id} ────────────────────────────────────────────────

@router.get("/report/{report_id}")
async def get_full_report(report_id: int):
    """Return the complete DB row for a report as JSON."""
    row = await get_report(report_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found")

    # asyncpg Record → plain dict; convert datetime to str for JSON safety
    result = {}
    for key, value in row.items():
        if hasattr(value, "isoformat"):          # datetime / date objects
            result[key] = value.isoformat()
        else:
            result[key] = value
    return result


# ── 4. GET /reports ───────────────────────────────────────────────────────────

@router.get("/reports")
async def get_all_reports():
    """
    Return a summary list of all reports.

    Columns: id, repo_url, repo_name, language, framework, status, created_at
    """
    rows = await list_reports()
    result = []
    for row in rows:
        entry = {}
        for key, value in row.items():
            if hasattr(value, "isoformat"):
                entry[key] = value.isoformat()
            else:
                entry[key] = value
        result.append(entry)
    return result


# ── 5. GET /stream/{report_id}  (SSE) ────────────────────────────────────────

# Maps DB field name → SSE agent label (in the order we emit events)
_SSE_FIELD_ORDER: list[tuple[str, str]] = [
    ("repo_name",            "cloning"),
    ("architecture_report",  "architecture"),
    ("documentation_report", "documentation"),
    ("review_report",        "review"),
    ("dependency_report",    "dependency"),
    ("onboarding_report",    "onboarding"),
    ("final_report",         "merge"),
]


async def _sse_generator(report_id: int) -> AsyncGenerator[str, None]:
    """
    Async generator that polls the DB every 2 s and emits SSE events whenever
    a previously-null field becomes non-null.  Closes when status = 'completed'.
    """
    # Track which agents have already had their event sent
    emitted: set[str] = set()

    # Synthetic stages that aren't stored in DB but we emit once cloning is done
    parsing_emitted   = False
    embedding_emitted = False

    while True:
        row = await get_report(report_id)

        if row is None:
            yield f"data: {json.dumps({'error': 'report not found'})}\n\n"
            return

        # ── cloning ──────────────────────────────────────────────────────────
        if row.get("repo_name") and "cloning" not in emitted:
            emitted.add("cloning")
            yield f"data: {json.dumps({'agent': 'cloning', 'status': 'completed'})}\n\n"

        # ── parsing (synthetic — infer from cloning being done) ──────────────
        if "cloning" in emitted and not parsing_emitted:
            parsing_emitted = True
            yield f"data: {json.dumps({'agent': 'parsing', 'status': 'completed'})}\n\n"

        # ── embedding (synthetic — infer from any report starting) ───────────
        if not embedding_emitted and (
            row.get("architecture_report") or row.get("documentation_report")
        ):
            embedding_emitted = True
            yield f"data: {json.dumps({'agent': 'embedding', 'status': 'completed'})}\n\n"

        # ── individual agent reports ──────────────────────────────────────────
        for field, agent in _SSE_FIELD_ORDER:
            if agent in emitted:
                continue
            if row.get(field):
                emitted.add(agent)
                yield f"data: {json.dumps({'agent': agent, 'status': 'completed'})}\n\n"

        # ── terminal condition ────────────────────────────────────────────────
        if row.get("status") == "completed":
            yield f"data: {json.dumps({'agent': 'all', 'status': 'completed'})}\n\n"
            return

        if row.get("status") == "error":
            yield f"data: {json.dumps({'agent': 'all', 'status': 'error'})}\n\n"
            return

        await asyncio.sleep(2)


@router.get("/stream/{report_id}")
async def stream_status(report_id: int):
    """
    Server-Sent Events endpoint.  Streams agent-completion events every
    ~2 seconds until the report is fully processed (or errors out).
    """
    # Verify report exists before opening the stream
    row = await get_report(report_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found")

    return StreamingResponse(
        _sse_generator(report_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control":   "no-cache",
            "X-Accel-Buffering": "no",   # disable Nginx buffering if proxied
        },
    )
