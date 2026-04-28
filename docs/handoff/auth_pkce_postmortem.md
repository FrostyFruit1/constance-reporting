# Postmortem: cc-dashboard magic-link auth silently dropping sessions (2026-04-23)

**TL;DR:** After the Supabase project migration, `cc-dashboard` magic-link
sign-in appeared to "work" (no errors) but kept dumping users back at `/login`.
Root cause: cc-dashboard's auth handlers only processed the legacy
`?token_hash=` flow, but supabase-js v2's default **PKCE flow** sends users
back with `?code=` instead. The code was thrown away and no session cookie
was ever set.

Fix shipped on branch `fix/auth-pkce-code-exchange` in `cc-dashboard`,
merged into main 2026-04-23.

---

## Symptoms the user observes

If you see ANY of these, suspect this bug:

1. `/login` says "Check your email" (no error), email arrives, user clicks
   the magic link — and lands back at `/login` with **no error banner**.
2. URL bar after click briefly contains `?code=<uuid>` before redirect.
3. Vercel runtime logs show no explicit auth error — `exchangeCodeForSession`
   is never called.
4. `GET /` returns 307 → `/login` (middleware sees no session because the
   code was never exchanged).
5. Email magic link URL contains `token=pkce_…` (the `pkce_` prefix is
   the diagnostic tell).

Specifically **not** caused by this bug:

- `otp_expired` — that's an invalidated/expired token, not the flow mismatch.
  Usually happens when multiple magic link requests overlap (each new
  request invalidates prior tokens).
- `over_email_send_rate_limit` — Supabase per-email cooldown (~60s).
- `MIDDLEWARE_INVOCATION_FAILED` 500 — env-var propagation issue, not auth
  flow. Check Vercel env vars match the active Supabase project.

---

## How we identified it

1. **Reproduced the flow directly.** `curl -i -X POST` against
   `/api/auth/login` showed a 307 to `/login?sent=1` — the email was
   genuinely being sent. So "magic link send" wasn't broken.

2. **Inspected the email link the user got.** The URL was:
   ```
   https://ymcyunspmljaruodjpkd.supabase.co/auth/v1/verify
     ?token=pkce_b20c070e...
     &type=magiclink
     &redirect_to=https://cc-dashboard-rouge.vercel.app
   ```
   Two red flags:
   - `token=pkce_...` → PKCE flow (not the `?token_hash=` flow the app
     expected)
   - `redirect_to=https://cc-dashboard-rouge.vercel.app` (bare root) — NOT
     the `emailRedirectTo: ${siteUrl}/api/auth/confirm` that
     `app/api/auth/login/route.ts` sets. Supabase silently stripped the
     custom path because it wasn't in the project's **Redirect URLs
     allowlist**.

3. **Read the app's auth handlers.** `app/api/auth/confirm/route.ts` only
   called `supabase.auth.verifyOtp({ token_hash, type })`. `middleware.ts`
   only called `supabase.auth.getUser()`. Neither ever called
   `exchangeCodeForSession(code)` — the method PKCE requires.

4. **Traced the click.** Click the `pkce_` link → Supabase's verify
   endpoint consumes the token, generates an auth code, redirects to
   `redirect_to?code=X` (code in query string, not fragment). User lands
   at `cc-dashboard-rouge.vercel.app/?code=X`. Middleware runs, ignores
   `code`, calls `getUser()` which returns null (no session cookie yet —
   that requires exchanging the code), redirects to `/login`. Code is
   discarded.

That's the bug: the app was deaf to the PKCE flow's entire handoff.

---

## The fix (commit `ba3591d` on branch `fix/auth-pkce-code-exchange`)

Two files changed:

### `middleware.ts` — exchange code early
```typescript
const code = searchParams.get('code')

// if code present, we'll redirect to clean URL after exchange
let response: NextResponse
if (code) {
  const cleanUrl = request.nextUrl.clone()
  cleanUrl.searchParams.delete('code')
  response = NextResponse.redirect(cleanUrl)
} else {
  response = NextResponse.next({ request })
}

const supabase = createServerClient(url, anonKey, { cookies: {...} })
// ^ cookies setAll writes to `response` — so whichever branch we picked
//   above receives the Set-Cookie headers from exchange

if (code) {
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return redirect('/login?error=confirm')
  return response  // redirect with session cookie attached
}

// normal auth-gate path
const { data: { user } } = await supabase.auth.getUser()
if (!user) return redirect('/login')
return response
```

