# Townsend OS

Townsend OS is a private personal operations workspace for tasks, calendar events, inbox triage and recurring bills. The React client is hosted on Vercel and uses Supabase Auth and Postgres.

## Security model

- The browser contains no private seed records. Data loads only after Supabase restores a valid session.
- Row-level security limits tasks, bills, events and inbox items to the authenticated owner UUID.
- `job_applications` is not a browser feature. Its anon and authenticated privileges are revoked and RLS is enabled without client policies.
- The public Supabase URL and publishable/anon key are configuration, not secrets. The service-role key, email provider key and cron credentials must only exist in Supabase function secrets.
- Public self-registration should remain disabled in Supabase Auth. Add legitimate accounts through an administrator-controlled flow.

## Local development

Create `.env.local` with:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

Then run:

```bash
npm install
npm run typecheck
npm run dev
```

## Verification

```bash
npm run typecheck
npm run build
npm audit
```

The database migration is recorded in `supabase/migrations/`. The `morning-brief` Edge Function requires the service-role bearer token at both the gateway and function boundary, plus these function secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `TOWNSEND_USER_ID`
- `BRIEF_TO_EMAIL`
- `BRIEF_FROM_EMAIL`

## Deployment

Changes merged to the GitHub default branch are deployed by the linked Vercel project. `vercel.json` supplies the single-page-app rewrite and browser security headers. The production service worker caches only the application shell and same-origin static assets; Supabase data is never placed in its cache.

To install on iPhone, open [townsend-os.com](https://townsend-os.com) in Safari, use Share, then choose **Add to Home Screen**.
