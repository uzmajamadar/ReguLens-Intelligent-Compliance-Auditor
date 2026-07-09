const BASE = "/api";

function getToken() {
  return sessionStorage.getItem("regulens_token");
}

function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function normalizeDocument(doc) {
  return {
    ...doc,
    id: doc.id ?? doc.document_id,
  };
}

// ── Auth ──────────────────────────────────────────────────────────────

export async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Login failed" }));
    throw new Error(err.detail || "Login failed");
  }
  return res.json();
}

export async function register(email, password, name, organizationName = "") {
  const res = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, organization_name: organizationName || undefined }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Registration failed" }));
    throw new Error(err.detail || "Registration failed");
  }
  return res.json();
}

export async function getMe() {
  const res = await fetch(`${BASE}/auth/me`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch user");
  return res.json();
}

// ── Documents ─────────────────────────────────────────────────────────

export async function listDocuments() {
  const res = await fetch(`${BASE}/documents/`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  return Array.isArray(data) ? data.map(normalizeDocument) : data;
}

export async function uploadDocument(file, onProgress, frameworks = []) {
  const form = new FormData();
  form.append("file", file);

  let url = `${BASE}/upload/`;
  if (frameworks.length > 0) {
    url += `?frameworks=${frameworks.join(",")}`;
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const token = getToken();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.detail || "Upload failed"));
        } catch {
          reject(new Error("Upload failed"));
        }
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error")));

    xhr.open("POST", url);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(form);
  });
}

