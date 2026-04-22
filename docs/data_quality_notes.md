# Data Quality Issues — Safety Culture Ingestion Pipeline

Reference document cataloguing every data quality issue observed across 4 Daily Work Report
samples and 1 Chemical Application Record from the Safety Culture API. All issues below MUST
be handled by the ingestion pipeline.

Source samples analysed:
- Daily Work Report (template `template_f0eb0c0c58d24ce6bd21ab671f200a69`) x 4 — spanning early 2025 to 2026
- Chemical Application Record x 1

Severity levels:
- **Critical** — Will cause data loss or pipeline failure if not handled
- **High** — Will produce incorrect/misleading data
- **Medium** — May cause minor data gaps or require manual cleanup
- **Low** — Cosmetic or edge-case; handle when convenient

---

## 1. Template Evolution (Same template_id, different structure)

**Severity: Critical**

The Daily Work Report template (`template_f0eb0c0c58d24ce6bd21ab671f200a69`) has been
modified over time while retaining the same `template_id`. The pipeline cannot assume a
fixed schema — it must detect and adapt to structural changes per-inspection.

| Change | Early 2025 | Late 2025+ | Impact |
|--------|-----------|------------|--------|
| **Site Name field type** | `list` (dropdown) — value in `responses.selected[].label` | `text` (free text) — value in `responses.text` | Pipeline must check item type and read from the correct response key |
| **Prepared by / Supervisor type** | `question` type | `list` type (different `response_set` IDs) | Both use `responses.selected[].label` but response_set lookup will break if hardcoded |
| **Address field** | Not present | Added as a new `header_item` | Pipeline must tolerate missing fields |
| **Planting section** | Present ("Coming Soon" placeholder) | Removed entirely | Pipeline must not error on absent sections |
| **Erosion Works field** | Present | Removed | Same — must tolerate missing fields |
| **New fields (late 2025+)** | N/A | Area of Concerns (address/location), Team Performance slider, MVP of the Day, IAP/GPS location | Pipeline should ingest new fields without schema changes where possible |
| **Label spelling** | `"Discription"` in "Details of Mapped Areas" | `"Description"` | Match on `item_id`, never on label text alone |

**Example:** The Site Name field in early 2025 returns:
```json
"responses": { "selected": [{ "label": "South Creek" }] }
```
In 2026 the same logical field returns:
```json
"responses": { "text": "Spring Farm AV Jennings " }
```

**Pipeline requirement:** Field extraction must branch on `type` (`list` vs `text` vs
`question`) and read from the appropriate `responses` sub-key. Use `item_id` for field
identification, never labels.

---

## 2. Free-text Fields That Need Parsing

**Severity: High**

Several fields that logically contain numeric or structured data are stored as `textsingle`,
meaning the pipeline receives arbitrary strings.

### 2a. Hours fields

| Field | Observed values | Parse strategy |
|-------|----------------|----------------|
| Total Worked Hours | `"24"`, `"16"`, `"N/A"`, `""` | Attempt `float()`, fallback to `NULL` |
| Staff worked hours | `"24"`, `"8"`, `""` | Same |
| Remaining Hours | `"440"`, `"N/A"`, `""` | Same |

### 2b. Weed removal percentage

Observed values: `"30-40%"`, `"90"` (no % sign), `""` (empty).

**Pipeline requirement:** Strip `%` suffix, detect range values (store as `low`/`high` or
midpoint), parse bare integers, treat empty as `NULL`.

### 2c. Chemical rates/volumes (Herbicide field)

The `responses.text` on the Herbicide item contains completely unstructured multi-line text:

```
"Starane 6ml/L: 60ml - 10L sprayed.\nDicamba: 6ml/L: 60ml - 10L sprayed."
```
```
"8, 10L packs sprayed.\n\nGrazon rate: 6ml per 1L"
```

No consistent delimiter, unit format, or structure across reports. Each crew member formats
differently.

**Pipeline requirement:** Store as raw text. Do not attempt structured parsing without an
NLP/LLM extraction step. Flag for future structured extraction.

### 2d. Time Start/Finish (Chemical Application Record)

Observed value: `"7:30/3:20"` — start and finish concatenated with `/`.

