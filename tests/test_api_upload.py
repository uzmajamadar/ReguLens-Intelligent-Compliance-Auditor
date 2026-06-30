import pytest
from fastapi import status

class TestUploadEndpoint:
    """Tests for the PDF upload endpoint."""
    
    def test_upload_pdf_success(self, client, sample_pdf_bytes):
        """Test successful PDF upload returns correct response."""
        response = client.post(
            "/upload/",
            files={"file": ("policy.pdf", sample_pdf_bytes, "application/pdf")}
        )
        
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        
        # Verify response structure
        assert "document_id" in data
        assert "filename" in data
        assert "total_chunks" in data
        assert "page_count" in data
        assert "status" in data
        
        # Verify values
        assert data["filename"] == "policy.pdf"
        assert data["status"] in ("ready", "indexed")
        assert data["total_chunks"] > 0
        assert data["page_count"] > 0
    
    def test_upload_invalid_file_type(self, client):
        """Test that non-PDF files are rejected."""
        fake_data = b"This is not a PDF file"
        
        response = client.post(
            "/upload/",
            files={"file": ("document.txt", fake_data, "text/plain")}
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Only PDF files are accepted" in response.json()["detail"]
    
    def test_upload_missing_file(self, client):
        """Test that upload fails when no file is provided."""
        response = client.post("/upload/")
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    
    def test_upload_multiple_pdfs(self, client, sample_pdf_bytes):
        """Test uploading multiple PDFs creates separate documents."""
        # Upload first PDF
        res1 = client.post(
            "/upload/",
            files={"file": ("policy1.pdf", sample_pdf_bytes, "application/pdf")}
        )
        assert res1.status_code == status.HTTP_201_CREATED
        doc1_id = res1.json()["document_id"]
        
        # Upload second PDF
        res2 = client.post(
            "/upload/",
            files={"file": ("policy2.pdf", sample_pdf_bytes, "application/pdf")}
        )
        assert res2.status_code == status.HTTP_201_CREATED
        doc2_id = res2.json()["document_id"]
        
        # Verify different IDs
        assert doc1_id != doc2_id

class TestHealthEndpoint:
    """Tests for /health and utility endpoints."""
    
    def test_health_check(self, client):
        """Test health endpoint returns OK."""
        response = client.get("/health")
        
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["status"] == "ok"
        assert response.json()["service"] == "regulens-ai"
    
    def test_root_endpoint_redirects(self, client):
        """Test root endpoint redirects to /docs."""
        response = client.get("/", follow_redirects=False)
        assert response.status_code == status.HTTP_307_TEMPORARY_REDIRECT
        assert response.headers["location"] == "/docs"