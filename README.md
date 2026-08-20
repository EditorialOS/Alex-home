# Alex Home

The client-facing surface for the Alex engine — a branded, multi-client
workspace where a client sees their finished work, approves it, and requests
more. This app is the **face**, not the brain: it reads The Gate and the Context
API, it never re-implements them.

- **Stack:** Next.js (App Router) + TypeScript, Tailwind, deployed on Vercel.
- **Data + auth:** Supabase (per-client isolation via Row Level Security).
- **Scheduler:** Vercel Cron (added in Phase 3).

Build status: **Phase 0 — blank app, live on Vercel.** No screens yet.

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values. `.env.local` is
gitignored and must never be committed. Keys never go in code.

| Variable | Where to get it | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Public, safe in browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon key | Public, safe in browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role key | **Server only.** Full admin. Not used until Phase 2 |

The same three variables must also be added in **Vercel → Project → Settings →
Environment Variables** so the deployed app can reach Supabase.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000.