**Pipeline requirement:** Split on `/`, parse each half as a time. Assume AM for first value,
PM for second value unless context indicates otherwise.

### 2e. Tasks Undertaken

Usually a multi-select from a predefined list (`responses.selected[]`), but also observed
with free text `"Watering"` in `responses.text` — a value not in the predefined options.

**Pipeline requirement:** Read both `responses.selected[].label` and `responses.text`.
Union them into the task list. Accept unknown task names.

---

## 3. Site Name Inconsistencies

**Severity: High**

Site identification is unreliable across multiple sources within the same inspection.

| Source | Example value | Notes |
|--------|--------------|-------|
| Feed-level `client_site` | `"Camden council"`, `"Hinchinbrook creek"` | Populated in early 2025, **empty/null in 2026** |
| Header-level "Site Name" (dropdown, early 2025) | `"South Creek"` (selected label) | Label may not match audit name |
| Header-level "Site Name" (free text, 2026) | `"Spring Farm AV Jennings "` | Note **trailing space** |
| Chemical Application Record | `"Hichinbrook"` | **Misspelling** of "Hinchinbrook" |
| Audit name in feed | `"Hinchinbrook creek"` | Different again from selected label `"South Creek"` on the same inspection |

**Pipeline requirement:**
1. Trim whitespace from all site name values.
2. Build a site name alias/normalisation table (e.g., `"Hichinbrook"` -> `"Hinchinbrook Creek"`).
3. Prefer the header-level Site Name field as canonical; fall back to `client_site`, then audit name.
4. Do not assume `client_site` will be populated — it is empty in 2026 data.

---

## 4. Staff/Crew Data Issues

**Severity: Medium**

### 4a. Growing staff list

Staff names come from a predefined Safety Culture list that expands over time.

- **Early 2025 roster:** Cameron, Maddie, Matthew, Ryan, Ethan T, Ethan M, Bailey, Jordan
- **By 2026 additions:** Suzie Kiloh, Josh Collins, Reece Morgan, Madeline Sharpe

**Pipeline requirement:** Do not hardcode a staff allowlist. Accept any name from the
`selected[].label` response. Upsert into a staff dimension table on first encounter.

### 4b. Role accounts as authors

`"Regen Manager"` appears as `author_name` in 2026 inspections. This is a shared role
account, not an individual person.

**Pipeline requirement:** Flag or map role accounts separately. Do not treat `"Regen Manager"`
as a staff member in headcount or productivity metrics.

---

## 5. Nullable/Empty Fields

**Severity: Medium**

Many fields are legitimately empty depending on the type of work performed that day. The
pipeline must not treat empty values as errors.

| Field | When empty is expected |
|-------|----------------------|
| Weeds Targeted | Task is "Watering" (no weeds to target) |
| Herbicide | No spraying occurred |
| Remaining Hours | Often empty or `"N/A"` |
| Other Weeds | Usually empty |
| Erosion Works | Usually empty |
| Area of Concerns | Usually empty |
| Site Area Work Map | Sometimes has media attachments, sometimes not |
| Weather Comments | Sometimes filled, sometimes empty. **Early 2025 had a photo attachment instead of text.** |

**Pipeline requirement:** All item values should be nullable in the database. Use `NULL`
for empty strings, `"N/A"`, and absent fields. Do not insert placeholder text.

---

## 6. Photo Attachment Patterns

**Severity: Medium**

### 6a. Photos can appear on ANY item

Photos are not restricted to `media`-type items. For example, the `"Weather Comments"` field
(type `textsingle`) had a photo attached in early 2025 data.

**Pipeline requirement:** Check the `media` array on every item, regardless of item type.

### 6b. Variable photo counts

`"Details of Tasks"` items can carry anywhere from 0 to 12+ photos per entry.

### 6c. Consistent photo structure

All observed photos use the same payload shape:
```json
{
  "media_id": "...",
  "href": "https://...",
  "file_ext": "jpg",
  "date_created": "2025-..."
}
```

All observed files are JPGs. Pipeline should still handle other extensions defensively.

---

## 7. Scoring Data

**Severity: Low**

Every inspection carries `score`, `max_score`, and `score_percentage` at both the inspection
level and the individual item level.

