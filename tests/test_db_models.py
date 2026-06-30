import pytest
from datetime import datetime
from app.models import Document, AuditFeedback

class TestDocumentModel:
    """Tests for Document model."""
    
    def test_create_document(self, test_db):
        """Test creating a document record."""
        doc = Document(
            id=10,
            filename="privacy_policy.pdf",
            original_filename="privacy_policy.pdf",
            file_size_bytes=1024,
            page_count=14,
            status="indexed"
        )
        test_db.add(doc)
        test_db.commit()
        
        retrieved = test_db.query(Document).filter(
            Document.id == 10
        ).first()
        
        assert retrieved is not None
        assert retrieved.filename == "privacy_policy.pdf"
        assert retrieved.page_count == 14
        assert retrieved.status == "indexed"

class TestAuditFeedbackModel:
    """Tests for AuditFeedback model."""
    
    def test_create_feedback(self, test_db):
        """Test creating an audit feedback record."""
        fb = AuditFeedback(
            collection_name="test_collection",
            rule_id="gdpr_article_5",
            status="confirmed",
            notes="Confirmed violation."
        )
        test_db.add(fb)
        test_db.commit()
        
        retrieved = test_db.query(AuditFeedback).filter(
            AuditFeedback.collection_name == "test_collection"
        ).first()
        
        assert retrieved is not None
        assert retrieved.rule_id == "gdpr_article_5"
        assert retrieved.status == "confirmed"
        assert retrieved.notes == "Confirmed violation."