Key detail: the cookies `setAll` callback writes to whichever `response`
object we built upfront. This lets a single client instance set cookies
on either a `next()` OR a `redirect()` response without juggling cookies
between objects.

### `app/api/auth/confirm/route.ts` — accept both flows

```typescript
const code = searchParams.get('code')
const token_hash = searchParams.get('token_hash')
const type = searchParams.get('type')

if (code) {
  // PKCE — current supabase-js v2 default
  await supabase.auth.exchangeCodeForSession(code)
} else if (token_hash && type) {
  // Legacy — still needed for email_confirm / recovery flows
  await supabase.auth.verifyOtp({ token_hash, type })
}
```

Belt-and-braces: middleware catches `?code=` on ANY path, and confirm
handles both flows for completeness.

---

## Prevention & follow-up tasks

1. **Update Supabase Auth URL Configuration.** The root cause of the
   stripped `/api/auth/confirm` redirect is the new project's allowlist
   being default/empty. Do this once per Supabase project:
   - Supabase dashboard → project `ymcyunspmljaruodjpkd` →
     **Authentication → URL Configuration**
   - **Site URL:** `https://cc-dashboard-rouge.vercel.app`
   - **Redirect URLs** — add all of:
     - `https://cc-dashboard-rouge.vercel.app/**`
     - `https://cc-dashboard-*.vercel.app/**` (for Vercel preview deploys)
     - `http://localhost:3000/**`

   Without these, `emailRedirectTo: /api/auth/confirm` silently collapses
   to the Site URL. After adding, the app's intended flow (`redirect_to`
   respected, confirm route called directly) works alongside the middleware
   fallback.

2. **Never assume migrated Supabase projects inherit URL configuration.**
   When moving Supabase projects, the URL Configuration is **not** part of
   the data migration. It's a project-level setting that must be reconfigured
   manually on the new project. Add this to the Supabase-migration runbook.

3. **When debugging "magic link does nothing," check the token prefix.**
   - `token=pkce_...` → PKCE flow, must call `exchangeCodeForSession`
   - `token=<hex>` (no prefix) → implicit flow, tokens in URL fragment
     (not sent to server) — needs client-side handling
   - `token_hash=<hash>&type=magiclink` → legacy verifyOtp flow
   The `@supabase/ssr` + `supabase-js` v2 stack defaults to PKCE. Any
   app built from the quickstart docs that doesn't include
   `exchangeCodeForSession` will have this bug latent.

4. **Rate-limit discipline when debugging.** Every `signInWithOtp` and
   every admin `generate_link` call invalidates prior tokens for that
   email AND ticks the per-email send cooldown (~60s). If you're debugging
   with curl, know that each test burns an email AND resets the clock.
   Batch your diagnostic calls and give the user a single clean attempt
   window.

5. **Admin-generated links don't help with this bug.** The admin
   `generate_link` endpoint produces classic `/auth/v1/verify?token=X` URLs
   which use the **implicit** flow — tokens land in the URL fragment, which
   the server can't read. For cc-dashboard (SSR / server component app),
   only the `signInWithOtp`-generated email links (PKCE) work end-to-end.

---

## References

- Fix branch: `fix/auth-pkce-code-exchange` on `cc-dashboard`
- Fix commit: `ba3591d`
- Related files:
  - `cc-dashboard/middleware.ts`
  - `cc-dashboard/app/api/auth/confirm/route.ts`
  - `cc-dashboard/app/api/auth/login/route.ts` (the source of `emailRedirectTo`)
- Supabase docs on PKCE: https://supabase.com/docs/guides/auth/server-side/nextjs
- Supabase URL Configuration: https://supabase.com/docs/guides/auth/redirect-urls
