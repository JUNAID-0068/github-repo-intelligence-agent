"""
workflow.py
LangGraph workflow that orchestrates the full repository intelligence pipeline.

Graph topology:
    START → clone_node → parse_node → embed_node
                                           │
              ┌────────────────────────────┼────────────────────────────┐
              ▼            ▼              ▼              ▼              ▼
    architecture_node  documentation_node  review_node  dependency_node  onboarding_node
              └────────────────────────────┼────────────────────────────┘
                                           ▼
                                       merge_node → END
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import TypedDict

from langgraph.graph import END, START, StateGraph

# ── Parser / embeddings imports ──────────────────────────────────────────────
from repo_parser.clone import clone_repository
from parser.parse import parse_repository
from embeddings.embed import generate_embeddings
from embeddings.vectordb import create_collection, store_chunks

# ── Agent imports ─────────────────────────────────────────────────────────────
from agents.architecture import run_architecture_agent
from agents.documentation import run_documentation_agent
from agents.review import run_review_agent
from agents.dependency import run_dependency_agent
from agents.onboarding import run_onboarding_agent

# ── Database / LLM imports ───────────────────────────────────────────────────
from database.postgres import update_field
from llm.groq import call_llm


# ── State schema ─────────────────────────────────────────────────────────────

class RepoState(TypedDict):
    repo_url:             str
    report_id:            int
    metadata:             dict
    chunks:               list
    architecture_report:  str
    documentation_report: str
    review_report:        str
    dependency_report:    str
    onboarding_report:    str
    dependency_graph_json: str
    final_report:         str
    agent_status:         dict


# ── Node helpers ──────────────────────────────────────────────────────────────

def _merge_status(existing: dict, update: dict) -> dict:
    """Return a new dict that merges *update* into *existing*."""
    return {**existing, **update}


# ── Node functions ────────────────────────────────────────────────────────────

async def clone_node(state: RepoState) -> RepoState:
    """
    Clone the repository and extract metadata.
    Updates DB with repo_name, language, and framework.
    """
    repo_url  = state["repo_url"]
    report_id = state["report_id"]

    print(f"[clone_node] Cloning {repo_url} …")
    metadata = await clone_repository(repo_url)

    repo_name = metadata["repo_name"]
    language  = metadata["language"]
    framework = metadata["framework"]

    await update_field(report_id, "repo_name", repo_name)
    await update_field(report_id, "language",  language)
    await update_field(report_id, "framework", framework)

    return {
        **state,
        "metadata":     metadata,
        "agent_status": _merge_status(state.get("agent_status", {}), {"cloning": "completed"}),
    }


async def parse_node(state: RepoState) -> RepoState:
    """
    Parse all files in the cloned repository into chunks.
    """
    repo_path = state["metadata"]["repo_path"]

    print(f"[parse_node] Parsing {repo_path} …")
    chunks = await asyncio.to_thread(parse_repository, repo_path)
    print(f"[parse_node] Produced {len(chunks)} chunks.")

    return {
        **state,
        "chunks":       chunks,
        "agent_status": _merge_status(state.get("agent_status", {}), {"parsing": "completed"}),
    }


async def embed_node(state: RepoState) -> RepoState:
    """
    Generate embeddings for all chunks and store them in ChromaDB.
    """
    report_id = state["report_id"]
    chunks    = state["chunks"]

    print(f"[embed_node] Generating embeddings for {len(chunks)} chunks …")
    embeddings = await asyncio.to_thread(generate_embeddings, chunks)

    await asyncio.to_thread(create_collection, report_id)
    await asyncio.to_thread(store_chunks, report_id, chunks, embeddings)
    print(f"[embed_node] Stored {len(embeddings)} embeddings in collection repo_{report_id}.")

    return {
        **state,
        "agent_status": _merge_status(state.get("agent_status", {}), {"embedding": "completed"}),
    }


async def architecture_node(state: RepoState) -> RepoState:
    """Run the architecture agent and persist its report."""
    report_id = state["report_id"]
    metadata  = state["metadata"]

    print("[architecture_node] Running architecture agent …")
    result = await run_architecture_agent(report_id, metadata)

    await update_field(report_id, "architecture_report", result)

    return {
        **state,
        "architecture_report": result,
        "agent_status": _merge_status(state.get("agent_status", {}), {"architecture": "completed"}),
    }


async def documentation_node(state: RepoState) -> RepoState:
    """Run the documentation agent and persist its report."""
    report_id = state["report_id"]
    metadata  = state["metadata"]

    print("[documentation_node] Running documentation agent …")
    result = await run_documentation_agent(report_id, metadata)

    await update_field(report_id, "documentation_report", result)

    return {
        **state,
        "documentation_report": result,
        "agent_status": _merge_status(state.get("agent_status", {}), {"documentation": "completed"}),
    }


async def review_node(state: RepoState) -> RepoState:
    """Run the code review agent and persist its report."""
    report_id = state["report_id"]
    metadata  = state["metadata"]

    print("[review_node] Running review agent …")
    result = await run_review_agent(report_id, metadata)

    await update_field(report_id, "review_report", result)

    return {
        **state,
        "review_report": result,
        "agent_status": _merge_status(state.get("agent_status", {}), {"review": "completed"}),
    }


async def dependency_node(state: RepoState) -> RepoState:
    """
    Run the dependency agent, extract the embedded JSON graph, and persist
    both the full report and the graph JSON separately.
    """
    report_id = state["report_id"]
    metadata  = state["metadata"]

    print("[dependency_node] Running dependency agent …")
    result = await run_dependency_agent(report_id, metadata)

    # ── Extract dependency graph JSON from the response ───────────────────
    dependency_graph_json = ""
    marker = "DEPENDENCY_GRAPH_JSON:"
    if marker in result:
        after_marker = result.split(marker, 1)[1].strip()
        # Grab everything up to the first newline (the JSON is on one line)
        json_line = after_marker.split("\n", 1)[0].strip()
        try:
            # Validate it's legal JSON before storing
            parsed = json.loads(json_line)
            dependency_graph_json = json.dumps(parsed)
        except json.JSONDecodeError:
            print(f"[dependency_node] WARNING: Could not parse dependency graph JSON: {json_line[:200]}")
            dependency_graph_json = json_line  # store as-is if parsing fails

    await update_field(report_id, "dependency_report",    result)
    if dependency_graph_json:
        await update_field(report_id, "dependency_graph_json", dependency_graph_json)

    return {
        **state,
        "dependency_report":    result,
        "dependency_graph_json": dependency_graph_json,
        "agent_status": _merge_status(state.get("agent_status", {}), {"dependency": "completed"}),
    }


async def onboarding_node(state: RepoState) -> RepoState:
    """Run the onboarding agent and persist its report."""
    report_id = state["report_id"]
    metadata  = state["metadata"]

    print("[onboarding_node] Running onboarding agent …")
    result = await run_onboarding_agent(report_id, metadata)

    await update_field(report_id, "onboarding_report", result)

    return {
        **state,
        "onboarding_report": result,
        "agent_status": _merge_status(state.get("agent_status", {}), {"onboarding": "completed"}),
    }


async def merge_node(state: RepoState) -> RepoState:
    """
    Merge all five specialist reports into a single final Repository
    Intelligence Report and mark the job as completed in the DB.
    """
    report_id = state["report_id"]

    architecture_report  = state.get("architecture_report",  "")
    documentation_report = state.get("documentation_report", "")
    review_report        = state.get("review_report",        "")
    dependency_report    = state.get("dependency_report",    "")
    onboarding_report    = state.get("onboarding_report",    "")

    print("[merge_node] Merging all reports into final report …")

    prompt = f"""You are a technical consultant. Combine these \
