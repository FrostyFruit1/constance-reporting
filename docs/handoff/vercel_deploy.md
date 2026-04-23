# Vercel Deploy — Import & Link Runbook

*Pick up here for the interactive web-dashboard step.*

The repo is scaffolded for Vercel static hosting (served via `vercel.json`). All
you need to do is import it in the Vercel web dashboard and paste the deployed
URL back so we can link cc-dashboard to it.

---

## What's already scaffolded in this repo

- **`vercel.json`** — tells Vercel to serve `dashboard-preview.html` at the root
  path. No build step (static file). `cleanUrls` on so paths don't require the
  `.html` extension.
- **`.vercelignore`** — excludes `node_modules/`, `dist/`, `docs/`, `src/`,
  `samples/`, `.env`, source reports, screenshots, etc. Only the dashboard HTML
  + any static assets end up on the deploy.
- **Hardcoded Supabase creds** in `dashboard-preview.html` lines ~503-504 work
  in production because the service-role key bypasses RLS. This is acceptable
  for an internal tool. If we later expose this publicly, rotate to anon key
  with RLS policies.

---

## Steps for Peter (in Vercel web dashboard)

1. Go to https://vercel.com/new
2. Sign in to Vercel with whichever account you want owning the deploy. If this
   is for Constance Conservation, use the account tied to your CC email so the
   team can access it later.
3. **Import Git Repository** — find `FrostyFruit/constance-conservation`
   (you may need to grant Vercel access to that GitHub org/account).
4. Project settings:
   - **Framework Preset:** `Other` (vercel.json handles the rest)
   - **Root Directory:** `./`
   - **Build & Output:** leave defaults — the `vercel.json` overrides these to no-build
5. Environment Variables: **skip for now** (creds are hardcoded in the dashboard).
   If you want to clean that up later, you'd set:
   - `SUPABASE_URL` = `https://ymcyunspmljaruodjpkd.supabase.co`
   - `SUPABASE_KEY` = (service-role JWT)
6. Click **Deploy**.
7. Wait ~30 seconds. You'll get a URL like:
   `constance-conservation-<hash>.vercel.app` or a clean domain if configured.
8. **Copy that URL and paste it back to the orchestrator.**

---

## What the orchestrator does next (after you paste the URL)

1. Navigate to `~/Documents/cc-dashboard/` (already cloned)
2. Edit `app/(dashboard)/page.tsx` — find the APPS array:
   ```ts
   { id: 'staff', href: '/reporting', name: 'Staff Reporting', icon: 'staff' as const,
     desc: 'Daily reports, timesheets & incident logs' },
   ```
3. Change `href: '/reporting'` → `href: '<YOUR_VERCEL_URL>'`
4. If the app card's `<Link>` should open in a new tab rather than replace the
   master dashboard view, also update the Link component to set `target='_blank'
   rel='noopener noreferrer'`.
5. Commit + push via the CC-account SSH remote:
   ```bash
   cd ~/Documents/cc-dashboard
   git add app/\(dashboard\)/page.tsx
   git commit -m "feat(reporting): link Staff Reporting card to deployed app"
   git push origin main
   ```
6. Verify: refresh the master dashboard → click Staff Reporting → our app opens.

---

## If something breaks

- **Vercel deploys an empty page** — likely `vercel.json` rewrites not matching.
  Check `Source: "/"` matches your deployed URL root.
- **Dashboard loads but all sections say "No data"** — hardcoded creds in
  `dashboard-preview.html` didn't come through. Verify the file was included
  (check `.vercelignore` didn't exclude it).
- **CORS errors in browser console** — Supabase PostgREST may block cross-origin
  requests from the new Vercel domain. Fix: Supabase Studio → Project Settings
  → API → CORS Allowed Origins → add the Vercel URL.
- **cc-dashboard push fails** — verify `git remote -v` in cc-dashboard shows
  `git@github.com-cc:...` and `ssh -T git@github.com-cc` works.
