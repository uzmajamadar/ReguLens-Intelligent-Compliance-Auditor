# Fix: My Tasks empty page + UploadDialog broken progress

## Problem
1. UploadDialog.jsx references `scanPhase` state that was removed — progress bar never shows
2. My Tasks backend only queries documents the user owns (via `scope_document_owner`), skipping reviewers/admins
3. My Tasks frontend catches errors silently — no visible error state

## Changes

### 1. `frontend/src/components/UploadDialog.jsx`
- **Line 183**: `{uploading && scanPhase === "" && (` → `{uploading && (`  
  Remove broken reference to non-existent `scanPhase` state
- **Line 225**: `Upload{frameworks.length > 0 ? "" : ""}` → `Upload`  
  Clean up dead conditional

### 2. `app/routers/versions.py:1133-1183`
Replace `list_my_review_tasks` logic:
```python
# Current (broken): filters by document ownership
docs = scope_document_owner(docs, current_user, Document)

# New: query ReviewTask directly for tasks assigned to user
tasks = (
    db.query(ReviewTask)
    .filter(
        ReviewTask.assigned_to == current_user.name,
        ReviewTask.status == "changes_requested",
    )
    .all()
)
# Then resolve documents for those tasks
doc_ids = list({t.document_id for t in tasks})
docs = db.query(Document).filter(Document.id.in_(doc_ids)).all()
```
This returns all documents with tasks assigned to the current user, regardless of who owns the document.

### 3. `frontend/src/pages/MyTasks.jsx`
Add error state display:
```jsx
const [error, setError] = useState(null);
// In fetch: setError(err.message) instead of console.error
// In render: show error alert when error is set
```

## Verification
1. Build passes: `npx vite build` in `frontend/`
2. My Tasks shows tasks assigned to current user
3. Upload progress bar visible during upload
