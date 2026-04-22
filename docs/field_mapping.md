# Safety Culture to Supabase Field Mapping

> Constance Conservation -- Data Automation Platform
>
> Last updated: 2026-04-15

This document maps Safety Culture (SC) inspection API fields to the canonical Supabase schema. It covers both the **Daily Work Report** template and the **Chemical Application Record** template.

---

## Data Shape Summary

### Daily Work Report

| Section | Field | Type | Notes |
|---------|-------|------|-------|
| Header | Site Name | list (dropdown) | Values from response_sets. Known data quality issue: text field can differ from selected label |
| Header | Conducted on | datetime | ISO format |
| Header | Prepared by/Supervisor | question | Supervisor name |
| Personnel | Staff/Contractors | list (multi-select) | Full crew list |
| Personnel | Total Worked Hours | textsingle | Free text (e.g., "24") |
| Personnel | Staff worked hours (individual) | textsingle | One per staff member, free text |
| Personnel | Remaining Hours | textsingle | Contract hours remaining |
| Planting | Coming Soon | question | Placeholder -- not yet active |
| Work Onsite | Tasks Undertaken | list (multi-select) | [Spraying, Cut & Painting, Handweeding, Brushcutting, etc.] |
| Work Onsite | Details Of Tasks | text (free text) | Rich narrative + inline photos. Primary content for report Section 2.0 |
| Work Onsite | Weeds Targeted | list (multi-select) | From predefined species list |
| Work Onsite | Other Weeds | text | Free text for unlisted species |
| Work Onsite | Rough % weeds removed | textsingle | Free text (e.g., "30-40%"), needs range parsing |
| Work Onsite | Site Area Work Map | media | Annotated map image -- supervisor's hand-drawn work areas |
| Work Onsite | Details of Mapped Areas | text | Description of zones worked |
| Work Onsite | Erosion Works | textsingle | |
| Chemicals | Herbicide | list (multi-select) + free text | Selected chemicals + rates/volumes as text |
| Priorities | New observed fauna? | question (Yes/No) | Conditional: child text field for species name only shows when Yes |
| Priorities | New observed flora? | question (Yes/No) | Conditional: child text field for species name only shows when Yes |
| Priorities | Other Comments/Future Works | text | |
| Concerns | Area Of Concerns | textsingle + media | |

### Chemical Application Record

| Field | Type | Notes |
|-------|------|-------|
| Site treated | list | Known typo issues (e.g., "Hichinbrook" vs "Hinchinbrook") |
| Area Worked | media | Map photo |
| Application Method | list | e.g., [Backpack] |
| Time Start/Finish | textsingle | Free text (e.g., "7:30/3:20"), needs parsing |
| Public Notification | question | e.g., [Signage] |
| Operator/Applicators | list (multi-select) | Staff who applied |
| Chemical/s Used | text (free text) | Newline-separated (e.g., "Glyphosate\nStarane\nDicamba") |
| Rate Used | text | Newline-separated, corresponding to chemicals (e.g., "7ml/L\n6ml/L\n6ml/L") |
| Total Amount Sprayed | text | e.g., "40L" |
| Additives/Wetters | list | e.g., [Brushwet 2ml/L, Blue Dye 5ml/L] |
| Weather fields | mixed | General conditions, Wind, Rainfall, Temperature, Humidity |

### Key Data Shape Findings

1. **One template, not separate job types.** All field work uses a single "Daily Work Report" with multi-select "Tasks Undertaken." A single report can cover spraying AND handweeding AND brushcutting.
2. **Chemical data lives in two places.** Daily Work Report has a Herbicide multi-select with free-text rates. Chemical Application Record is a separate template with detailed compliance data. Must reconcile both.
3. **Numeric fields are strings.** Hours, percentages, rates all arrive as free text. Transformation layer must parse robustly.
4. **Planting section is placeholder.** Template has "Coming Soon" -- schema accommodates but parser skips until activated.
5. **Site name data quality.** Dropdown label can differ from text value. Requires normalization via `site_name_lookup` table populated from `response_sets`.
6. **Photos are inline on items.** Each item can have a `media` array with `href` URLs -- no separate media endpoint needed.
7. **Conditional fields for fauna/flora.** Child text fields only present when parent Yes/No is "Yes."

