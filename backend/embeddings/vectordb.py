"""
vectordb.py
ChromaDB helper functions for storing and querying repository chunk embeddings.
"""

import os

import chromadb
from dotenv import load_dotenv

load_dotenv()

# ── ChromaDB client ─────────────────────────────────────────────────────────
_CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")

_client = chromadb.PersistentClient(path=_CHROMA_PERSIST_DIR)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _collection_name(repo_id: int) -> str:
    return f"repo_{repo_id}"


# ── Public API ───────────────────────────────────────────────────────────────

def create_collection(repo_id: int):
    """
    Create a new ChromaDB collection for the given repository.

    If a collection with the same name already exists it is deleted first so
    that a clean, empty collection is always returned.

    Parameters
    ----------
    repo_id : int
        Unique identifier for the repository.

    Returns
    -------
    chromadb.Collection
        The newly created collection.
    """
    name = _collection_name(repo_id)
    # Delete existing collection if present
    existing = [c.name for c in _client.list_collections()]
    if name in existing:
        _client.delete_collection(name=name)
    return _client.create_collection(name=name)


def store_chunks(repo_id: int, chunks: list, embeddings: list) -> None:
    """
    Persist chunks and their embeddings into the repository's ChromaDB collection.

    Parameters
    ----------
    repo_id : int
        Unique identifier for the repository.
    chunks : list[dict]
        Each dict must have ``"content"``, ``"file_path"``, and ``"type"`` keys.
    embeddings : list[list[float]]
        Pre-computed embedding vectors corresponding 1-to-1 with ``chunks``.
    """
    collection = _client.get_collection(name=_collection_name(repo_id))

    documents = [chunk["content"] for chunk in chunks]
    metadatas = [
        {
            "file_path": chunk["file_path"],
            "type": chunk["type"],
        }
        for chunk in chunks
    ]
    ids = [f"chunk_{repo_id}_{i}" for i in range(len(chunks))]

    collection.add(
        documents=documents,
        embeddings=embeddings,
        metadatas=metadatas,
        ids=ids,
    )


def query_collection(
    repo_id: int,
    query_text: str,
    n_results: int = 10,
) -> str:
    """
    Query the repository's ChromaDB collection with free-form text.

    Parameters
    ----------
    repo_id : int
        Unique identifier for the repository.
    query_text : str
        The natural-language (or code) query string.
    n_results : int, optional
        Maximum number of top results to return (default: 10).

    Returns
    -------
    str
        The top matching documents concatenated into a single string,
        separated by newlines.
    """
    collection = _client.get_collection(name=_collection_name(repo_id))

    # Guard: ChromaDB raises if n_results > number of documents in the collection
    doc_count = collection.count()
    safe_n = min(n_results, doc_count) if doc_count > 0 else 1

    results = collection.query(
        query_texts=[query_text],
        n_results=safe_n,
    )
    # results["documents"] is a list-of-lists (one list per query)
    docs: list[str] = results["documents"][0] if results["documents"] else []
    return "\n".join(docs)


def delete_collection(repo_id: int) -> None:
    """
    Delete the ChromaDB collection for the given repository.

    Parameters
    ----------
    repo_id : int
        Unique identifier for the repository.
    """
    name = _collection_name(repo_id)
    existing = [c.name for c in _client.list_collections()]
    if name in existing:
        _client.delete_collection(name=name)
