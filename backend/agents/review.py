"""
review.py
Performs automated code review and quality assessment of the repository.
"""

import asyncio
from embeddings.vectordb import query_collection
from llm.groq import call_llm


async def run_review_agent(report_id: int, metadata: dict) -> str:
    """
    Query the vector store for code patterns and produce a code quality
    review report.

    Args:
        report_id: ID of the report / ChromaDB collection to query.
        metadata:  Repository metadata dict from clone_repository().

    Returns:
        Markdown-formatted code review report string.
    """
    context = await asyncio.to_thread(
        query_collection,
        report_id,
        "error handling logging security validation tests code quality",
        15,
    )

    repo_name = metadata.get("repo_name", "unknown")
    language  = metadata.get("language",  "unknown")
    framework = metadata.get("framework", "unknown")

    prompt = f"""You are an expert code reviewer with 15+ years of experience.
Perform a thorough code quality review for the repository below.

Repository: {repo_name}
Language:   {language}
Framework:  {framework}

Relevant code context:
{context}

Write a detailed markdown Code Review Report covering:
1. Code Quality Summary (overall rating out of 10)
2. Code Style & Readability
3. Error Handling & Robustness
4. Security Vulnerabilities or Risks
5. Performance Concerns
6. Test Coverage Assessment
7. Best Practice Violations
8. Specific Recommendations (prioritised: Critical / Major / Minor)

Format in clean markdown with headers."""

    return await call_llm(prompt)
