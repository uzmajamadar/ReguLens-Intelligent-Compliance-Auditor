"""
app/vector_store.py — Qdrant client + collection management + CRUD.

Supports two modes:
  1. Cloud:  set QDRANT_URL + QDRANT_API_KEY
  2. Local:  set QDRANT_PATH (default: ./qdrant_data)

If both are set, cloud takes priority. If neither is set, local at ./qdrant_data is used.
"""
from __future__ import annotations

import logging
import os
import uuid

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

from app.embeddings import EMBED_DIM

logger = logging.getLogger(__name__)

QDRANT_URL = os.getenv("QDRANT_URL", "")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", "")
QDRANT_PATH = os.getenv("QDRANT_PATH", "./qdrant_data")

_client: QdrantClient | None = None


# ---------------------------------------------------------------------------
# Client singleton
# ---------------------------------------------------------------------------

def get_client() -> QdrantClient:
    global _client
    if _client is None:
        if QDRANT_URL:
            logger.info("Connecting to Qdrant Cloud at %s", QDRANT_URL)
            _client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
        else:
            logger.info("Using local Qdrant at '%s'", QDRANT_PATH)
            _client = QdrantClient(path=QDRANT_PATH)
        logger.info("Qdrant client ready.")
    return _client


# ---------------------------------------------------------------------------
# Collection management
# ---------------------------------------------------------------------------

def ensure_collection(collection_name: str) -> None:
    """Create the collection if it does not already exist."""
    client = get_client()
    existing = {c.name for c in client.get_collections().collections}
    if collection_name not in existing:
        logger.info("Creating Qdrant collection '%s' (dim=%d, Cosine).", collection_name, EMBED_DIM)
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE),
        )
    else:
        logger.debug("Collection '%s' already exists.", collection_name)


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------

def upsert_chunks(
    collection_name: str,
    document_id: int,
    filename: str,
    chunks: list[str],
    embeddings: list[list[float]],
) -> int:
    """
    Upsert all chunk embeddings for a document.

    Each point payload stores:
      - document_id  → links back to the SQLite Document row
      - filename     → human-readable source reference
      - chunk_index  → position within the document
      - text         → the raw chunk text (returned in query results)

    Returns the number of points upserted.
    """
    client = get_client()
    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=embedding,
            payload={
                "document_id": document_id,
                "filename": filename,
                "chunk_index": i,
                "text": chunk,
            },
        )
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings))
    ]
    client.upsert(collection_name=collection_name, points=points)
    logger.info(
        "Upserted %d points for document %d into '%s'.",
        len(points), document_id, collection_name,
    )
    return len(points)


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

def delete_document_points(collection_name: str, document_id: int) -> int:
    """Delete all Qdrant points for a given document_id from a collection."""
    client = get_client()
    result = client.delete(
        collection_name=collection_name,
        points_selector=Filter(
            must=[FieldCondition(key="document_id", match=MatchValue(value=document_id))]
        ),
    )
    logger.info("Deleted Qdrant points for document %d from '%s'.", document_id, collection_name)
    return getattr(result, "count", 0)


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

def similarity_search(
    collection_name: str,
    query_vector: list[float],
    top_k: int = 5,
    query_filter: Filter | None = None,
):
    """
    Return the top_k most similar chunks for a query vector.

    Optionally filter by document payload fields (e.g. document_id).

    Each result (ScoredPoint) has:
      .id       — Qdrant point UUID
      .score    — cosine similarity (0–1, higher = more relevant)
      .payload  — dict with text, document_id, filename, chunk_index
    """
    client = get_client()
    response = client.query_points(
        collection_name=collection_name,
        query=query_vector,
        limit=top_k,
        with_payload=True,
        query_filter=query_filter,
    )
    return response.points
