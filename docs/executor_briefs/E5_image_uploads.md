# Executor Brief E5 — Image Uploads (Supabase Storage)

**Depends on: E2 committed.** Runs in parallel with E3, E4. Commit to `feat/report-generator`.

---

## 1. Context

Report templates have placeholder figures for:
- **§1.0 Project Location maps** — static per-client (Map 1.0, Map 1.1). URLs stored in `clients.location_maps jsonb`.
- **§4.0 Period polygon overlay maps** — per-report manual upload (Map 2.0, Map 2.1). URLs stored in `client_reports.period_map_images jsonb`.

Currently these are just coloured placeholder boxes in the HTML with `data-placeholder` + `data-editable` attributes. User wants drag-drop image upload in the review modal so Ryan can swap placeholders for real images.

Images need durable hosting. Use **Supabase Storage**.

**Read first:**
- `dashboard-preview.html` — modal + edit-mode JS (`previewReport`, `applyEditModeToIframe`, `saveReportEdits`)
- `src/report/templates/bush_regen.html.ts` — placeholder markup
- Supabase client already loaded in dashboard-preview (global SUPABASE_URL + key)

---

## 2. Scope

### A — Create Storage bucket

Via migration 008 (or direct via `exec_sql` RPC):

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('report_assets', 'report_assets', true)
ON CONFLICT (id) DO NOTHING;

-- Public read, service-role write
CREATE POLICY "public read report_assets" ON storage.objects
  FOR SELECT USING (bucket_id = 'report_assets');

CREATE POLICY "service role write report_assets" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'report_assets')
  TO service_role;
```

Object paths: `report_assets/{client_id}/{type}/{filename}` — e.g. `report_assets/abc123/location_map/map_0.png`.

### B — Upload helper in dashboard

Add to `dashboard-preview.html`:

```js
async function uploadImage(file, clientId, type /* 'location_map' | 'period_map' */) {
  const ext = file.name.split('.').pop();
  const filename = `${type}_${Date.now()}.${ext}`;
  const path = `${clientId}/${type}/${filename}`;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/report_assets/${path}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': file.type },
    body: file,
  });
  if (!r.ok) throw new Error(`Upload failed: ${r.status}`);
  return `${SUPABASE_URL}/storage/v1/object/public/report_assets/${path}`;
}
```

### C — Drop-zone overlay in report preview (edit mode only)

When edit mode is on AND iframe is loaded, scan the iframe's DOM for elements matching `[data-placeholder][data-editable="true"]` and turn each into a drop-target:

- Hover state: dashed amber border + "Drop image here" overlay
- On drop: call `uploadImage(file, clientId, type)` where `type` is derived from `data-placeholder` (`location_map_0` / `location_map_1` → 'location_map'; `period_map_0` / `period_map_1` → 'period_map')
- After upload: replace the `<figure>` markup with an `<img src={url}>` wrapped in a figure, keep the `<figcaption>`. Trigger the existing `markDirty()` so Save Changes lights up.
- On Save Changes: the edited html_content (with img URLs baked in) goes to `client_reports.html_content`. ALSO update `client_reports.period_map_images[]` or `clients.location_maps[]` depending on the slot.

### D — Separate flow for client-level location maps

On the Client Detail page (E4 will build this — coordinate if possible, otherwise stub): a standalone upload widget NOT inside the report preview. Lets Ryan upload Map 1.0 and Map 1.1 ONCE per client, then every report for that client auto-references them.

If E4 isn't merged yet when you start, skip this section and leave a TODO comment pointing at it.

### E — Generator update

In `src/report/aggregate.ts`, when populating §1.0 Project Location:
- Read `clients.location_maps` — array of URLs
- If populated, render `<img src={url}>` in place of the placeholder figure
- If empty or fewer than expected, fall back to the existing placeholder markup

Same for §4.0 from `client_reports.period_map_images` (but this is only populated per-report via the drop-zone flow, so initial render will always be placeholders; user uploads then re-save updates the stored html_content).

### F — Size limit + error handling

- Max 10 MB per image (check `file.size` client-side before upload)
- Show inline error in the drop-zone if upload fails
- Only accept `image/png`, `image/jpeg`, `image/webp`

---

## 3. Acceptance Gate

```bash
npm run build && npm test
```

Manual test:
1. Open dashboard → Reports → Preview on EBSF June draft → toggle Edit mode
2. Drag an image from desktop onto the "Map 1.0" placeholder in §1.0
3. Image uploads → URL appears in the figure → Save Changes persists to DB
4. Reload dashboard → Preview again → image still shows
5. In Supabase Studio, verify the file exists at `report_assets/{client_id}/location_map/...`
6. Re-run the generator: `npm run report -- --client EBSF --month 2025-06` — new report should pick up the uploaded `clients.location_maps` URL and render `<img>` instead of placeholder.

Commit to `feat/report-generator`. Summary: bucket live, drop-zone UX working, where the URL is stored, any RLS gotchas.
