# Constance Conservation — Client & Site Onboarding

*For Cameron and Ryan — a 5-minute read, then a 30-minute spreadsheet task.*

---

## What this is

We've built the automated client-report pipeline. It pulls your daily Safety Culture
inspections and generates the monthly (or weekly) client reports you're currently
spending 6-8 hours writing by hand.

Before the first real client report goes out, the system needs to know your full
client roster — who you bill, where they are, and what zones sit inside each site.
This doc shows you how we've structured it and asks you to fill in the roster.

---

## How we think about it (three levels)

```
Client        = the paying entity. A council, a trust, a developer, a private landholder.
                Example: Camden Council
  │
  └── Site   = a named project or property you work on for that client.
              Example: Elderslie Banksia Scrub Forest (EBSF)
      │
      └── Zone = a billing unit inside a site. Usually a polygon or named area.
                  Example: Zone B, Zone C, "Planting Area", "Watering"
```

**Why three levels?** Because a client can have multiple sites, and each site can be
split into zones that get billed / reported separately. When you generate a report,
you can choose any level:

- **Zone report** — just Zone B of EBSF
- **Site report** — all zones of EBSF rolled up (what you do today for Camden)
- **Client report** — every site this client has, everywhere (for clients with multiple
  projects)

---

## Naming Conventions

Being consistent here saves Ryan ongoing cleanup work and means the system can
automatically match daily inspections to the right site/zone without you having to
intervene.

### Client names

- **Use the full official name** — no abbreviations.
  - ✅ `Camden Council`, `Liverpool City Council`, `Western Sydney Parklands Trust`
  - ❌ `Camden`, `WSPT`, `LCC`
- Sentence case, no trailing punctuation.
- Private clients: use their legal/billing name.

### Site short name (what field workers type in Safety Culture)

- Keep it **short and typeable** — this goes in SC's "Client / Site" field every day.
- Prefer an acronym or short ID: `EBSF`, `WSPT Central`, `Cloverhill Riparian`.
- ALL CAPS for acronyms; Title Case otherwise.
- Unique across the whole org — don't reuse.

### Site long name (displayed in client reports)

- **The polished name the client sees.** Written out in full.
  - ✅ `Elderslie Banksia Scrub Forest`
  - ✅ `Western Sydney Parklands — Central`
- Sentence case. This appears in the report title: *"Elderslie Banksia Scrub Forest Zone B and C June 2025 Monthly Report."*

### Zone names

Two conventions, pick one per site depending on how the site is structured:

**Pattern A — Lettered zones (the default for most sites)**
- Format: `{Site Short Name} Zone {Letter}`
- Examples: `EBSF Zone A`, `EBSF Zone B`, `EBSF Zone C`
- Combined zones worked on the same day: `EBSF Zone B and C` (umbrella)
- Letters are the billing unit.

**Pattern B — Themed zones (for multi-type work)**
- Format: `{Site Short Name} {Theme}`
- Examples: `EBSF Planting`, `EBSF Watering`, `EBSF Maintenance`
- Use when different work types need separate reporting, regardless of location.

**Mixed is fine:** A site can have both `Zone A`, `Zone B`, and `Planting` zones. Just
make sure each zone has a unique, descriptive name.

### Consistency rules (important)

- **Exactly one canonical spelling per client/site/zone.** `EBSF Zone C(Planting)` and
  `EBSF Zone C (Planting)` are the SAME zone — pick one and stick with it.
- **No trailing whitespace or stray characters.** The system trims these automatically
  but they cause confusion in reports.
- **If you change a name later, tell us.** We can add the old name as an alias so
  historical data stays linked.

---

## What we need from you

Fill in the roster template: `docs/handoff/roster_template.csv` (or copy the same
structure into a Google Sheet — whichever is easier).

### What each column means

| Column | Required | Example | Notes |
|---|---|---|---|
| `client_name` | yes | `Camden Council` | Full official name |
| `client_contact_name` | yes | `Steven Robertson` | Who reports are addressed to |
| `client_contact_email` | yes | `s.robertson@camden.nsw.gov.au` | Where reports get sent |
| `client_contact_phone` | no | `02 4654 7777` | Optional |
| `site_short_name` | yes | `EBSF` | What workers type in SC |
| `site_long_name` | yes | `Elderslie Banksia Scrub Forest` | What clients see |
| `zone_name` | yes | `Zone B` | See patterns above |
| `zone_billable` | yes | `yes` / `no` | Does this zone generate invoices? |
| `report_cadence` | yes | `weekly` / `monthly` / `quarterly` / `off` | How often you want auto-drafts |
| `notes` | no | `Council also wants quarterly summary` | Anything useful |

### What happens after you fill it in

1. You hand it back to Peter.
2. We run it through a CSV importer — takes ~5 minutes.
3. Your dashboard at Clients → you'll see every client, site and zone nested correctly.
4. Every daily inspection from now on will auto-link to the right zone.
5. On the configured cadence (weekly/monthly/etc.), the system will auto-generate a
   draft report. You open it, review for ~15 minutes, edit anything that needs tweaking,
   approve, send.

### What you do *not* need to fill in

- Historical inspections — those are already ingested.
- The hierarchy above the client (Constance Conservation as an org) — already set up.
- Staff names — the system pulls them from inspections automatically.
- Species / chemicals — already in our lookup tables.
- Individual daily report content — keeps flowing from SC like normal.

---

## One ask while you're filling the template

**If you're willing:** update your Safety Culture "Daily Work Report" template so the
"Client / Site" field is a **dropdown** populated from your site list above, instead of
free text.

- Prevents typos at the source.
- Means the system auto-links 100% of new inspections instead of 85%.
- Cameron, this is ~20 minutes in the SC admin UI once per update.

If you can't or don't want to, it's fine — we catch typos automatically with a fuzzy
match against the canonical list. A dropdown is just cleaner.

---

## Questions?

Peter's your first stop. Anything the system can't handle, we flag and iterate.

**Next steps after the roster is in:**
1. We turn on auto-generation for whichever clients you mark `weekly` or `monthly`.
2. First batch of drafts lands in the dashboard Reports tab.
3. Ryan reviews one, Cameron signs off, we send.
4. From there, it's in motion.
