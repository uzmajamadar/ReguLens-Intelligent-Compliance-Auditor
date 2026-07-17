from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user, log_audit
from app.database import get_db
from app.embeddings import embed_texts
from app.file_storage import delete as delete_file, read_bytes as read_file, save as save_file
from app.ingestion import process_pdf
from app.models import Document, DocumentVersion, DocumentChunk, User
from app.vector_store import ensure_collection, upsert_chunks

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/upload", tags=["ingestion"])

COLLECTION_NAME = os.getenv("COLLECTION_NAME", "regulens_policies")
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024


class UploadResponse(BaseModel):
    document_id: int
    filename: str
    file_size_bytes: int
    page_count: int | None = None
    total_chunks: int | None = None
    has_ocr_pages: bool | None = None
    status: str
    collection_name: str
    upload_time: str
    version_number: int
    document_group_id: str | None = None
    message: str


def _get_or_create_group_id(db: Session, original_filename: str, organization_id: int) -> tuple[str, int]:
    existing = (
        db.query(Document)
        .filter(
            Document.original_filename == original_filename,
            Document.organization_id == organization_id,
            Document.status != "deleted",
        )
        .order_by(Document.version_number.desc())
        .first()
    )
    if existing and existing.document_group_id:
        return existing.document_group_id, existing.version_number + 1
    group_id = hashlib.md5(f"{original_filename}_{datetime.utcnow().isoformat()}".encode()).hexdigest()[:16]
    return group_id, 1