reports into one final Repository Intelligence Report:

Architecture: {architecture_report}
Documentation: {documentation_report}
Code Review: {review_report}
Dependencies: {dependency_report}
Onboarding: {onboarding_report}

Create a unified report with sections:
1. Executive Summary
2. Architecture Overview
3. API Documentation
4. Code Quality Report
5. Dependency Analysis
6. Developer Onboarding Guide
7. Recommended Next Steps

Format in clean markdown."""

    final_report = await call_llm(prompt)

    await update_field(report_id, "final_report", final_report)
    await update_field(report_id, "status",       "completed")

    print(f"[merge_node] Report {report_id} marked as completed.")

    return {
        **state,
        "final_report": final_report,
        "agent_status": _merge_status(
            state.get("agent_status", {}), {"merge": "completed"}
        ),
    }


# ── Graph construction ────────────────────────────────────────────────────────

def _build_graph() -> StateGraph:
    graph = StateGraph(RepoState)

    # Register nodes
    graph.add_node("clone_node",         clone_node)
    graph.add_node("parse_node",         parse_node)
    graph.add_node("embed_node",         embed_node)
    graph.add_node("architecture_node",  architecture_node)
    graph.add_node("documentation_node", documentation_node)
    graph.add_node("review_node",        review_node)
    graph.add_node("dependency_node",    dependency_node)
    graph.add_node("onboarding_node",    onboarding_node)
    graph.add_node("merge_node",         merge_node)

    # Sequential pipeline up to embed
    graph.add_edge(START,        "clone_node")
    graph.add_edge("clone_node", "parse_node")
    graph.add_edge("parse_node", "embed_node")

    # Fan-out: embed → all 5 specialist agents in parallel
    _AGENT_NODES = [
        "architecture_node",
        "documentation_node",
        "review_node",
        "dependency_node",
        "onboarding_node",
    ]
    for agent_node in _AGENT_NODES:
        graph.add_edge("embed_node", agent_node)

    # Fan-in: all 5 specialist agents → merge
    for agent_node in _AGENT_NODES:
        graph.add_edge(agent_node, "merge_node")

    graph.add_edge("merge_node", END)

    return graph


# ── Compiled graph (exported) ─────────────────────────────────────────────────
compiled_graph = _build_graph().compile()
