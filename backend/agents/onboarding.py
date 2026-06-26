"""
onboarding.py
Produces a developer onboarding guide for the repository.
"""

import asyncio
from embeddings.vectordb import query_collection
from llm.groq import call_llm


async def run_onboarding_agent(report_id: int, metadata: dict) -> str:
    """
    Query the vector store for setup / configuration context and generate
    a developer onboarding guide.

    Args:
        report_id: ID of the report / ChromaDB collection to query.
        metadata:  Repository metadata dict from clone_repository().

    Returns:
        Markdown-formatted onboarding guide string.
    """
    context = await asyncio.to_thread(
        query_collection,
        report_id,
        "setup installation configuration environment variables getting started README",
        15,
    )

    repo_name     = metadata.get("repo_name",     "unknown")
    language      = metadata.get("language",      "unknown")
    framework     = metadata.get("framework",     "unknown")
    total_files   = metadata.get("total_files",   "N/A")
    total_folders = metadata.get("total_folders", "N/A")

    prompt = f"""You are a developer experience (DX) specialist.
Create a comprehensive onboarding guide for a new developer joining this project.

Repository: {repo_name}
Language:   {language}
Framework:  {framework}
Total files: {total_files} | Total folders: {total_folders}

Relevant code / config context:
{context}

Write a detailed markdown Developer Onboarding Guide covering:
1. Project Overview & Purpose
2. Prerequisites & System Requirements
3. Installation & Local Setup (step-by-step)
4. Environment Variables & Configuration
5. Running the Project (dev, test, prod)
6. Project Structure Walkthrough
7. Key Concepts & Domain Knowledge
8. Common Tasks & Workflows
9. Debugging & Troubleshooting Tips
10. Contributing Guidelines

Format in clean markdown with headers and numbered/bulleted lists."""

    return await call_llm(prompt)
