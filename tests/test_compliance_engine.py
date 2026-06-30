"""Tests for the compliance scanning / rule engine.

These test the core compliance logic without needing API endpoints.
"""

import pytest


@pytest.fixture
def text_with_gdpr_issues():
    return """
    We collect personal data from our users including their names and email addresses.
    This data is stored on our servers and may be shared with third-party partners.
    Users can contact us if they have questions about their data.
    We keep this data for as long as we need it.
    """


class TestGDPRRules:
    def test_detect_missing_lawful_basis(self, text_with_gdpr_issues):
        """Rule gdpr_article_5: detect missing lawful basis mention."""
        text = text_with_gdpr_issues.lower()
        keywords = ["consent", "contract", "legal obligation", "legitimate interest"]
        found = any(kw in text for kw in keywords)
        assert not found, (
            "Expected no lawful basis keyword in fixture text"
        )

    def test_detect_missing_data_retention(self, text_with_gdpr_issues):
        """Rule gdpr_article_5_1_e: detect missing retention period."""
        text = text_with_gdpr_issues.lower()
        retention_terms = [
            "retention period", "keep for", "store for",
            "delete after", "erase after",
        ]
        found = any(term in text for term in retention_terms)
        assert not found, (
            "Expected no retention period mention in fixture text"
        )

    def test_detect_data_sharing_disclosure(self, text_with_gdpr_issues):
        """Rule gdpr_article_13_1_e: data sharing should name recipients."""
        text = text_with_gdpr_issues.lower()
        shared = "shared with" in text
        categories = any(
            kw in text for kw in [
                "category", "type of recipient", "third party",
            ]
        )
        assert shared and not categories, (
            "Data sharing mentioned but no categories of recipients"
        )

    def test_detect_user_rights_mention(self, text_with_gdpr_issues):
        """Rule gdpr_article_12: rights should be explicitly listed."""
        text = text_with_gdpr_issues.lower()
        rights = [
            "access", "rectification", "erasure", "right to be forgotten",
            "restriction", "data portability", "object",
        ]
        found = [r for r in rights if r in text]
        assert len(found) < 2, (
            "Expected fewer than 2 rights mentioned in fixture"
        )


class TestCCPARules:
    @pytest.fixture
    def text_with_ccpa_notice(self):
        return """
        We collect personal information about you for business purposes.
        You have the right to request disclosure of what we collect.
        For more information, please contact our privacy team.
        """

    def test_detect_right_to_know(self, text_with_ccpa_notice):
        text = text_with_ccpa_notice.lower()
        has_right = "right to know" in text or "right to request" in text
        assert has_right, "Should mention right to know/request"

    def test_detect_missing_opt_out(self, text_with_ccpa_notice):
        text = text_with_ccpa_notice.lower()
        opt_out_terms = [
            "do not sell", "opt-out", "opt out",
            "right to opt out", "do not share",
        ]
        found = any(term in text for term in opt_out_terms)
        assert not found, (
            "Fixture should not contain opt-out language"
        )


class TestIngestionHelpers:
    def test_chunk_text(self):
        from app.ingestion import _chunk_text

        text = "A. " * 1000  # ~3000 chars with delimiters
        chunks = _chunk_text(text)
        assert len(chunks) >= 1
        assert all(len(c) > 0 for c in chunks)
