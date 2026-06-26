"""
embed.py
Generates sentence embeddings for code/text chunks using
the all-MiniLM-L6-v2 sentence-transformer model.
"""

from sentence_transformers import SentenceTransformer

# Load the model once at module level so it is reused across calls
_MODEL_NAME = "all-MiniLM-L6-v2"
_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    """Lazy-load and cache the embedding model."""
    global _model
    if _model is None:
        _model = SentenceTransformer(_MODEL_NAME)
    return _model


def generate_embeddings(chunks: list) -> list:
    """
    Generate embedding vectors for a list of chunk dicts.

    Parameters
    ----------
    chunks : list[dict]
        Each dict must contain at least a ``"content"`` key whose value is
        the text to embed.

    Returns
    -------
    list[list[float]]
        A list of embedding vectors (one per chunk), in the same order as
        the input list.
    """
    model = _get_model()
    texts = [chunk["content"] for chunk in chunks]
    embeddings = model.encode(texts, show_progress_bar=True)
    # Convert numpy arrays to plain Python lists for JSON / ChromaDB compat
    return [emb.tolist() for emb in embeddings]
