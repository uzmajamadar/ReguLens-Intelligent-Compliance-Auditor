"""
routers/query.py — POST /query endpoint.

RAG pipeline:
  1. Embed the user's question (bge-small-en-v1.5)
  2. Similarity search in Qdrant → top-K chunks
  3. Build a context-grounded prompt
  4. Call Groq LLM (llama-3.1-8b-instant) for the answer
  5. Return answer + source chunks with scores
"""
from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Depends, HTTPException, status
from groq import Groq
from pydantic import BaseModel, Field

from app.auth import get_current_user
from app.embeddings import embed_query
from app.models import User
from app.vector_store import similarity_search

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/query", tags=["RAG"])

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "regulens_policies")
GROQ_MODEL = "llama-3.1-8b-instant"  # free-tier Groq model

SYSTEM_PROMPT = """You are a compliance document assistant.
Answer the user's question using ONLY the context chunks provided.
- Be concise and precise.
- If multiple chunks are relevant, synthesise them into a coherent answer.
- If the answer is not contained in the context, respond exactly with:
  "I don't have enough information in the provided documents to answer this question."
- Do NOT fabricate information."""


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class QueryRequest(BaseModel):
    question: str = Field(..., min_length=3, description="Natural language question to answer")
    collection_name: str = Field(default=COLLECTION_NAME, description="Qdrant collection to search")
    top_k: int = Field(default=5, ge=1, le=20, description="Number of chunks to retrieve")


class SourceChunk(BaseModel):
    text: str
    document_id: int
    filename: str
    chunk_index: int
    score: float


class QueryResponse(BaseModel):
    question: str
    answer: str
    sources: list[SourceChunk]
    model: str
    chunks_retrieved: int


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post(
    "/",
    response_model=QueryResponse,
    summary="Query documents with RAG",
    description=(
        "Embeds your question, retrieves the top-K relevant chunks from Qdrant, "
        "and uses Groq (llama-3.1-8b-instant) to generate a grounded answer."
    ),
)
def query_documents(
    req: QueryRequest,
    current_user: User = Depends(get_current_user),
) -> QueryResponse:
    if not GROQ_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GROQ_API_KEY is not configured.",
        )

    # ── Step 1: Embed the question ─────────────────────────────────────
    try:
        query_vec = embed_query(req.question)
    except Exception as exc:
        logger.exception("Embedding failed for query")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Embedding error: {exc}",
        ) from exc

    # ── Step 2: Retrieve chunks from Qdrant ───────────────────────────
    try:
        results = similarity_search(req.collection_name, query_vec, top_k=req.top_k)
    except Exception as exc:
        logger.exception("Qdrant search failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Vector search error: {exc}",
        ) from exc

    if not results:
        return QueryResponse(
            question=req.question,
            answer="I don't have enough information in the provided documents to answer this question.",
            sources=[],
            model=GROQ_MODEL,
            chunks_retrieved=0,
        )

    # ── Step 3: Build context ──────────────────────────────────────────
    context_parts = [
        f"[Source {i + 1} — {r.payload.get('filename', 'unknown')}, chunk {r.payload.get('chunk_index', i)}]\n{r.payload['text']}"
        for i, r in enumerate(results)
    ]
    context = "\n\n---\n\n".join(context_parts)

    user_message = f"""Context:
{context}

Question: {req.question}

Answer:"""

    # ── Step 4: Call Groq ──────────────────────────────────────────────
    try:
        groq_client = Groq(api_key=GROQ_API_KEY)
        completion = groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0.1,      # low temp = factual, deterministic answers
            max_tokens=1024,
        )
    except Exception as exc:
        logger.exception("Groq API call failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM error: {exc}",
        ) from exc

    answer = completion.choices[0].message.content.strip()

    # ── Step 5: Build response ─────────────────────────────────────────
    sources = [
        SourceChunk(
            text=r.payload["text"],
            document_id=r.payload.get("document_id", -1),
            filename=r.payload.get("filename", "unknown"),
            chunk_index=r.payload.get("chunk_index", i),
            score=round(r.score, 4),
        )
        for i, r in enumerate(results)
    ]

    logger.info(
        "Query answered: %d chunks retrieved, model=%s",
        len(results), completion.model,
    )

    return QueryResponse(
        question=req.question,
        answer=answer,
        sources=sources,
        model=completion.model,
        chunks_retrieved=len(results),
    )