export async function fetchDocument(documentId) {
  const res = await fetch(`${BASE}/documents/${documentId}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch document");
  return normalizeDocument(await res.json());
}

export async function viewDocument(documentId) {
  const res = await fetch(`${BASE}/documents/${documentId}/view`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to view document");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
}

export async function downloadDocument(documentId) {
  const res = await fetch(`${BASE}/documents/${documentId}/download`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to download document");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `document-${documentId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportVersionPdf(documentId, versionId) {
  const res = await fetch(`${BASE}/documents/${documentId}/versions/${versionId}/actions/export`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to export PDF");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `version-${versionId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function updateDocumentFrameworks(documentId, frameworks) {
  const res = await fetch(`${BASE}/documents/${documentId}/frameworks`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ frameworks }),
  });
  if (!res.ok) throw new Error("Failed to update frameworks");
  return res.json();
}

export async function deleteDocument(documentId) {
  const res = await fetch(`${BASE}/documents/${documentId}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to delete document");
  return res.json();
}

// ── Scans ─────────────────────────────────────────────────────────────

export async function listScans(documentId) {
  const res = await fetch(`${BASE}/documents/${documentId}/scans`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch scans");
  return res.json();
}

export async function getScanDetail(documentId, scanId) {
  const res = await fetch(`${BASE}/documents/${documentId}/scans/${scanId}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch scan detail");
  return res.json();
}

export async function runScan(documentId, framework = "GDPR", customName, customDescription) {
  let params;
  if (Array.isArray(framework)) {
    params = `?frameworks=${framework.map(encodeURIComponent).join(",")}`;
    if (customName) params += `&custom_name=${encodeURIComponent(customName)}`;
    if (customDescription) params += `&custom_description=${encodeURIComponent(customDescription)}`;
  } else {
    params = framework ? `?framework=${encodeURIComponent(framework)}` : "";
  }
  const res = await fetch(`${BASE}/documents/${documentId}/actions/scan${params}`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to start scan");
  }
  return res.json();
}

// ── Compliance ────────────────────────────────────────────────────────

export async function getComplianceRules() {
  const res = await fetch(`${BASE}/compliance/rules`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch compliance rules");
  return res.json();
}

export async function getAvailableFrameworks() {
  const res = await fetch(`${BASE}/compliance/frameworks`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch frameworks");
  return res.json();
}

export async function runComplianceAudit(collectionName = "autodoc_policies", topK = 3, frameworks = null) {
  const body = { collection_name: collectionName, top_k_per_rule: topK };
  if (frameworks && frameworks.length > 0) {
    body.frameworks = frameworks;
  }
  const res = await fetch(`${BASE}/compliance/audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to run compliance audit");
  }
  return res.json();
}

export async function getFeedback(collectionName) {
  const res = await fetch(`${BASE}/compliance/feedback/${encodeURIComponent(collectionName)}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch feedback");
  return res.json();
}

export async function submitFeedback(data) {
  const res = await fetch(`${BASE}/compliance/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to submit feedback");
  }
  return res.json();
}

// ── Review Queue ──────────────────────────────────────────────────────

export async function listAllViolations(params = {}) {
  const qs = new URLSearchParams();
  if (params.document_id) qs.set("document_id", params.document_id);
  if (params.severity) qs.set("severity", params.severity);
  if (params.framework) qs.set("framework", params.framework);
  if (params.status) qs.set("status", params.status);
  const query = qs.toString();
  const url = query ? BASE + "/compliance/violations?" + query : BASE + "/compliance/violations";
  const res = await fetch(url, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch violations");
  return res.json();
}

export async function patchViolation(violationId, data) {
  const res = await fetch(`${BASE}/compliance/violations/${violationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update violation");
  return res.json();
}

export async function listReviewTasks(statusFilter = "", framework = null, assignedToId = null) {
  const qs = new URLSearchParams();
  if (statusFilter) qs.set("status_filter", statusFilter);
  if (framework) qs.set("framework", framework);
  if (assignedToId) qs.set("assigned_to_id", assignedToId);
  const query = qs.toString();
  const url = query ? `${BASE}/compliance/reviews?${query}` : `${BASE}/compliance/reviews`;
  const res = await fetch(url, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch review tasks");
  return res.json();
}

export async function getReviewStats() {
  const res = await fetch(`${BASE}/compliance/reviews/stats`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch review stats");
  return res.json();
}

export async function approveReviewTask(taskId) {
  const res = await fetch(`${BASE}/compliance/reviews/${taskId}/actions/approve`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to approve review task");
  return res.json();
}

export async function startReviewTask(taskId) {
  const res = await fetch(`${BASE}/compliance/reviews/${taskId}/actions/start`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to start review task");
  return res.json();
}

export async function rejectReviewTask(taskId, notes = "") {
  const res = await fetch(`${BASE}/compliance/reviews/${taskId}/actions/reject?notes=${encodeURIComponent(notes)}`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to reject review task");
  return res.json();
}

export async function needsFixReviewTask(taskId, notes = "") {
  const res = await fetch(`${BASE}/compliance/reviews/${taskId}/actions/needs-fix?notes=${encodeURIComponent(notes)}`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to mark review task as needs fix");
  return res.json();
}

export async function resolveReviewTask(taskId) {
  const res = await fetch(`${BASE}/compliance/reviews/${taskId}/actions/resolve`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to resolve review task");
  return res.json();
}

export async function retryReviewTask(taskId) {
  const res = await fetch(`${BASE}/compliance/reviews/${taskId}/actions/retry`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to retry review task");
  return res.json();
}

export async function updateReviewTask(taskId, data) {
  const res = await fetch(`${BASE}/compliance/reviews/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update review task");
  return res.json();
}

// ── Remediation Copilot ───────────────────────────────────────────────

export async function generateRemediation(violationId) {
  const res = await fetch(`${BASE}/compliance/violations/${violationId}/actions/remediate`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to generate remediation");
  }
  return res.json();
}

export async function acceptRemediation(suggestionId) {
  const res = await fetch(`${BASE}/compliance/remediations/${suggestionId}/actions/accept`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to accept remediation");
  return res.json();
}

export async function rejectRemediation(suggestionId) {
  const res = await fetch(`${BASE}/compliance/remediations/${suggestionId}/actions/reject`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to reject remediation");
  return res.json();
}

export async function editRemediation(suggestionId, modifiedText) {
  const res = await fetch(
    `${BASE}/compliance/remediations/${suggestionId}`,
    { method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ modified_text: modifiedText }) }
  );
  if (!res.ok) throw new Error("Failed to edit remediation");
  return res.json();
}

export async function applyRemediation(suggestionId) {
  const res = await fetch(`${BASE}/compliance/remediations/${suggestionId}/actions/apply`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to apply remediation");
  }
  return res.json();
}

export async function listViolationRemediations(violationId) {
  const res = await fetch(`${BASE}/compliance/violations/${violationId}/remediations`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch remediations");
  return res.json();
}

export async function submitForReview(violationId, suggestionId) {
  let url = `${BASE}/compliance/violations/${violationId}/actions/submit-review`;
  if (suggestionId) url += `?suggestion_id=${suggestionId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to submit for review");
  }
  return res.json();
}

// ── Admin: User Management ────────────────────────────────────────────

export async function listUsers() {
  const res = await fetch(`${BASE}/admin/users`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

export async function createUser(data) {
  const res = await fetch(`${BASE}/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create user");
  }
  return res.json();
}

export async function getUser(userId) {
  const res = await fetch(`${BASE}/admin/users/${userId}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch user");
  return res.json();
}

export async function updateUser(userId, data) {
  const res = await fetch(`${BASE}/admin/users/${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update user");
  }
  return res.json();
}

export async function deleteUser(userId) {
  const res = await fetch(`${BASE}/admin/users/${userId}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to delete user");
  }
  return res.json();
}

// ── Admin: Audit Logs ─────────────────────────────────────────────────

export async function listAuditLogs({ limit = 50, offset = 0, action } = {}) {
  let params = `?limit=${limit}&offset=${offset}`;
  if (action) params += `&action=${encodeURIComponent(action)}`;
  const res = await fetch(`${BASE}/admin/audit-logs${params}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch audit logs");
  return res.json();
}

// ── Admin: Stats ──────────────────────────────────────────────────────

export async function getAdminStats() {
  const res = await fetch(`${BASE}/admin/stats`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch admin stats");
  return res.json();
}

// ── Organization ──────────────────────────────────────────────────────

export async function getOrganization() {
  const res = await fetch(`${BASE}/admin/organization`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch organization");
  return res.json();
}

export async function updateOrganization(name) {
  const res = await fetch(`${BASE}/admin/organization`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update organization");
  }
  return res.json();
}

export async function needsOnboarding() {
  const res = await fetch(`${BASE}/admin/organization/needs-onboarding`, { headers: { ...authHeaders() } });
  if (!res.ok) return { needs_onboarding: false };
  return res.json();
}

// ── Admin: Review Assignment ──────────────────────────────────────────

export async function assignReviewTask(taskId, assignedToId, note = "") {
  const res = await fetch(`${BASE}/admin/reviews/${taskId}/actions/assign`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ assigned_to_id: Number(assignedToId), note: note || undefined }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to assign review task");
  }
  return res.json();
}

// ── Auth: Password Reset & Profile ────────────────────────────────────

export async function forgotPassword(email) {
  const res = await fetch(`${BASE}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to request password reset");
  }
  return res.json();
}

export async function resetPassword(token, newPassword) {
  const res = await fetch(`${BASE}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to reset password");
  }
  return res.json();
}

export async function updateProfile(data) {
  const res = await fetch(`${BASE}/auth/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update profile");
  }
  return res.json();
}

// ── Workflows ──────────────────────────────────────────────────────────

export async function listWorkflows(framework) {
  let params = framework ? `?framework=${encodeURIComponent(framework)}` : "";
  const res = await fetch(`${BASE}/workflows/${params}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch workflows");
  return res.json();
}

export async function getWorkflow(workflowId) {
  const res = await fetch(`${BASE}/workflows/${workflowId}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch workflow");
  return res.json();
}

export async function createWorkflow(data) {
  const res = await fetch(`${BASE}/workflows/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create workflow");
  }
  return res.json();
}

export async function addWorkflowStep(workflowId, data) {
  const res = await fetch(`${BASE}/workflows/${workflowId}/steps`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to add workflow step");
  }
  return res.json();
}

export async function addWorkflowTransition(workflowId, data) {
  const res = await fetch(`${BASE}/workflows/${workflowId}/transitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to add workflow transition");
  }
  return res.json();
}

// ── Workflow Instances ────────────────────────────────────────────────

export async function listWorkflowInstances({ status, documentId } = {}) {
  let params = new URLSearchParams();
  if (status) params.set("status_filter", status);
  if (documentId) params.set("document_id", documentId);
  const qs = params.toString();
  const res = await fetch(`${BASE}/workflows/instances${qs ? `?${qs}` : ""}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch workflow instances");
  return res.json();
}

export async function getWorkflowInstance(instanceId) {
  const res = await fetch(`${BASE}/workflows/instances/${instanceId}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch workflow instance");
  return res.json();
}

// ── Workflow Tasks ────────────────────────────────────────────────────

export async function listWorkflowTasks({ status, instanceId } = {}) {
  let params = new URLSearchParams();
  if (status) params.set("status_filter", status);
  if (instanceId) params.set("instance_id", instanceId);
  const qs = params.toString();
  const res = await fetch(`${BASE}/workflows/tasks${qs ? `?${qs}` : ""}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch workflow tasks");
  return res.json();
}

export async function getWorkflowTask(taskId) {
  const res = await fetch(`${BASE}/workflows/tasks/${taskId}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch workflow task");
  return res.json();
}

export async function actOnWorkflowTask(taskId, status, notes = "") {
  const res = await fetch(`${BASE}/workflows/tasks/${taskId}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ status, notes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to act on workflow task");
  }
  return res.json();
}

// ── Notifications ─────────────────────────────────────────────────────

export async function listNotifications(unreadOnly = false) {
  const params = unreadOnly ? "?unread_only=true" : "";
  const res = await fetch(`${BASE}/workflows/notifications${params}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error("Failed to fetch notifications");
  return res.json();
}

export async function markNotificationRead(notificationId) {
  const res = await fetch(`${BASE}/workflows/notifications/${notificationId}/read`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to mark notification as read");
  return res.json();
}

export async function markAllNotificationsRead() {
  const res = await fetch(`${BASE}/workflows/notifications/read-all`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to mark all notifications as read");
  return res.json();
}

// ── Notifications: Overdue Reminders ───────────────────────────────────

export async function checkOverdue() {
  const res = await fetch(`${BASE}/notifications/check-overdue`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Failed to check overdue tasks");
  return res.json();
}

// ── RAG Query ─────────────────────────────────────────────────────────

export async function queryDocument(question, collectionName) {
  const body = { question, top_k: 5 };
  if (collectionName) body.collection_name = collectionName;
  const res = await fetch(`${BASE}/query/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to query document");
  }
  return res.json();
}

export async function listMyTasks() {
  const res = await fetch(`${BASE}/documents/my-tasks`, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = Array.isArray(err.detail) ? err.detail.map(d => d.msg).join("; ") : err.detail;
    throw new Error(detail || "Failed to fetch my tasks");
  }
  return res.json();
}

export async function getDocumentDiff(documentId, v1, v2) {
  const res = await fetch(`${BASE}/documents/${documentId}/diff?v1=${v1}&v2=${v2}`, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to fetch diff");
  }
  return res.json();
}
