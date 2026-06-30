"""
app/embeddings.py — Singleton HuggingFace embedding model.

Uses BAAI/bge-small-en-v1.5 (384 dims, ~90 MB, fully free, no API key needed).
The model is downloaded from HuggingFace Hub on first use and cached locally.
"""
from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

# Configurable via env; defaults to a compact, high-quality model
EMBED_MODEL_NAME = os.getenv("EMBED_MODEL", "BAAI/bge-small-en-v1.5")
EMBED_DIM = 384  # fixed for bge-small-en-v1.5

_embed_model: Any = None


def get_embed_model() -> Any:
    """Lazily initialise and return the singleton embedding model."""
    global _embed_model
    if _embed_model is None:
        from llama_index.embeddings.huggingface import HuggingFaceEmbedding

        logger.info("Loading embedding model '%s' (first call — may download ~90 MB)…", EMBED_MODEL_NAME)
        _embed_model = HuggingFaceEmbedding(model_name=EMBED_MODEL_NAME)
        logger.info("Embedding model ready.")
    return _embed_model


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of document chunks (uses get_text_embedding internally)."""
    model = get_embed_model()
    return [model.get_text_embedding(t) for t in texts]


def embed_query(text: str) -> list[float]:
    """
    Embed a single query string.
    bge models have separate query/document prompts for better retrieval accuracy.
    """
    model = get_embed_model()
    return model.get_query_embedding(text)