---

## Table of Contents

1. [Extraction Logic](#extraction-logic)
2. [Template Evolution](#template-evolution)
3. [Table Mappings](#table-mappings)
   - [sites](#sites)
   - [clients](#clients)
   - [reports](#reports)
   - [report_entries](#report_entries)
   - [chemicals](#chemicals)
   - [report_chemicals](#report_chemicals)
   - [species](#species)
   - [report_species](#report_species)
   - [photos](#photos)
   - [crew](#crew)
   - [crew_hours](#crew_hours)
4. [Chemical Application Record Mapping](#chemical-application-record-mapping)

---

## Extraction Logic

### Navigating the nested items structure

Safety Culture inspections store all fields as a flat list of **items**, each with an `item_id` and a `parent_id`. The hierarchy is:

```
header_items[]          -- title-page fields (Site Name, Conducted on, Prepared by)
items[]                 -- body fields, nested via parent_id -> item_id
  ├── Section (type: section)
  │     ├── Category (type: category, e.g. "Personnel Onsite")
  │     │     ├── Item (type: list, question, text, etc.)
  │     │     └── Item
  │     └── Category (e.g. "Work Onsite")
  │           ├── Item
  │           └── Item
  └── ...
```

**To locate a field:**

1. Walk `header_items[]` or `items[]`.
2. Match on `label` (the human-readable field name).
3. Read `responses` based on the item `type`:
   - `list` (single or multi-select): `responses.selected[].label`; free-text additions in `responses.text`
   - `text` / `textsingle`: `responses.text`
   - `question` (yes/no or single select): `responses.selected[0].label`
   - `datetime`: `responses.datetime`
   - `media`: `media[]` array on the item
   - `address`: `responses.location_input` (lat/lng/address)
   - `slider`: `responses.selected[0].value` or similar numeric

**Parent-child relationships** are used for conditional fields. For example, "New observed fauna?" (Yes/No) has a child item "What was it?" that only appears when the answer is Yes. Locate children by filtering `items[]` where `parent_id == <parent_item_id>`.

### Label matching strategy

Labels are the primary key for field identification since `item_id` values are opaque UUIDs. However, labels can change between template versions (e.g., "Discription" was corrected to "Description"). The extraction code should:

- Normalise labels (lowercase, strip whitespace) before matching.
- Use fuzzy or substring matching for known variant labels.
- Log unmatched items for manual review.

---

## Template Evolution

The Daily Work Report template (`template_f0eb0c0c58d24ce6bd21ab671f200a69`) has been modified over the course of 2025. All reports share the same `template_id` regardless of version.

### Early 2025 (approx. Jan -- Mar 2025)

| Field | Type | Notes |
|---|---|---|
| Site Name | `list` | Dropdown select from predefined site names |
| Prepared by/Supervisor | `question` | Single-select from predefined names |
| Planting category | present | Contains only a "Coming Soon" placeholder |
| Erosion Works Carried Out Onsite? | `textsingle` | Present in Work Onsite |
| Area Of Concerns | Minimal | Simple text + media fields |
| Address | **not present** | -- |
| Location of IAP or GPS | **not present** | -- |
| Team performance slider | **not present** | -- |
| MVP of the day | **not present** | -- |
| Details label | "Discription" | Typo in label |

### Late 2025+ (approx. Apr 2025 onward)

| Field | Type | Notes |
|---|---|---|
| Site Name | `text` | Free text input (no longer a dropdown) |
| Address | `address` | New field with lat/lng |
| Prepared by/Supervisor | `list` | Changed to dropdown list |
| Planting category | **removed** | -- |
| Erosion Works Carried Out Onsite? | **removed** | -- |
| Area Of Concerns | Expanded | Added "What is found there", "Pictures of AOC", "Location" (address) |
| Location of IAP or GPS | `address` | New field |
| How would you rate the overall teams performance today? | `slider` | New field |
| Why this rating? or any comments? | `textsingle` | New field |
| MVP of the day? | `list` | New field (single select from staff) |
| Details label | "Description" | Typo corrected |
| Tasks Undertaken | `list` | Additional options (e.g., "Watering") and free text support |

### Implications for extraction

The extraction code must handle both versions. Key rules:

1. **Site Name**: Check `type`. If `list`, read `responses.selected[0].label`. If `text`, read `responses.text`.
2. **Prepared by/Supervisor**: Check `type`. If `question`, read `responses.selected[0].label`. If `list`, read `responses.selected[0].label` (same path, but type differs).
3. **Optional fields**: `Address`, `Location of IAP or GPS`, slider fields, and `MVP of the day` may not exist. Treat as nullable.
4. **Removed fields**: `Planting` category and `Erosion Works` may not exist. Skip gracefully.

---

## Table Mappings

### sites

Lookup/reference table for work sites.

| SC Field Path | DB Column | DB Type | Transformation Notes |
|---|---|---|---|
| `header_items[label="Site Name"].responses.selected[0].label` (early) | `name` | `text` | From list-type Site Name. Deduplicate on insert. |
| `header_items[label="Site Name"].responses.text` (late) | `name` | `text` | From text-type Site Name. Normalise casing and trim whitespace. Watch for typos (e.g., "Hichinbrook" vs "Hinchinbrook"). |
| `header_items[label="Address"].responses.location_input` | `address` | `text` | Only in late 2025+ templates. Nullable. |
| `header_items[label="Address"].responses.location_input.geometry` | `lat` / `lng` | `float8` | Extract from geometry if available. Nullable. |
| -- | `id` | `uuid` | Auto-generated primary key. |
| -- | `created_at` | `timestamptz` | Auto-generated. |

**Dedup strategy**: Match on normalised `name`. Maintain a manual alias table for known typos.

---

### clients

Client organisations. Not directly present in SC data -- will be manually seeded or derived from site-to-client relationships.

| SC Field Path | DB Column | DB Type | Transformation Notes |
|---|---|---|---|
| -- | `id` | `uuid` | Auto-generated. |
| -- | `name` | `text` | Manually maintained. |
| -- | `created_at` | `timestamptz` | Auto-generated. |

---

### reports

One row per inspection. `audit_id` is the deduplication key.

| SC Field Path | DB Column | DB Type | Transformation Notes |
|---|---|---|---|
| `audit_id` | `sc_audit_id` | `text UNIQUE` | Primary dedup key. Store full string including "audit_" prefix. |
| `template_id` | `sc_template_id` | `text` | e.g., "template_f0eb0c0c58d24ce6bd21ab671f200a69" |
| -- | `report_type` | `text` | Derived from template_id. "daily_work_report" or "chemical_application_record". |
| `audit_data.name` | `display_name` | `text` | Raw name from SC. May be site name or date string. |
| `audit_data.date_started` | `date_started` | `timestamptz` | ISO 8601 timestamp. |
| `audit_data.date_completed` | `date_completed` | `timestamptz` | ISO 8601 timestamp. |
| `created_at` | `sc_created_at` | `timestamptz` | SC record creation time. |
| `modified_at` | `sc_modified_at` | `timestamptz` | SC record modification time. |
| `audit_data.duration` | `duration_seconds` | `integer` | Duration in seconds. |
| `audit_data.score` | `score` | `float8` | Nullable. |
| `audit_data.total_score` | `total_score` | `float8` | Nullable. |
| `audit_data.score_percentage` | `score_percentage` | `float8` | Nullable. |
| `audit_data.authorship.owner` | `owner_name` | `text` | Display name of the audit owner. |
| `audit_data.authorship.owner_id` | `sc_owner_id` | `text` | SC user ID of owner. |
| `audit_data.authorship.author` | `author_name` | `text` | Display name of the author. |
| `audit_data.authorship.author_id` | `sc_author_id` | `text` | SC user ID of author. |
| `header_items[label="Conducted on"].responses.datetime` | `conducted_on` | `date` | Extract date portion from ISO datetime. |
| (resolved from Site Name) | `site_id` | `uuid FK` | FK to `sites.id`. Resolve after site upsert. |
| `header_items[label="Prepared by/Supervisor"]` | `supervisor` | `text` | `responses.selected[0].label` regardless of type (list or question). |
| `items[label="Details Of Tasks"].responses.text` | `task_details` | `text` | Free text narrative. May be long (multiple paragraphs). |
| `items[label="Other Weeds"].responses.text` | `other_weeds` | `text` | Free text for unlisted species. Nullable. |
| `items[label="Rough percentage of weeds removed"].responses.text` | `weed_removal_pct` | `text` | Keep as text -- values are inconsistent (e.g., "30-40%", "90"). |
| `items[label="Details of Mapped Areas..."].responses.text` | `area_description` | `text` | Note: label may be "Discription" or "Description". Match both. |
| `items[label="Herbicide"].responses.text` | `herbicide_notes` | `text` | Free text with rates/volumes. Parse separately into `report_chemicals`. |
| `items[label="New observed fauna?"].responses.selected[0].label` | `new_fauna` | `boolean` | Map "Yes" -> true, "No" -> false. |
| (child of "New observed fauna?") | `new_fauna_detail` | `text` | Only present when new_fauna is true. Find child item by parent_id. |
| `items[label="New observed flora?"].responses.selected[0].label` | `new_flora` | `boolean` | Map "Yes" -> true, "No" -> false. |
| (child of "New observed flora?") | `new_flora_detail` | `text` | Only present when new_flora is true. Find child item by parent_id. |
| `items[label="Other Comments/Future Works"].responses.text` | `comments` | `text` | Nullable. |
| `items[label="Total Worked Hours"].responses.text` | `total_worked_hours` | `text` | Keep as text -- may be "24", "16", "N/A", or empty. |
| `items[label="Remaining Hours"].responses.text` | `remaining_hours` | `text` | Keep as text -- may be "440", "N/A", or empty. |
| `items[label="How would you rate..."].responses` | `team_rating` | `integer` | Slider value. Nullable (late 2025+ only). |
| `items[label="Why this rating?..."].responses.text` | `team_rating_comment` | `text` | Nullable (late 2025+ only). |
| `items[label="MVP of the day?"].responses.selected[0].label` | `mvp` | `text` | Nullable (late 2025+ only). |
| `items[label="Erosion Works..."].responses.text` | `erosion_works` | `text` | Nullable (early 2025 only, removed later). |
| `items[label in Area Of Concerns]` | `area_of_concern` | `text` | Late 2025+: "What is found there and describe the area". Nullable. |
| -- | `id` | `uuid` | Auto-generated primary key. |
| -- | `created_at` | `timestamptz` | Auto-generated. |
| -- | `updated_at` | `timestamptz` | Auto-generated. |

---

### report_entries

One row per task undertaken within a report. Derived from the `Tasks Undertaken` multi-select.

| SC Field Path | DB Column | DB Type | Transformation Notes |
|---|---|---|---|
| -- | `id` | `uuid` | Auto-generated. |
| (parent report) | `report_id` | `uuid FK` | FK to `reports.id`. |
| `items[label="Tasks Undertaken"].responses.selected[N].label` | `task_name` | `text` | One row per selected value. E.g., "Spraying", "Cut & Painting", "Brushcutting". |
| `items[label="Tasks Undertaken"].responses.text` | `task_name` | `text` | Also create rows for any free-text tasks (split on newlines). E.g., "Watering". |
| -- | `created_at` | `timestamptz` | Auto-generated. |

**Extraction**: Iterate over `responses.selected[]` and also parse `responses.text` (if present) to capture free-text additions. Create one row per distinct task.

---

### chemicals

Lookup/reference table for chemical products.

| SC Field Path | DB Column | DB Type | Transformation Notes |
|---|---|---|---|
| -- | `id` | `uuid` | Auto-generated. |
| (derived from Herbicide list options and Chemical Application Record) | `name` | `text UNIQUE` | Deduplicate. Known values: Starane, Glyphosate, Dicamba, Fusilade, Brushwet, Grazon Extra, Metsulfuron. |
| -- | `chemical_type` | `text` | e.g., "herbicide", "additive", "wetter". Manually classified or derived. |
| -- | `created_at` | `timestamptz` | Auto-generated. |

---

### report_chemicals

Chemicals used per report, with rates and volumes where available.

| SC Field Path | DB Column | DB Type | Transformation Notes |
|---|---|---|---|
| -- | `id` | `uuid` | Auto-generated. |
| (parent report) | `report_id` | `uuid FK` | FK to `reports.id`. |
| (resolved chemical) | `chemical_id` | `uuid FK` | FK to `chemicals.id`. |
| `items[label="Herbicide"].responses.selected[N].label` | `chemical_name` | `text` | Denormalised for convenience. One row per selected chemical. |
| Parsed from `items[label="Herbicide"].responses.text` | `rate` | `text` | Parse free text. E.g., "6ml/L". Keep as text due to varied formats. |
| Parsed from `items[label="Herbicide"].responses.text` | `volume` | `text` | Parse free text. E.g., "10L sprayed". Keep as text. |
| Parsed from `items[label="Herbicide"].responses.text` | `raw_note` | `text` | Store the full unparsed line for this chemical. |
| -- | `created_at` | `timestamptz` | Auto-generated. |

**Parsing the herbicide free text**: The `responses.text` field contains lines like:
```
Starane 6ml/L: 60ml - 10L sprayed.
Dicamba: 6ml/L: 60ml - 10L sprayed.
```
Strategy:
1. Split on newlines.
2. Match each line to a chemical name (from `responses.selected[].label` or known chemical list).
3. Extract rate (pattern: `\d+ml/L`) and volume (pattern: `\d+L sprayed`) where possible.
4. Store the raw line as `raw_note` for audit.

---

### species

Lookup/reference table for weed species.

| SC Field Path | DB Column | DB Type | Transformation Notes |
|---|---|---|---|
| -- | `id` | `uuid` | Auto-generated. |
| (derived from Weeds Targeted list options) | `common_name` | `text UNIQUE` | Deduplicate. Known values: Purple Top, Fleabane, Thistle, Prickly Lettuce, Paddy's Lucerne, Bidens Pilosa, Paspalum, Bromus, Pigeon Grass, Kikuyu, African Olive, Moth Vine, Sticky nightshade, Cats claw creeper, Japanese honeysuckle, Balloon Vine, Privett sp., African Love Grass, Lantana, Prickly Pear, Blackberry, Asparagus Fern, Bridal Creeper, Crofton. |
| -- | `scientific_name` | `text` | Nullable. Manually enriched. |
| -- | `species_type` | `text` | "weed" for all current entries. Could support "native" later for flora observations. |
| -- | `created_at` | `timestamptz` | Auto-generated. |

---

### report_species

Weed species targeted per report.

| SC Field Path | DB Column | DB Type | Transformation Notes |
|---|---|---|---|
| -- | `id` | `uuid` | Auto-generated. |
| (parent report) | `report_id` | `uuid FK` | FK to `reports.id`. |
| (resolved species) | `species_id` | `uuid FK` | FK to `species.id`. |
| `items[label="Weeds Targeted"].responses.selected[N].label` | `species_name` | `text` | Denormalised. One row per selected weed. |
| -- | `created_at` | `timestamptz` | Auto-generated. |

**Extraction**: Iterate over `items[label="Weeds Targeted"].responses.selected[]`. Create one row per entry. Also check `Other Weeds` free text -- if it names species not in the predefined list, optionally create `species` rows and link them.

---

### photos

Media items linked to reports and specific items.

| SC Field Path | DB Column | DB Type | Transformation Notes |
|---|---|---|---|
| -- | `id` | `uuid` | Auto-generated. |
| (parent report) | `report_id` | `uuid FK` | FK to `reports.id`. |
| `items[*].media[N].media_id` | `sc_media_id` | `text UNIQUE` | SC media UUID. Dedup key. |
| `items[*].media[N].href` | `sc_href` | `text` | Original SC download URL: `https://api.safetyculture.io/audits/{audit_id}/media/{media_id}` |
| `items[*].media[N].file_ext` | `file_ext` | `text` | e.g., "jpg". |
| `items[*].media[N].label` | `original_filename` | `text` | e.g., "original.jpg". |
| `items[*].media[N].date_created` | `taken_at` | `timestamptz` | ISO 8601. |
| (derived from parent item label) | `context` | `text` | What the photo is attached to. E.g., "Details Of Tasks", "Site Area Work Map", "Area Of Concerns". |
| (Supabase Storage path after download) | `storage_path` | `text` | Path in Supabase Storage bucket after ingestion. Nullable until downloaded. |
| -- | `created_at` | `timestamptz` | Auto-generated. |

**Extraction**: Walk all `items[]`. For each item with a non-empty `media[]` array, create one `photos` row per media entry. Tag with the parent item's `label` as context.

---

### crew

Staff/contractor lookup table.

| SC Field Path | DB Column | DB Type | Transformation Notes |
|---|---|---|---|
| -- | `id` | `uuid` | Auto-generated. |
| (derived from Staff/Contractors list options) | `name` | `text UNIQUE` | Known values: Ryan Arford, Maddie Bryant, Jordan Darnley, Reece Morgan, Matthew Constance, Suzie Kiloh, Josh Collins, Madeline Sharpe. Deduplicate. |
| -- | `role` | `text` | Nullable. E.g., "staff", "contractor". Manually enriched. |
| -- | `active` | `boolean` | Default true. |
| -- | `created_at` | `timestamptz` | Auto-generated. |

---

### crew_hours

Staff hours worked per report.

| SC Field Path | DB Column | DB Type | Transformation Notes |
|---|---|---|---|
| -- | `id` | `uuid` | Auto-generated. |
| (parent report) | `report_id` | `uuid FK` | FK to `reports.id`. |
| (resolved crew member) | `crew_id` | `uuid FK` | FK to `crew.id`. |
| `items[label="Staff/Contractors"].responses.selected[N].label` | `crew_name` | `text` | Denormalised. |
| `items[label="Staff worked hours (individual)"].responses.text` | `hours` | `numeric` | Parse string to number. May need special handling if multiple staff have different hours -- see note below. |
| -- | `created_at` | `timestamptz` | Auto-generated. |

**Note on individual hours**: The SC template has a single "Staff worked hours (individual)" field, which typically contains one number (e.g., "8") representing hours per person. If all staff worked the same hours, create one `crew_hours` row per staff member with that value. If the field contains multiple values or a different format, log for manual review.

**Fallback**: If individual hours are not parseable, derive from `Total Worked Hours / count(Staff/Contractors selected)`.

---

## Chemical Application Record Mapping

Template: separate template_id (not the Daily Work Report template). Only ~3 records in 2025. Contains detailed chemical application data required for regulatory compliance.

### Mapping to existing tables

Most fields map into the same tables as the Daily Work Report, with additional detail.

#### reports table (additional/override fields)

| SC Field Path | DB Column | DB Type | Transformation Notes |
|---|---|---|---|
| `audit_id` | `sc_audit_id` | `text UNIQUE` | Same dedup key. |
| `template_id` | `sc_template_id` | `text` | Different template_id from Daily Work Reports. |
| -- | `report_type` | `text` | Set to "chemical_application_record". |
| `items[label="Site treated"].responses.selected[0].label` | (resolve to `site_id`) | `uuid FK` | Watch for typos: "Hichinbrook" vs "Hinchinbrook". |
| `items[label="Time Start/Finish"].responses.text` | `time_start_finish` | `text` | Raw text e.g., "7:30/3:20". Parse into start/end times if needed. |
| `items[label="Application Method"].responses.selected[0].label` | `application_method` | `text` | e.g., "Backpack". |
| `items[label="Public Notification"].responses.selected[0].label` | `public_notification` | `text` | e.g., "Signage". |
| `items[label="Supervisor's Mobile Number"].responses.selected[0].label` | `supervisor_phone` | `text` | e.g., "0410418083". |
| `items[label="Total Amount Sprayed"].responses.text` | `total_amount_sprayed` | `text` | e.g., "40L". |

#### report_chemicals table (detailed chemical data)

The Chemical Application Record provides significantly more detail than Daily Work Reports.

| SC Field Path | DB Column | DB Type | Transformation Notes |
|---|---|---|---|
| `items[label="Chemical/s Used"].responses.text` | `chemical_name` | `text` | Free text, one chemical per line. Split on newlines. Match to `chemicals` table. |
| `items[label="Rate Used For Each Chemical"].responses.text` | `rate` | `text` | One rate per line, positionally matched to chemicals. E.g., line 1 rate = chemical line 1. |
| `items[label="Concentrate used"].responses.text` | `concentrate` | `text` | One value per line, positionally matched. E.g., "70ml/10L". |
| `items[label="Additives or Wetters"].responses.selected[N].label` | -- | -- | Create additional `report_chemicals` rows for additives. E.g., "Brushwet 2ml/L", "Blue Dye 5ml/L". |

**Positional matching strategy**: The Chemical Application Record uses parallel free-text fields where line N of "Chemical/s Used" corresponds to line N of "Rate Used" and line N of "Concentrate used". Parse all three fields, split on newlines, and zip by position:

```
Chemical/s Used     Rate Used           Concentrate used
─────────────────   ─────────────────   ─────────────────
Glyphosate          7ml/L               70ml/10L
Starane             6ml/L               60ml/10L
Dicamba             6ml/L               60ml/10L
```

#### crew table / crew_hours

| SC Field Path | DB Column | DB Type | Transformation Notes |
|---|---|---|---|
| `items[label="Operator/Applicators Names"].responses.selected[N].label` | `crew_name` | `text` | Same crew members. Cross-reference with `crew` table. |

#### Weather data (Chemical Application Record only)

Weather data is only present in Chemical Application Records. This may warrant a dedicated `report_weather` table or additional columns on `reports`.

| SC Field Path | DB Column | DB Type | Transformation Notes |
|---|---|---|---|
| `items[label="General Weather"].responses.selected[0].label` | `weather_general` | `text` | e.g., "Sunny", "Overcast". |
| `items[label="Wind Direction"].responses.selected[0].label` | `wind_direction` | `text` | e.g., "N", "NW". |
| `items[label="Wind Speed"].responses.text` | `wind_speed` | `text` | Free text. |
| `items[label="Variability"].responses.text` | `wind_variability` | `text` | Free text. |
| `items[label="Rainfall"].responses.text` | `rainfall` | `text` | Free text. |
| `items[label="Temperature"].responses.text` | `temperature` | `text` | Free text. |
| `items[label="Humidity"].responses.text` | `humidity` | `text` | Free text. |

#### photos

| SC Field Path | DB Column | DB Type | Transformation Notes |
|---|---|---|---|
| `items[label="Area Worked"].media[N]` | (same as photos table) | -- | Map photo from the "Area Worked" media field. Set `context` = "Area Worked". |

---

## Data Quality Notes

1. **Site name typos**: "Hichinbrook" vs "Hinchinbrook" observed in Chemical Application Records. Maintain an alias/normalisation map in the `sites` table or a separate `site_aliases` table.

2. **Free-text numeric fields**: Fields like `Total Worked Hours`, `Remaining Hours`, and `Rough percentage of weeds removed` contain inconsistent formats ("24", "N/A", empty, "30-40%"). Store as text and parse to numeric only where cleanly possible.

3. **Label spelling changes**: "Discription" vs "Description" in the area details label. The extraction code must match both variants.

4. **Chemical rates in Daily Work Reports**: The herbicide free-text field mixes chemical names, rates, and volumes in a single block of text. Parsing is best-effort; always store the raw text alongside any parsed values.

5. **Staff hours ambiguity**: The "Staff worked hours (individual)" field is a single value, but multiple staff may be listed. Assumption: all staff worked the same hours unless the text indicates otherwise.

6. **Template versioning**: There is no explicit version field. Detect the template version by checking for the presence/absence of late-2025 fields (e.g., "Address", "MVP of the day?", "How would you rate...").
