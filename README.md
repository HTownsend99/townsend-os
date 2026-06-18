# Big Dawg HQ — v2 Deployment Guide

This update brings: visual overhaul, Calendar page, PWA support (proper standalone home-screen app).

## What you need to update in your GitHub repo

Replace these files with the new versions in this folder:

| File | Action |
|---|---|
| `src/App.tsx` | **REPLACE** with new version (was `cfa4c855-...tsx`) |
| `src/main.tsx` | Keep existing if it matches; otherwise replace |
| `src/supabaseClient.ts` | Keep existing |
| `index.html` | **REPLACE** with new version |
| `package.json` | Replace (added `@types/react` types) |
| `tsconfig.json` | Keep existing |
| `vite.config.ts` | Keep existing |
| `vercel.json` | Keep existing |
| `schema.sql` | No DB changes required — schema unchanged |

## New files to add

Add these to your `public/` folder:

- `public/manifest.webmanifest`
- `public/icon-192.png`
- `public/icon-512.png`
- `public/apple-touch-icon.png`

## Deploy steps

1. Pull all the new files into your local GitHub repo
2. Commit and push to main
3. Vercel will auto-deploy
4. No environment variable changes needed — same Supabase keys

## After deployment — pin to home screen as standalone app

Once deployed, on your iPhone:

1. Open Safari (not Chrome) and visit your Vercel URL
2. Tap the Share icon → "Add to Home Screen"
3. The icon is now a proper standalone app — no Safari chrome, opens in fullscreen with the Big Dawg HQ icon

Because the `manifest.webmanifest` and `apple-touch-icon.png` are now hosted on your domain, iOS recognises it as a proper PWA and treats it as a standalone app.

## Local development

```bash
npm install
npm run dev
```

## What's new in v2

- **Calendar page** — switch between Tasks and Calendar via the top tab bar. Shows a monthly calendar with coloured dots for tasks on each date, plus an "Upcoming" list of all dated tasks
- **Visual overhaul** — denser layout, larger text, three-column task layout with priority badge in the middle, richer per-heading colour theming
- **Smart text formatting** — high priority/urgent/overdue tasks are bold, low priority is italic
- **PWA install** — proper standalone home screen app with icon
- **Sign out button** in the header