- **Inspection-level scores** represent Safety Culture compliance/completion scores — they
  are NOT ecological quality scores.
- **Item-level scores** represent checklist completion status (answered vs. unanswered).

**Pipeline requirement:** Ingest scores for completeness tracking but do not surface them
as ecological or work-quality metrics. Label clearly in the schema (e.g.,
`sc_completion_score` not `quality_score`).

---

## 8. Chemical Application Record Specifics

**Severity: Medium**

### 8a. Extremely low volume

Only 3 Chemical Application Records exist across all of 2025. This template is used
infrequently — do not over-invest in parsing but do support it.

### 8b. Structural differences from Daily Work Report

| Data point | Daily Work Report | Chemical Application Record |
|-----------|-------------------|----------------------------|
| Chemical info | Combined free text in Herbicide field | Separate fields: chemical name, rate, volume |
| Weather | Not captured | Captured in dedicated fields |
| Time tracking | Total hours as text | Start/finish time as `"7:30/3:20"` |

### 8c. Data duplication

A Chemical Application Record can cover the same site and date as a Daily Work Report,
creating duplicate data for overlapping fields (e.g., site name, date, crew).

**Pipeline requirement:**
1. Link Chemical Application Records to their corresponding Daily Work Report by
   matching on `site + date`.
2. Prefer Chemical Application Record values for chemical-specific fields (name, rate,
   volume, weather) since they are more structured.
3. Do not double-count hours or crew from both records for the same day.

---

## 9. Additional Findings from API Testing (v1.1)

**Severity: High**

Additional data quality issues identified during expanded API analysis and client report template review.

### 9a. Hours field parsing

Hours fields arrive as free-text strings ("24", "8", "440"). Parser must: strip whitespace, handle numeric strings, flag non-numeric values (e.g., "N/A") for review. Store parsed value in `inspection_personnel.hours_worked` and raw text in `raw_hours_text`.

### 9b. Weed removal percentage ranges

Free text with ranges ("30-40%"). Parser must:
- Extract min/max from range strings -> `inspection_metadata.weed_removal_pct_min` / `weed_removal_pct_max`
- Handle single values (e.g., "90" -> min=90, max=90)
- Handle missing `%` symbol
- Store `NULL` for empty/unparseable values

### 9c. Chemical rate parsing (semi-structured)

Chemical rates are semi-structured free text with varied patterns:
- `"Starane 6ml/L: 60ml - 10L sprayed"` — chemical name, rate, concentrate, volume
- `"8, 10L packs sprayed.\n\nGrazon rate: 6ml per 1L"` — different format entirely

Parser must: identify chemical name, rate value, rate unit, and total volume from various text patterns. Store raw text alongside any parsed values (`inspection_chemicals.rate_raw` + `rate_value` + `rate_unit`).

### 9d. Time start/finish parsing

Free text ("7:30/3:20") in Chemical Application Records. Parser must:
- Split on separator (`/`)
- Parse time formats
- Calculate duration
- Store as `chemical_application_records.time_start` / `time_finish`

### 9e. Site name mismatches across templates

SC dropdown label can differ from text value (e.g., "Hinchinbrook creek" vs "South Creek" on the same inspection). Mitigation: populate `site_name_lookup` from `response_sets` in `template_data`, maintain as new variants appear.

### 9f. Chemical names across templates

The Daily Work Report uses a multi-select dropdown for chemical names, while the Chemical Application Record uses free text. Same chemical may appear differently across templates (e.g., "Glyphosate" in dropdown vs "glyphosate" in free text). The `chemical_lookup` normalization table handles this via `common_aliases` JSON field.

---

## Summary by Severity

| Severity | Issues | Key action |
|----------|--------|------------|
| **Critical** | Template evolution (#1) | Branch extraction logic on field type; identify fields by `item_id` |
| **High** | Free-text parsing (#2, #9a-d), Site name inconsistencies (#3, #9e), Cross-template chemicals (#9f) | Robust parsers with fallbacks; site normalisation table; chemical lookup normalization |
| **Medium** | Staff data (#4), Nullable fields (#5), Photos (#6), Chemical records (#8) | Nullable schema; upsert staff; check media on all items; dedup strategy |
| **Low** | Scoring data (#7) | Label scores correctly in schema |
