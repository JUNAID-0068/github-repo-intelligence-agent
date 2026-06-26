"""
documentation.py
Generates comprehensive API and module documentation from repository code chunks.
"""

import asyncio
from embeddings.vectordb import query_collection
from llm.groq import call_llm


async def run_documentation_agent(report_id: int, metadata: dict) -> str:
    """
    Query the vector store for every function, class, route, and endpoint
    definition, then generate exhaustive structured API documentation.

    Args:
        report_id: ID of the report / ChromaDB collection to query.
        metadata:  Repository metadata dict from clone_repository().

    Returns:
        Markdown-formatted documentation report string.
    """
    # Query ChromaDB for both route/endpoint AND function/class definitions
    context = await asyncio.to_thread(
        query_collection,
        report_id,
        "API route endpoint POST GET PUT DELETE PATCH handler function class method export async return parameter",
        20,
    )

    repo_name = metadata.get("repo_name", "unknown")
    language  = metadata.get("language",  "unknown")
    framework = metadata.get("framework", "unknown")

    prompt = f"""You are a senior technical documentation engineer specialising in API documentation.
Your job is to produce COMPLETE, EXHAUSTIVE API documentation for the repository below.

Repository: {repo_name}
Language:   {language}
Framework:  {framework}

=== CODE CONTEXT (routes, endpoints, functions, classes) ===
{context}

---

CRITICAL INSTRUCTIONS:
1. You MUST document EVERY SINGLE API endpoint / route found in the code context.
   Do NOT skip any route. Include endpoints from ALL files (routers, controllers, views, handlers).
2. For each HTTP endpoint, use EXACTLY this structure:

### <HTTP_METHOD> <path>
**Description:** One-sentence summary of what this endpoint does.

**Parameters:**
| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| ...  | ... | ...  | Yes/No   | ...         |

**Request Body** (if applicable):
```json
{{ example request body }}
```

**Response:**
```json
{{ example response body }}
```

**Notes:** Any authentication requirements, rate limits, or edge cases.

---

3. Begin the document with:
   a. A **Module / API Overview** section (1–2 paragraphs describing the API purpose).
   b. A **Complete Endpoint Summary Table** listing ALL endpoints in one table:

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET    | /... | ...         | Yes/No        |

4. After all HTTP endpoints, add a **Public Functions & Classes** section documenting
   every exported function/class with: signature, description, parameters, return value, example.

5. End with a **Configuration & Environment Variables** section and a **Known Limitations / TODOs** section.

6. Format everything in clean GitHub-flavoured markdown.
   Use HTTP method names (GET, POST, PUT, DELETE, PATCH) in uppercase in all headings.
   Do not truncate or summarise — be exhaustive and complete."""

    return await call_llm(prompt)
