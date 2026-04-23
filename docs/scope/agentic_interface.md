# Agentic Interface — Scope & Roadmap

*Make every piece of data the platform holds agent-readable, so AI agents (internal
or external, single-purpose or general-purpose) can connect, read state, take action,
and subscribe to events.*

**Status:** scoped, not started. Target milestone: M05 (post M04 review/send).

---

## 1. Why agent-readable

The platform's value compounds when agents can:

- **Read** — query any client, site, zone, inspection, report, media asset, or
  aggregation without hand-writing SQL.
- **Act** — generate reports, approve drafts, add zones, flag a media file, trigger a
  re-ingest, send a report. Without a human in the loop when appropriate.
- **Subscribe** — react to new inspections arriving, draft reports needing review,
  schedule firings. Event-driven instead of polling.
- **Converse** — the data + tools surface lets Cameron/Ryan talk to the platform
  ("how many hours did we do on EBSF last month?", "generate the Camden Q2 summary
  and email it to Steven"), not click through menus.

Today, the only interface is SQL via Supabase + the CLI + the dashboard. Those are
human interfaces. The goal here is to make an equally capable **machine interface**.

---

## 2. Deliverables (high level)

| # | Capability | Interface | Effort |
|---|---|---|---|
| 1 | Canonical data schema as machine-readable spec | OpenAPI 3 + JSON Schema generated from DB | S |
| 2 | Typed REST API (beyond raw Supabase PostgREST) | Express/Hono or Supabase Edge Functions | M |
| 3 | Agent actions as composable tools | MCP server exposing tools | M |
| 4 | Scoped agent authentication | API keys with scoped role (read-only / report-ops / admin) | S |
| 5 | Event stream | Supabase Realtime channels + optional webhooks | S |
| 6 | Semantic search over inspection narratives and report content | pgvector embeddings | M |
| 7 | Audit log for all agent actions | `agent_actions` table + middleware | S |
| 8 | Natural-language query endpoint | LLM → tool call → formatted response | M |

Total: ~1-2 weeks of focused work, can be broken into 3-4 executor briefs.

---

## 3. Data model — what agents need to see

Everything in the platform should be accessible via a single typed object graph.
Proposed top-level resources:

```
Organization
  Clients
    Sites
      Zones (sub-sites)
      ClientReports
        WeedWorks (§4.1 rows)
        HerbicideSummary (§6 rows)
        StaffSummary (§3 rows)
      Inspections (daily SC data)
        Personnel / Tasks / Weeds / Chemicals / Media / Observations
    Contracts / Stakeholders / Notes
  Staff
  Species (lookup)
  Chemicals (lookup)
  Sites (flat, for search)
  MediaAssets (uploaded + pulled from SC)
AgentActions (audit log)
```

Every resource gets:
- Stable UUID
- `created_at`, `updated_at`, `created_by` (human user id OR agent id)
- Canonical name + alias list (where applicable)
- Status enum where state matters

---

## 4. The three pillars

### Pillar A — Read (no action, just observation)

**Minimum viable surface:**
- `GET /clients` → list clients with site/zone counts
- `GET /clients/:id` → full client detail
- `GET /clients/:id/sites` / `/sites/:id/zones` / `/zones/:id/inspections`
- `GET /reports?status=draft` → list drafts
- `GET /reports/:id` → full report including html_content, narrative_sections, zones_included
- `GET /inspections?site_id=X&date_from=...&date_to=...`
- `GET /aggregates/staff_hours?client_id=X&period_start=...&period_end=...`

Powered by a generated OpenAPI spec from the DB schema. Use
[supabase-openapi](https://github.com/supabase/supabase/blob/master/docs/guides/api) +
hand-curated extensions for aggregation endpoints.

**Semantic search** (Pillar A extension):
- Embed every `inspection.details_of_tasks` narrative + every report narrative section
- Store vectors in a `content_embeddings` table (pgvector)
- `GET /search?q=...` → nearest-neighbor across inspections + reports

### Pillar B — Act (tools that change state)

Expose as MCP tools so Claude / other LLM clients can invoke them directly:

```yaml
tools:
  - name: generate_report
    description: Generate a draft client report for a given scope and period.
    inputs: { client_id | site_id | zone_id, period_start, period_end, cadence }
    returns: { report_id, html_url, docx_url, status }

  - name: approve_report
    description: Mark a draft report as approved (ready to send).
    inputs: { report_id, approver_agent_id }
    returns: { status }

  - name: send_report
    description: Send an approved report to the client via Resend.
    inputs: { report_id }
    returns: { sent_at, resend_message_id }

  - name: add_zone
    description: Create a new zone under a site.
    inputs: { site_id, zone_name, billable, schedule_config? }
    returns: { zone_id }

  - name: ingest_inspection
    description: Re-fetch and re-parse a specific SC audit.
    inputs: { sc_audit_id }
    returns: { inspection_id, status, warnings }

  - name: upload_map_image
    description: Upload a location or period map for a client/report.
    inputs: { target_type, target_id, image_url | base64 }
    returns: { url }
```

Every tool call:
- Validated against schema before execution
- Logged to `agent_actions` with who/when/what/result
- Subject to the agent's auth scope (see Pillar C)

### Pillar C — Auth & scoping

Not every agent should be able to do everything. Scoped API keys:

| Scope | Can read | Can write | Example agents |
|---|---|---|---|
| `readonly:analyst` | all | nothing | BI dashboards, reporting tools |
| `readwrite:ingest` | inspections, sites | inspections, media | SC sync, webhook handler |
| `readwrite:report` | all | reports, staff_hours | Report generator agent, review bot |
| `admin:ops` | all | all | Ops automation (Ryan's agent) |
| `admin:full` | all | all incl. schema | Engineering |

Key format: `ck_<scope>_<randomhash>`. Stored hashed in an `agent_api_keys` table.
Middleware validates on every call, attaches scope to request, logs to
`agent_actions`.

---

## 5. Event stream

Agents subscribe to changes instead of polling.

**Supabase Realtime** covers DB-level events for free:
- `inspection.inserted` — new daily report ingested
- `client_report.status_changed` — draft → approved → sent
- `media.uploaded` — new image available for review

**Custom events** via a `system_events` table + trigger:
- `report.generation_failed`
- `parser.warnings_threshold_exceeded`
- `schedule.cron_fired`

**Outbound webhooks** for agents that live outside the Supabase network:
- `agent_webhooks` table: `{ agent_id, url, events[], secret }`
- Edge function publishes to subscribers on each event

---

## 6. Natural-language query endpoint

The payoff — Cameron/Ryan talk to the platform.

```
POST /ask
{ "question": "what zones are we running behind on for Camden?" }
→ LLM plans → calls read tools → returns formatted response with citations
```

Implementation:
- System prompt describes available tools + data model (use the OpenAPI spec
  directly as context)
- Claude Sonnet 4.6 or similar handles the planning
- Every tool call is logged (it's the same agent interface as Pillar B, just a
  different caller)
- Response is grounded — cites specific inspection IDs, report IDs, dates

Peter's vision: "I should be able to ask Constance the platform anything about
Constance the business, and get a cited answer in 10 seconds."

---

## 7. Prerequisites

Before we start building, we need:

- [x] **M03 complete** — ✅ report generator + data model hierarchy in place
- [ ] **M04 complete** — approve/send workflow, Resend integration (some tools depend on it)
- [ ] **Real client roster ingested** — so agent responses aren't against a single-pilot dataset
- [ ] **Backfill cleaned** — stable sc_template_type, canonical site names (mostly done post-E6)

None are blockers; they make the agent surface more useful.

---

## 8. Proposed milestone breakdown

**M05a — Read surface + OpenAPI spec** (1-2 exec hours)
- Generate OpenAPI from DB via `supabase-api-docs` or hand-written spec
- Publish at `/api/openapi.json`
- Add 5-6 aggregation endpoints that raw PostgREST can't easily produce (staff hours,
  weed works, herbicide totals for arbitrary scopes)

**M05b — MCP server (write actions)** (2-3 exec hours)
- Node MCP server wrapping the 6 tools above
- Deployable locally; later wrap as a Claude Desktop connector or MCP-compatible host
- Audit log middleware

**M05c — Auth + scoped keys** (1 exec hour)
- `agent_api_keys` table
- Middleware for scope enforcement
- Admin UI to issue/revoke keys

**M05d — Event stream + webhooks** (1 exec hour)
- Realtime channels already work — just document them
- Outbound webhook registrar

**M05e — Semantic search + /ask** (2-3 exec hours)
- pgvector setup, embeddings backfill
- `/search` endpoint
- `/ask` endpoint that orchestrates LLM → tool calls → response

Total: ~8-12 executor hours, split across 3-5 briefs, can run sequentially.

---

## 9. Non-goals (explicitly)

- Not building a public-facing API for third parties yet
- Not re-inventing Supabase auth — piggyback on it
- Not implementing every possible aggregation as a pre-baked endpoint — the /ask
  surface handles the long tail
- Not building a web UI for agent management in M05 — CLI tools are fine for ops
- Not implementing fine-grained row-level access control beyond scope-level — that's
  a future privacy / multi-tenancy concern

---

## 10. Open questions before we start

1. **Hosting target** for the MCP server — local-only, Railway, Supabase Edge
   Functions, or something else?
2. **LLM for /ask** — Claude (we already use for narratives) or cheaper/faster option
   like Haiku?
3. **Embedding model** — OpenAI ada-2 is easy; local model like nomic-embed is cheaper
   long-term but adds infra.
4. **Scope for first wave of agents** — who's the first non-human consumer? Ryan's
   phone-based ops agent? A nightly report-review bot? This shapes which tools get
   priority.
5. **Action latency tolerance** — sync tool calls (like `generate_report`) can take
   30-60s on LLM narratives. Async + polling pattern or sync with timeout?

These aren't blocking — scope can proceed with sensible defaults — but worth raising
with Peter before executor briefs are written.