@router.post(
    "/",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a PDF for ingestion",
)
async def upload_pdf(
    file: UploadFile = File(..., description="PDF file to ingest"),
    frameworks: str = Query("", description="Comma-separated compliance frameworks e.g. 'GDPR,CCPA'"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UploadResponse:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are accepted. Please upload a .pdf file.",
        )

    file_bytes = await file.read()

    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty.",
        )

    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the 50 MB limit ({len(file_bytes) / 1_048_576:.1f} MB received).",
        )

    # ── Compute content hash for deduplication ─────────────────────────
    content_hash = hashlib.sha256(file_bytes).hexdigest()

    # Check for duplicate
    existing = (
        db.query(Document)
        .filter(
            Document.content_hash == content_hash,
            Document.organization_id == current_user.organization_id,
        )
        .first()
    )
    if existing:
        logger.info("Duplicate upload detected — returning existing document %d", existing.id)
        return UploadResponse(
            document_id=existing.id,
            filename=existing.filename,
            file_size_bytes=existing.file_size_bytes,
            page_count=existing.page_count or 0,
            total_chunks=existing.total_chunks or 0,
            has_ocr_pages=existing.has_ocr_pages or False,
            status=existing.status,
            collection_name=existing.collection_name or COLLECTION_NAME,
            upload_time=existing.upload_time.isoformat(),
            version_number=existing.version_number,
            document_group_id=existing.document_group_id,
            message="This file has already been uploaded.",
        )

    # ── Determine version group ─────────────────────────────────────────
    group_id, version_number = _get_or_create_group_id(db, file.filename, current_user.organization_id)

    import json
    framework_list = [f.strip() for f in frameworks.split(",") if f.strip()] if frameworks else []

    doc = Document(
        filename=file.filename,
        original_filename=file.filename,
        file_size_bytes=len(file_bytes),
        content_hash=content_hash,
        document_group_id=group_id,
        version_number=version_number,
        collection_name=COLLECTION_NAME,
        status="processing",
        upload_time=datetime.utcnow(),
        user_id=current_user.id,
        organization_id=current_user.organization_id,
        frameworks=json.dumps(framework_list) if framework_list else None,
    )
    db.add(doc)
    db.flush()

    logger.info(
        "Document %d created (group=%s v%d) — starting ingestion of '%s'",
        doc.id, group_id, version_number, file.filename,
    )

    # ── Save original file to storage (local disk or S3) ──────────────
    doc.file_path = save_file(doc.id, file.filename, file_bytes)

    # ── Step 1: Extract text + chunk ───────────────────────────────────
    try:
        result = process_pdf(file_bytes)

        doc.page_count = result.page_count
        doc.total_chunks = len(result.chunks)
        doc.has_ocr_pages = result.has_ocr_pages
        doc.full_text = result.full_text
        doc.status = "ready"

        logger.info(
            "Document %d extracted: %d pages, %d chunks, OCR=%s",
            doc.id, doc.page_count, doc.total_chunks, doc.has_ocr_pages,
        )

    except (ValueError, RuntimeError) as exc:
        doc.status = "failed"
        doc.error_message = str(exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        doc.status = "failed"
        doc.error_message = str(exc)
        logger.exception("Unexpected error extracting document %d", doc.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during PDF processing.",
        ) from exc

    # ── Step 2: Embed chunks + upsert to Qdrant ────────────────────────
    try:
        ensure_collection(doc.collection_name)
        embeddings = embed_texts(result.chunks)
        upsert_chunks(
            collection_name=doc.collection_name,
            document_id=doc.id,
            filename=doc.filename,
            chunks=result.chunks,
            embeddings=embeddings,
        )
        doc.status = "indexed"
        logger.info("Document %d indexed into Qdrant collection '%s'.", doc.id, doc.collection_name)

        # ── Persist chunks to document_chunks for cross-version diffing ──
        if result.chunk_metadata:
            import json as _json
            for cm in result.chunk_metadata:
                chunk_row = DocumentChunk(
                    document_id=doc.id,
                    version_number=version_number,
                    chunk_index=cm.chunk_index,
                    text=cm.text,
                    page_numbers=_json.dumps(cm.page_numbers),
                    section_heading=cm.section_heading,
                    section_path=cm.section_path,
                    content_hash=cm.content_hash,
                    embedding_stored=True,
                )
                db.add(chunk_row)
            db.flush()
            logger.info(
                "Document %d: persisted %d chunks with metadata to document_chunks.",
                doc.id, len(result.chunk_metadata),
            )

        # ── Auto-trigger scan for each framework assigned to the document ──
        fw_list = json.loads(doc.frameworks) if doc.frameworks else []
        if fw_list:
            from app.routers.versions import _run_auto_scan
            scan_status = _run_auto_scan(db, doc.id, fw_list, current_user)
            if scan_status:
                logger.info("Document %d auto-scanned for frameworks %s.", doc.id, fw_list)
            else:
                logger.warning("Auto-scan failed or skipped for document %d", doc.id)

        from app.notifications import notify_upload_complete
        notify_upload_complete(db, doc)

    except Exception as exc:
        logger.exception("Qdrant upsert failed for document %d", doc.id)
        doc.status = "failed"
        doc.error_message = f"Vector indexing failed: {exc}"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PDF extracted successfully but vector indexing failed. Please retry the upload.",
        ) from exc

    # ── Step 3 (or 4): Create immutable version snapshot ──────────────────────
    version = DocumentVersion(
        document_id=doc.id,
        version_number=version_number,
        filename=doc.filename,
        file_size_bytes=doc.file_size_bytes,
        page_count=doc.page_count,
        total_chunks=doc.total_chunks,
        has_ocr_pages=doc.has_ocr_pages,
        full_text=result.full_text,
    )
    db.add(version)
    log_audit(db, current_user.id, "upload", f"Uploaded '{file.filename}' (v{version_number}, {doc.total_chunks} chunks)")

    return UploadResponse(
        document_id=doc.id,
        filename=doc.filename,
        file_size_bytes=doc.file_size_bytes,
        page_count=doc.page_count,
        total_chunks=doc.total_chunks,
        has_ocr_pages=doc.has_ocr_pages,
        status=doc.status,
        collection_name=doc.collection_name,
        upload_time=doc.upload_time.isoformat(),
        version_number=doc.version_number,
        document_group_id=doc.document_group_id,
        message=(
            f"PDF ingested and indexed (v{doc.version_number}) into '{doc.collection_name}'."
            if doc.status in ("indexed", "scanned")
            else f"PDF extracted ({doc.total_chunks} chunks) but indexing failed."
        ),
    )
