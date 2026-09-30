# Striver A2Z DSA Progress Tracker

A responsive, local-first tracker for Striver’s Take U Forward A2Z DSA roadmap. It organizes the curriculum into 20 modules, 84 sections, and 495 lessons. Lesson titles and direct video links are kept in the static curriculum file.

## Features

- Mark lessons complete and see live lesson, section, module, and dashboard progress.
- Track first-start, completion, and last-activity timestamps for each lesson.
- Save progress immediately in the browser and keep using the app offline.
- Optionally sync progress through Supabase across paired devices. Conflicts merge per lesson using the latest activity timestamp.
- Pair a phone or tablet with a single-use code or QR link that expires after five minutes. There is no account, email, or password flow in the tracker.
- Install the app as a PWA on Android or desktop. The service worker caches the application shell; streaming YouTube videos still requires internet.
- Export and import a progress backup from Settings.

The roadmap has no day schedule, prerequisite locking, or separate practice-problem tracker. Video links point directly to YouTube; lessons without a verified direct video remain individually marked in the app.

## Progress and privacy

Progress and device credentials are stored in each browser’s `localStorage`. When cloud sync is configured, the app sends progress through the `progress-sync` Supabase Edge Function. Device credentials and pairing codes are stored server-side as hashes. Database tables deny direct anonymous access with RLS; the Edge Function uses its server-side Supabase credentials. Do not put a Supabase secret key, service-role key, CLI access token, or database password in browser files or frontend environment variables.

The Supabase URL and **publishable** key are browser-safe configuration. They are provided to the build as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; those variable names are documented here without embedding their values. A local `.env` file supplies them for builds and is excluded from Git.

## Local development

Use Node.js and Python 3. From this folder, build the static site:

```powershell
npm run build
```

The generated site is in `dist/`. To serve the source app directly during local development, run this from the project folder:

```powershell
python -m http.server 8000 --bind 0.0.0.0
```

Open `http://localhost:8000` on the computer. A phone on the same Wi-Fi can open `http://<computer-LAN-IP>:8000`. Local HTTP is suitable for development; PWA installation and camera handoff require HTTPS on a phone.

Copy `.env.example` to `.env` and fill the two public build variables to produce a cloud-configured build. `.env` is ignored by Git. Without both variables, the build remains local-only.

## Supabase deployment

The repository includes the schema migrations and Edge Function. For an authorized Supabase project, authenticate and deploy from this folder:

```powershell
npm exec --yes --package=supabase -- supabase login
npm exec --yes --package=supabase -- supabase link --project-ref <PROJECT_REF>
npm exec --yes --package=supabase -- supabase db push
npm exec --yes --package=supabase -- supabase functions deploy progress-sync
```

The function uses Supabase’s server-provided credentials. The frontend uses only the project URL and publishable key.

## Production deployment

The included `vercel.json` builds the static app with `npm run build` and publishes `dist/`. Create a Vercel project for this folder and set these environment variables for the deployment environments:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Deploy the project to receive its HTTPS URL. The build script also accepts the legacy `STRIVER_SUPABASE_URL` and `STRIVER_SUPABASE_PUBLISHABLE_KEY` names, but the `NEXT_PUBLIC_...` names above are preferred. Never set a secret or service-role key as a frontend/build variable.

## Install on Android

1. Open the deployed HTTPS URL in Chrome on Android.
2. Open Chrome’s menu and choose **Install app** or **Add to Home screen**.
3. Confirm the installation. Launch **A2Z Tracker** from the home screen.

The exact menu label depends on the Android and Chrome version.

## Project structure

- `curriculum.js` — static 20-module, 84-section, 495-lesson roadmap and direct video URLs.
- `src/app.js` and `src/qr.js` — tracker, progress, sync, and pairing UI logic.
- `supabase/migrations/` — progress merge and device pairing schema.
- `supabase/functions/progress-sync/` — server-side sync and pairing API.
- `scripts/build.mjs` — environment-based static site build.
- `config.js` — generated browser configuration; it must contain only the project URL and publishable key.
- `manifest.webmanifest` and `service-worker.js` — install metadata and offline app shell.
