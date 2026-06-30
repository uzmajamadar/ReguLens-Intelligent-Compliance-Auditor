import pytest
from app.ingestion import process_pdf, ExtractionResult

class TestPDFIngestion:
    """Tests for the PDF ingestion pipeline."""
    
    def test_process_pdf_success(self, sample_pdf_bytes):
        """Test processing a valid PDF file."""
        result = process_pdf(sample_pdf_bytes)
        
        assert isinstance(result, ExtractionResult)
        assert result.page_count > 0
        assert len(result.pages) == result.page_count
        assert len(result.full_text) > 0
        assert len(result.chunks) > 0
        
        # Verify page contents
        for page in result.pages:
            assert page.page_num >= 1
            assert isinstance(page.text, str)
            assert isinstance(page.used_ocr, bool)

    def test_process_invalid_pdf(self):
        """Test processing an invalid PDF file raises ValueError."""
        with pytest.raises(ValueError):
            process_pdf(b"This is not a PDF")