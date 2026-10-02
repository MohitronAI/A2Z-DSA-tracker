# MOHIT.OS

Learn · Build · Think

MOHIT.OS is a personal learning and creation space. Its active areas are **LEARN**, with **A2Z DSA** as the current learning module, and **BUILD · Projects** (V0). The learning module follows Take U Forward’s Striver A2Z DSA curriculum and contains 20 modules, 84 sections, and 495 lessons. Lesson titles and direct video links are kept in the static curriculum file.

## Features

- Mark lessons complete and see live lesson, section, module, and dashboard progress.
- Track first-start, completion, and last-activity timestamps for each lesson.
- Save progress immediately in the browser and keep using the app offline.
- Optionally sync progress through Supabase across paired devices. Conflicts merge per lesson using the latest activity timestamp.
- Pair a phone or tablet with a single-use code or QR link that expires after five minutes. There is no account, email, or password flow in the tracker.
- Install the app as a PWA on Android or desktop. The service worker caches the application shell; streaming YouTube videos still requires internet.
- Export and import a progress backup from Settings.

BUILD V0 provides a local project and task tracker with a project activity history. It does not sync to Supabase. The roadmap has no day schedule, prerequisite locking, or separate practice-problem tracker. Video links point directly to YouTube; lessons without a verified direct video remain individually marked in the app.

## MOHIT.OS Foundation storage

The app initializes a separate, local-only IndexedDB database named `mohit-os-foundation` (database version 2). The version-1 `activityEvents` store and its data are preserved; version 2 adds `projects`, `tasks`, and `foundationMeta` stores. The ActivityEvent store uses `eventId` as its key and indexes `occurredAt`, `sourceModule`, and the compound subject type/ID. The A2Z tracker does not read from or write to this database.

The browser module `src/foundation/repository.mjs` exports `createFoundationRepository()`, which provides `open()`, `appendEvent(event)`, `getEvent(eventId)`, `queryEvents(options)`, and `close()`. `open()` initializes storage and returns database name/version metadata without exposing the raw IndexedDB connection. `appendEvent` is append-only and first-write-wins for duplicate event IDs; query results are ordered by occurrence time, recorded time, then event ID. Storage initialization failures are reported in the console and do not block the existing tracker.

Activity events use schema version 1 and record an event ID/type, occurrence and recording timestamps, device ID, source module, a typed subject reference, related entity references, and a JSON payload; `correlationId` is optional. This foundation is not yet connected to A2Z progress, cloud sync, authentication, or notifications.

## BUILD · Projects

BUILD V0 provides local project and task tracking backed by the Foundation repository. Projects capture status, importance, current state, blockers, one optional next-action task, last activity, and next review date. Tasks can be associated with a project, edited, and completed. Meaningful mutations and task/project creation are recorded in the shared ActivityEvent store and displayed in project history. Nothing is seeded automatically; project/task data remains local to the current browser origin. BUILD has no cloud sync, cross-device sharing, automatic reminders, or A2Z activity adapter.

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
3. Confirm the installation. Launch **MOHIT.OS** from the home screen and open **LEARN → A2Z DSA**.

The exact menu label depends on the Android and Chrome version.

## Project structure

- `curriculum.js` — static 20-module, 84-section, 495-lesson roadmap and direct video URLs.
- `src/app.js` and `src/qr.js` — tracker, progress, sync, and pairing UI logic.
- `src/foundation/` — versioned IndexedDB repository and isolated Foundation bootstrap.
- `src/build/app.mjs` and `styles-build.css` — local BUILD Projects UI and responsive styling.
- `supabase/migrations/` — progress merge and device pairing schema.
- `supabase/functions/progress-sync/` — server-side sync and pairing API.
- `scripts/build.mjs` — environment-based static site build.
- `scripts/validate.mjs` — dependency-free curriculum, progress, Foundation, and BUILD regression validation (`npm run validate`).
- `config.js` — generated browser configuration; it must contain only the project URL and publishable key.
- `manifest.webmanifest` and `service-worker.js` — install metadata and offline app shell.
