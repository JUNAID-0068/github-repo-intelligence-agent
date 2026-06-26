"""
architecture.py
Analyses repository architecture and produces a structured markdown report.
"""

import asyncio
from embeddings.vectordb import query_collection
from llm.groq import call_llm


async def run_architecture_agent(report_id: int, metadata: dict) -> str:
    """
    Query the vector store for architectural context and ask the LLM
    to produce an architecture report.

    Args:
        report_id: ID of the report / ChromaDB collection to query.
        metadata:  Repository metadata dict from clone_repository().

    Returns:
        Markdown-formatted architecture report string.
    """
    context = await asyncio.to_thread(
        query_collection,
        report_id,
        "architecture modules services components structure",
        15,
    )

    repo_name = metadata.get("repo_name", "unknown")
    language  = metadata.get("language",  "unknown")
    framework = metadata.get("framework", "unknown")
    folders   = metadata.get("folders",   [])

    prompt = f"""You are a senior software architect.
Analyse the following repository and produce a detailed Architecture Report.

Repository: {repo_name}
Language:   {language}
Framework:  {framework}
Top-level folders: {", ".join(folders[:20]) if folders else "N/A"}

Relevant code context:
{context}

Write a thorough markdown report covering:
1. High-Level Architecture Overview
2. Module / Service Breakdown
3. Data Flow & Component Interactions
4. Design Patterns Identified
5. Scalability & Extensibility Notes
6. Architecture Strengths & Weaknesses

Format in clean markdown with headers."""

    return await call_llm(prompt)
