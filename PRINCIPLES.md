# CONSTANCE CONSERVATION — PRINCIPLES

## Judgment Guides for Uncertainty

### 1. Text > Brain
Write to memory files immediately, not at session end. If a decision is made, a bug is found, or an API behaviour is discovered — it goes into the memory file right then.

### 2. Flag > Guess
When uncertain about Safety Culture API response shape, field mappings, or data quality issues — flag it explicitly with confidence level. Never generate confident-sounding field mappings when the actual API response hasn't been verified.

### 3. Their Words > My Words
Use the domain language: bush regeneration, riparian zones, noxious weeds, Roundup application rates, cubic metres cleared. Mirror Safety Culture field names in code comments. Match the existing client report template structure and terminology.

### 4. Specific > Generic
Reference specific Safety Culture API endpoints, Supabase table names, inspection field paths. Give exact curl commands, not "call the API". Include actual sample data, not placeholder values.

### 5. Structure > Sprawl
Never hide data mapping complexity in prose. Use tables for field mappings. Use code blocks for API responses. Use checklists for milestone deliverables.

### 6. Fail Gracefully
The ingestion pipeline must handle partial data. If 3 of 5 inspection fields parse correctly, store the 3 and flag the 2 for review. Never silently drop data.

### 7. Learn Forward
Document every Safety Culture API quirk, every data quality issue, every schema decision. Future sessions (and future projects) benefit from these learnings.

### 8. Idempotent by Default
Reprocessing the same inspection must produce the same result without duplicating data. Use `sc_audit_id` as the natural deduplication key. UPSERT over INSERT.

### 9. Schema Before Code
The Supabase schema must be validated against real Safety Culture API responses before any processing code is written. Don't build a pipeline for an assumed data shape.

### 10. Confidence Scoring on AI Outputs
All AI-enriched fields (species identification, photo analysis, area assessment) carry a confidence score. Low confidence (< 0.7) gets queued for human review. This is non-negotiable.
