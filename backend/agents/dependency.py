"""
dependency.py
Analyses repository dependencies and produces a dependency report with
an embedded JSON dependency graph (nodes with type/version, directed edges).
"""

import asyncio
import json
import re

from embeddings.vectordb import query_collection
from llm.groq import call_llm


async def run_dependency_agent(report_id: int, metadata: dict) -> str:
    """
    Query the vector store for dependency manifests and produce a dependency
    analysis report. The response includes a special ``DEPENDENCY_GRAPH_JSON:``
    section that the workflow uses to extract and store the graph separately.

    The JSON graph schema:
      nodes: [{ "id": str, "version": str, "type": "root"|"direct"|"transitive"|"dev" }]
      edges: [{ "from": str, "to": str, "type": "depends_on"|"dev_depends_on" }]

    Args:
        report_id: ID of the report / ChromaDB collection to query.
        metadata:  Repository metadata dict from clone_repository().

    Returns:
        Markdown-formatted dependency report string that contains the line
        ``DEPENDENCY_GRAPH_JSON: { ... }`` somewhere in the text.
    """
    context = await asyncio.to_thread(
        query_collection,
        report_id,
        "dependencies imports packages requirements package.json requirements.txt "
        "pyproject.toml Cargo.toml go.mod pom.xml build.gradle",
        20,
    )

    repo_name = metadata.get("repo_name", "unknown")
    language  = metadata.get("language",  "unknown")
    framework = metadata.get("framework", "unknown")

    prompt = f"""You are a DevOps and dependency management expert.
Analyse the dependencies of the repository below.

Repository: {repo_name}
Language:   {language}
Framework:  {framework}

Relevant code / manifest context:
{context}

Write a detailed markdown Dependency Analysis Report covering:
1. Dependency Overview (total count, direct vs transitive vs dev)
2. Key Dependencies & Their Purposes
3. Outdated or Deprecated Packages
4. Security Vulnerabilities in Dependencies
5. Unused or Redundant Dependencies
6. Licensing Summary
7. Recommendations

---

After the markdown report, on a NEW LINE output EXACTLY this format
(replace with the REAL data extracted from the manifest files above):

DEPENDENCY_GRAPH_JSON: <json>

Where <json> is a single-line valid JSON object with this EXACT schema:

{{
  "nodes": [
    {{"id": "{repo_name}", "version": "", "type": "root"}},
    {{"id": "package_name", "version": "x.y.z", "type": "direct"}},
    {{"id": "another_pkg",  "version": "a.b.c", "type": "transitive"}},
    {{"id": "test_package", "version": "1.0.0", "type": "dev"}}
  ],
  "edges": [
    {{"from": "{repo_name}", "to": "package_name",  "type": "depends_on"}},
    {{"from": "package_name",  "to": "another_pkg", "type": "depends_on"}},
    {{"from": "{repo_name}", "to": "test_package",  "type": "dev_depends_on"}}
  ]
}}

RULES for the graph JSON:
- ALWAYS include the project root as a node with type "root" and id = repo name.
- Direct production dependencies: type = "direct"; edges go FROM root TO them.
- Transitive (indirect) dependencies: type = "transitive"; edges go FROM their parent TO them.
- Dev / test-only dependencies: type = "dev"; edges go FROM root TO them.
- Use REAL package names and versions from the manifest files. Do NOT invent packages.
- Output valid JSON on ONE single line after the DEPENDENCY_GRAPH_JSON: marker.
- Only output the JSON on that line — no trailing text."""

    return await call_llm(prompt)
