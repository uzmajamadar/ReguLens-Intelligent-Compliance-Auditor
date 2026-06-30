#!/usr/bin/env python3
"""
tests/create_test_pdf.py
Generate a sample PDF for ReguLens testing.

Usage:
    python tests/create_test_pdf.py
"""

import os


def create_test_pdf():
    """Create a sample PDF with compliance-related content."""
    try:
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
    except ImportError:
        print("Error: reportlab not installed.")
        print("Install with: pip install reportlab")
        return False
    
    os.makedirs('tests/fixtures', exist_ok=True)
    pdf_path = 'tests/fixtures/sample.pdf'
    
    c = canvas.Canvas(pdf_path, pagesize=letter)
    width, height = letter
    
    # Page 1
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, height - 50, "Privacy Policy and Data Protection Agreement")
    
    c.setFont("Helvetica", 10)
    y = height - 80
    
    content = [
        ("1. Data Collection and Processing", 12, True),
        ("We collect personal data for the following purposes:", 10, False),
        ("- Customer identification and service delivery", 10, False),
        ("- Analytics and service improvement", 10, False),
        ("- Marketing communications (with consent)", 10, False),
        ("", 10, False),
        ("The lawful basis for processing is Article 6(1) of the GDPR.", 10, False),
        ("Specifically: (a) Performance of contract, (b) Legal obligation, (c) Legitimate interest", 10, False),
        ("", 10, False),
        
        ("2. Data Retention Periods", 12, True),
        ("We retain personal data as follows:", 10, False),
        ("- Customer personal data: 3 years after last transaction", 10, False),
        ("- Employee records: 7 years after employment ends", 10, False),
        ("- Marketing opt-in records: 2 years from last interaction", 10, False),
        ("- Transaction logs: 5 years for tax compliance", 10, False),
        ("", 10, False),
        
        ("3. Data Subject Rights", 12, True),
        ("Under GDPR Articles 12-22, data subjects have the right to:", 10, False),
        ("- Access their personal data (Article 15)", 10, False),
        ("- Rectification of inaccurate data (Article 16)", 10, False),
        ("- Erasure/Right to be forgotten (Article 17)", 10, False),
        ("- Restrict processing (Article 18)", 10, False),
        ("- Data portability (Article 20)", 10, False),
        ("- Object to processing (Article 21)", 10, False),
        ("", 10, False),
        ("Requests should be submitted in writing to: privacy@company.com", 10, False),
        ("We will respond within 30 days (extendable to 90 days).", 10, False),
    ]
    
    for line, size, bold in content:
        if bold:
            c.setFont("Helvetica-Bold", size)
        else:
            c.setFont("Helvetica", size)
        
        if y < 100:
            c.showPage()
            y = height - 50
        
        if line:
            c.drawString(50, y, line)
        y -= size + 5
    
    # Page 2
    c.showPage()
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, height - 50, "4. Third-Party Data Sharing")
    
    c.setFont("Helvetica", 10)
    y = height - 80
    
    page2_content = [
        ("We may share personal data with the following categories of processors:", 10, False),
        ("", 10, False),
        ("Payment Processors:", 10, False),
        ("- We use Stripe for payment processing", 10, False),
        ("- Data Processor Agreement in place (Article 28)", 10, False),
        ("- Standard Contractual Clauses for EU-US transfers", 10, False),
        ("", 10, False),
        
        ("Analytics Platforms:", 10, False),
        ("- Google Analytics for website traffic analysis", 10, False),
        ("- Data shared: Anonymous user behavior only", 10, False),
        ("- No personal data transferred", 10, False),
        ("", 10, False),
        
        ("HR Management System:", 10, False),
        ("- Workday used for employee data management", 10, False),
        ("- Data Processor Agreement signed March 2024", 10, False),
        ("- Sub-processor list available upon request", 10, False),
        ("", 10, False),
        
        ("5. Data Breach Notification", 12, True),
        ("In the event of a personal data breach:", 10, False),
        ("", 10, False),
        ("- We will notify relevant supervisory authority within 72 hours", 10, False),
        ("  (unless the breach is unlikely to result in risk)", 10, False),
        ("- Affected individuals will be notified without undue delay", 10, False),
        ("- A detailed breach report will be maintained in our incident log", 10, False),
        ("", 10, False),
        ("Breach contacts:", 10, False),
        ("- Data Protection Officer: dpo@company.com", 10, False),
        ("- Incident Response Team: security@company.com", 10, False),
    ]
    
    for line, size, bold in page2_content:
        if bold:
            c.setFont("Helvetica-Bold", size)
        else:
            c.setFont("Helvetica", size)
        
        if y < 50:
            c.showPage()
            y = height - 50
        
        if line:
            c.drawString(50, y, line)
        y -= size + 4
    
    # Add footer with page numbers
    c.setFont("Helvetica", 8)
    for page_num in range(1, c.getPageNumber() + 1):
        c.drawString(width - 100, 30, f"Page {page_num}")
    
    c.save()
    return True


def main():
    """Main entry point."""
    print("Generating test PDF...")
    if create_test_pdf():
        print("✓ Successfully created tests/fixtures/sample.pdf")
        print("  You can now run tests with: pytest tests/ -v")
    else:
        print("✗ Failed to create test PDF")
        print("  To create it manually, install reportlab: pip install reportlab")
        print("  Then run: python tests/create_test_pdf.py")


if __name__ == "__main__":
    main()