"""
app/compliance_rules.py — Definitions for 15 GDPR / HR compliance rules.

Each rule carries:
  - id            : short slug used as dict key
  - name          : human-readable title
  - regulation    : parent regulation (GDPR / HR)
  - article       : article / section reference
  - search_query  : semantic query sent to Qdrant to retrieve relevant chunks
  - check_question: the compliance question injected into the Groq prompt
  - max_severity  : worst-case severity if this rule is violated (used for scoring)
"""
from __future__ import annotations
from dataclasses import dataclass


@dataclass(frozen=True)
class ComplianceRule:
    id: str
    name: str
    regulation: str
    article: str
    search_query: str
    check_question: str
    max_severity: str  # low | medium | high | critical
    detailed_checks: str = ""  # sub-checks for deeper multi-factor analysis


# ---------------------------------------------------------------------------
# Rule catalogue
# ---------------------------------------------------------------------------

RULES: list[ComplianceRule] = [
    # ── GDPR ──────────────────────────────────────────────────────────────
    ComplianceRule(
        id="gdpr_art6_lawful_basis",
        name="Lawfulness of Processing",
        regulation="GDPR",
        article="Art. 6",
        search_query="legal basis processing personal data consent contract legitimate interest",
        check_question=(
            "Does this document identify a clear and specific legal basis for processing "
            "personal data (e.g. consent, contract, legal obligation, legitimate interest)?"
        ),
        max_severity="critical",
    ),
    ComplianceRule(
        id="gdpr_art7_consent",
        name="Conditions for Consent",
        regulation="GDPR",
        article="Art. 7",
        search_query="consent freely given specific informed unambiguous withdrawal",
        check_question=(
            "Is consent obtained in a freely given, specific, informed, and unambiguous way? "
            "Can users withdraw consent as easily as they give it?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) consent is freely given (not bundled with terms of service, "
            "no coercion or imbalance of power), "
            "(b) consent is specific to each processing purpose (no blanket consent), "
            "(c) consent is informed (data subjects know what they are consenting to), "
            "(d) consent is unambiguous (clear affirmative action, not pre-ticked boxes or silence), "
            "(e) withdrawal mechanism is as easy as giving consent (same number of steps), "
            "(f) data subjects are informed of the right to withdraw before giving consent, "
            "(g) consent is demonstrable (records of consent obtained)."
        ),
    ),
    ComplianceRule(
        id="gdpr_art13_transparency",
        name="Transparency & Privacy Notice",
        regulation="GDPR",
        article="Art. 13",
        search_query="privacy notice information identity controller purposes retention rights",
        check_question=(
            "Does the document provide all required privacy notice information: identity of the "
            "controller, purposes, retention periods, and data subject rights?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) identity and contact details of the controller, "
            "(b) contact details of the Data Protection Officer (if applicable), "
            "(c) purposes and legal basis for each processing activity, "
            "(d) legitimate interests pursued by controller (if relied upon), "
            "(e) recipients or categories of recipients of personal data, "
            "(f) retention periods or criteria used to determine them, "
            "(g) existence of each data subject right (access, rectification, erasure, "
            "restriction, portability, objection, automated decisions), "
            "(h) right to withdraw consent at any time, "
            "(i) right to lodge a complaint with a supervisory authority, "
            "(j) whether providing data is a statutory/contractual requirement and consequences of not providing it, "
            "(k) existence of automated decision-making including profiling and meaningful information about the logic."
        ),
    ),
    ComplianceRule(
        id="gdpr_art17_erasure",
        name="Right to Erasure",
        regulation="GDPR",
        article="Art. 17",
        search_query="right to erasure deletion personal data request removal forget",
        check_question=(
            "Does the document acknowledge and describe a process for the right to erasure "
            "(right to be forgotten), including when it applies and any exceptions?"
        ),
        max_severity="high",
    ),
    ComplianceRule(
        id="gdpr_art20_portability",
        name="Right to Data Portability",
        regulation="GDPR",
        article="Art. 20",
        search_query="data portability transfer structured machine readable format",
        check_question=(
            "Does the document acknowledge the right to data portability, allowing data subjects "
            "to receive their data in a structured, machine-readable format?"
        ),
        max_severity="medium",
    ),
    ComplianceRule(
        id="gdpr_art25_privacy_by_design",
        name="Privacy by Design & Default",
        regulation="GDPR",
        article="Art. 25",
        search_query="data minimization privacy design default technical organizational measures",
        check_question=(
            "Does the document demonstrate privacy by design (data minimization, purpose "
            "limitation) and privacy by default (most privacy-friendly settings by default)?"
        ),
        max_severity="high",
    ),
    ComplianceRule(
        id="gdpr_art32_security",
        name="Security of Processing",
        regulation="GDPR",
        article="Art. 32",
        search_query="data security encryption pseudonymisation technical organizational measures",
        check_question=(
            "Does the document describe appropriate technical and organizational security "
            "measures such as encryption, pseudonymisation, access controls, or regular testing?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) pseudonymisation and encryption of personal data, "
            "(b) ability to ensure ongoing confidentiality, integrity, availability and resilience, "
            "(c) ability to restore access to data after a physical or technical incident, "
            "(d) regular testing and evaluation of security measures, "
            "(e) access controls and least-privilege principle, "
            "(f) staff training and awareness on data security, "
            "(g) process for regular security audits or penetration testing."
        ),
    ),
    ComplianceRule(
        id="gdpr_art33_breach_notification",
        name="Data Breach Notification",
        regulation="GDPR",
        article="Art. 33",
        search_query="data breach notification supervisory authority 72 hours incident response",
        check_question=(
            "Does the document include a data breach notification procedure, specifying "
            "the 72-hour notification requirement to supervisory authorities?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) 72-hour notification timeline to supervisory authority, "
            "(b) content requirements for notification (nature of breach, categories, approx count, "
            "contact details, likely consequences, measures taken), "
            "(c) communication to affected data subjects without undue delay, "
            "(d) obligation to document all breaches (not just notifiable ones), "
            "(e) designated contact person for breach reporting."
        ),
    ),
    ComplianceRule(
        id="gdpr_art35_dpia",
        name="Data Protection Impact Assessment",
        regulation="GDPR",
        article="Art. 35",
        search_query="DPIA impact assessment high risk systematic monitoring large scale",
        check_question=(
            "Where high-risk processing is described, does the document reference "
            "a Data Protection Impact Assessment (DPIA) requirement?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) DPIA required for high-risk processing (systematic profiling, "
            "large-scale special category data, public area monitoring on large scale), "
            "(b) DPIA process described (systematic description, necessity/proportionality assessment, "
            "risk assessment, risk mitigation measures), "
            "(c) prior consultation with supervisory authority if high risk remains, "
            "(d) DPIA is reviewed and updated when processing changes."
        ),
    ),
    ComplianceRule(
        id="gdpr_art44_international_transfers",
        name="International Data Transfers",
        regulation="GDPR",
        article="Art. 44–49",
        search_query="transfer personal data third country adequacy standard contractual clauses",
        check_question=(
            "If personal data is transferred outside the EEA, does the document ensure "
            "an adequate transfer mechanism (adequacy decision, SCCs, BCRs)?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) any mention of transfers outside EEA, "
            "(b) adequacy decision by European Commission for the recipient country, "
            "(c) Standard Contractual Clauses (SCCs) as transfer mechanism, "
            "(d) Binding Corporate Rules (BCRs) if applicable, "
            "(e) Transfer Impact Assessment (TIA) requirement, "
            "(f) supplementary measures if SCCs alone are insufficient, "
            "(g) onward transfer restrictions to third parties."
        ),
    ),
    # ── Guardrails & Safety Policy ────────────────────────────────────────
    ComplianceRule(
        id="gs_fallback_mechanics",
        name="Fallback Mechanics for Missing Data",
        regulation="Guardrails & Safety",
        article="Fallback Mechanics",
        search_query="fallback response no data found hallucination prevent standard message",
        check_question=(
            "Does this document define an explicit fallback mechanism for when no relevant "
            "data is found, requiring a standardized response (e.g. 'I cannot find an official "
            "policy on this topic; please contact HR.') rather than allowing hallucination?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) a standardized fallback response is defined for missing data, "
            "(b) the fallback explicitly avoids generating fabricated information, "
            "(c) the fallback provides a clear next step for the user (e.g. contact HR, legal), "
            "(d) the system logs or flags queries that triggered fallback responses, "
            "(e) fallback behavior is tested and enforced in all output paths."
        ),
    ),
    ComplianceRule(
        id="gs_contradiction_resolution",
        name="Contradiction Resolution Policy",
        regulation="Guardrails & Safety",
        article="Contradiction Resolution Policy",
        search_query="policy conflict contradiction resolution most recent document escalate human",
        check_question=(
            "Does this document establish a deterministic logic flow for resolving conflicts "
            "when two active policies contradict each other, such as defaulting to the most "
            "recently updated document or escalating to a human manager?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) a clear conflict resolution rule is defined (e.g. newest policy wins), "
            "(b) escalation path to a human reviewer is specified for unresolvable conflicts, "
            "(c) the system detects and flags contradictory policy content, "
            "(d) the resolution logic is deterministic (not probabilistic or LLM-dependent), "
            "(e) users are informed when their query touches conflicting policies."
        ),
    ),
    # ── Document Lifecycle & Grounding Policy ────────────────────────────
    ComplianceRule(
        id="dlg_version_control",
        name="Version Control & Policy Refresh",
        regulation="Document Lifecycle & Grounding",
        article="Version Control Rules",
        search_query="document version control archive expired policy replace active refresh lifecycle",
        check_question=(
            "Does this document include a version control policy that mandates automatic "
            "archival of expired policies and replacement with current active versions "
            "to prevent conflicting information?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) version numbering or dating system for policy documents, "
            "(b) process for identifying and flagging expired/outdated policies, "
            "(c) automatic archival mechanism for superseded versions, "
            "(d) replacement procedure ensuring active policies are the ones served, "
            "(e) audit trail of when policies were archived/replaced."
        ),
    ),
    ComplianceRule(
        id="dlg_structured_chunking",
        name="Structured Chunking & Context Preservation",
        regulation="Document Lifecycle & Grounding",
        article="Structured Chunking Rules",
        search_query="document chunking structure headings sub-clauses lists context preservation",
        check_question=(
            "Does this document require structure-aware chunking that preserves headings, "
            "sub-clauses, and lists intact so that the full context of a legal rule is maintained?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) headings and sub-headings are preserved in document processing, "
            "(b) sub-clauses and nested lists remain intact (not flattened or separated), "
            "(c) cross-references between sections are maintained, "
            "(d) document structure hierarchy is reflected in chunk boundaries, "
            "(e) no splitting of a single rule/clause across multiple chunks."
        ),
    ),
    ComplianceRule(
        id="dlg_source_attribution",
        name="Deterministic Source Attribution",
        regulation="Document Lifecycle & Grounding",
        article="Deterministic Source Attribution",
        search_query="source attribution citation document name page number section link exact reference",
        check_question=(
            "Does this document enforce deterministic source attribution, requiring that every "
            "answer or output must include exact citations (document name, page number, or section link)?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) document name is always cited with each answer, "
            "(b) page number or section identifier is provided for each cited fact, "
            "(c) citations are specific enough to locate the exact supporting text, "
            "(d) no unsourced claims or statements in system outputs, "
            "(e) citation format is consistent and machine-readable where applicable."
        ),
    ),
    # ── HR Regulations ────────────────────────────────────────────────────
    ComplianceRule(
        id="hr_employee_data_retention",
        name="Employee Data Retention Policy",
        regulation="HR",
        article="HR Policy",
        search_query="employee data retention period deletion archival HR records",
        check_question=(
            "Does the document define clear retention periods for employee personal data "
            "and describe the deletion or anonymisation process after the period expires?"
        ),
        max_severity="medium",
    ),
    ComplianceRule(
        id="hr_employee_monitoring",
        name="Employee Monitoring Disclosure",
        regulation="HR",
        article="HR Policy / GDPR Art. 88",
        search_query="employee monitoring surveillance tracking email internet workplace",
        check_question=(
            "If workplace monitoring (email, internet, CCTV, location) is performed, "
            "does the document disclose this clearly to employees with a lawful basis?"
        ),
        max_severity="high",
    ),
    ComplianceRule(
        id="hr_non_discrimination",
        name="Non-Discrimination & Equal Opportunity",
        regulation="HR",
        article="Employment Equality Law",
        search_query="equal opportunity non-discrimination protected characteristics race gender religion",
        check_question=(
            "Does the document include a non-discrimination and equal opportunity policy "
            "covering protected characteristics (race, gender, religion, disability, etc.)?"
        ),
        max_severity="high",
    ),
    ComplianceRule(
        id="hr_access_to_records",
        name="Employee Access to Personal Records",
        regulation="HR",
        article="HR Policy / GDPR Art. 15",
        search_query="employee access personal records review right to access HR file",
        check_question=(
            "Does the document confirm employees' right to access and review their own "
            "personal HR records and data held by the employer?"
        ),
        max_severity="medium",
    ),
    ComplianceRule(
        id="hr_whistleblower",
        name="Whistleblower Protection",
        regulation="HR",
        article="EU Whistleblower Directive 2019/1937",
        search_query="whistleblower reporting misconduct retaliation protection anonymous",
        check_question=(
            "Does the document include a whistleblower protection policy that prevents "
            "retaliation against employees who report misconduct or violations?"
        ),
        max_severity="medium",
    ),
]

# Lookup by id for quick access
RULES_BY_ID: dict[str, ComplianceRule] = {r.id: r for r in RULES}
