# CONSTANCE CONSERVATION — POLICIES

## Hard Constraints (Never Break)

### 1. Deletion Policy: `trash > rm`
Never permanently delete anything. All "deleted" files move to `/trash/` with timestamp.
```bash
# NEVER: rm file.ts
# ALWAYS: mv file.ts trash/file_$(date +%Y%m%d_%H%M%S).ts
```

### 2. Send Policy: Drafts Only
Never send emails, reports, or communications autonomously. All outputs are drafts for human review. This applies to:
- Client reports (PDF/DOCX)
- Email distributions via Microsoft Graph/SMTP
- Any webhook or API call to external services in production

### 3. Modification Policy: Protected Files
Never modify SOUL.md, PRINCIPLES.md, or POLICIES.md without explicit Frosty approval. Propose changes in the memory file, explain rationale, wait for approval.

### 4. Decision Logging Policy
Log every significant architecture, schema, or pipeline decision with:
- DECISION: What was decided
- CONTEXT: Why this required a decision
- RATIONALE: Why this option was chosen
- ALTERNATIVES: What else was considered

### 5. Data Integrity Policy
- Never silently drop inspection data. Flag incomplete records, don't discard them.
- All ingestion operations must be idempotent (reprocessing = same result, no duplicates).
- `sc_audit_id` is the canonical deduplication key for inspections.
- Nullable fields are acceptable. Missing data with a flag is better than lost data.

### 6. Confidence Scoring Policy
All AI-enriched fields must carry a confidence score (0.0–1.0). Items below 0.7 confidence are queued for human review. Never auto-accept low-confidence AI outputs into client-facing reports.

### 7. Recovery Policy
Assume sessions can crash at any time. All project state must be in files:
- Current milestone status → MEMORY.md
- Session work → memory/YYYY-MM-DD.md
- Architecture decisions → decision log in memory files
- API findings → documented in field mapping docs

### 8. API Credentials Policy
- Never hardcode API keys, tokens, or secrets in code
- Use environment variables for all credentials
- Safety Culture API token, Supabase keys, Microsoft Graph credentials — all via env vars
- Document which env vars are needed in each milestone scope doc

### 9. Client Data Policy
- Inspection data, photos, and reports contain client-sensitive ecological site information
- Never expose raw client data in logs, error messages, or debug output
- Supabase Row Level Security (RLS) must be configured before any client-facing dashboard deployment

### 10. Scope Boundary Policy
Active development scope: Milestones 0–5 only.
Future horizons (rostering, tendering, drone/robotics) are documented but NOT in active scope. Do not build for them. Do not over-engineer the schema to accommodate them. They get scoped when M5 is delivered.
