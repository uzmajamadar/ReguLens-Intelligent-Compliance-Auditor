import asyncio
import json
import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Conversation, Document, Message, User
from groq import Groq

router = APIRouter(prefix="/groq", tags=["groq"])

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")


class ChatMessageRequest(BaseModel):
    content: str
    document_id: int | None = None


def _fallback_response(question: str):
    return (
        "I’m ready to help with compliance questions. "
        f"You asked: {question[:180]}"
        " If you add a valid Groq API key, I can generate richer answers."
    )


@router.post("/conversations/{conversation_id}/messages")
def send_message(
    conversation_id: int,
    payload: ChatMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if conversation is None:
        conversation = Conversation(id=conversation_id, title="Compliance Chat", user_id=current_user.id)
        if payload.document_id:
            conversation.document_id = payload.document_id
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
    elif payload.document_id and conversation.document_id is None:
        conversation.document_id = payload.document_id
        db.commit()

    db.add(Message(conversation_id=conversation.id, role="user", content=payload.content))
    db.commit()

    doc_text = ""
    doc_id = payload.document_id or conversation.document_id
    if doc_id is not None:
        doc = (
            db.query(Document)
            .filter(
                Document.id == doc_id,
                Document.organization_id == current_user.organization_id,
            )
            .first()
        )
        if doc and doc.full_text:
            doc_text = doc.full_text[:15000]

    async def stream_response():
        try:
            if not GROQ_API_KEY:
                text = _fallback_response(payload.content)
                for i in range(0, len(text), 24):
                    chunk = text[i : i + 24]
                    yield f"data: {json.dumps({'content': chunk})}\n\n"
                    await asyncio.sleep(0.02)
                yield "data: {\"done\": true}\n\n"
                return

            system_prompt = (
                "You are ReguLens AI, a compliance assistant. "
                "Answer concisely, helpfully, and grounded in the provided document. "
                "Do NOT use markdown formatting like ** or * for emphasis. "
                "Use plain text only. "
                "If the document text does NOT contain explicit page markers "
                "(e.g. '--- Page 1 ---'), do NOT mention any page numbers. "
                "Never invent or guess page numbers."
            )
            if doc_text:
                system_prompt += (
                    f"\n\nHere is the document the user is asking about:\n\n{doc_text}"
                )

            history = (
                db.query(Message)
                .filter(Message.conversation_id == conversation.id)
                .order_by(Message.created_at)
                .all()
            )

            groq_messages = [{"role": "system", "content": system_prompt}]
            for msg in history:
                groq_messages.append({"role": msg.role, "content": msg.content})

            client = Groq(api_key=GROQ_API_KEY)
            completion = client.chat.completions.create(
                model=GROQ_MODEL,
                messages=groq_messages,
                stream=True,
            )

            full_text = ""
            for chunk in completion:
                delta = getattr(chunk.choices[0], "delta", None)
                text = getattr(delta, "content", None) or ""
                if text:
                    full_text += text
                    yield f"data: {json.dumps({'content': text})}\n\n"

            db.add(Message(conversation_id=conversation.id, role="assistant", content=full_text))
            db.commit()
            yield "data: {\"done\": true}\n\n"

        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(stream_response(), media_type="text/event-stream")
