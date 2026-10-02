# MOHIT.OS — Developer Handover Context

> Initial repository snapshot inspected on 2026-10-02. Subsequent Foundation, BUILD V0, MOHIT.OS V1, and V1.1 usability changes are described below. Always verify live Git/deployment state before acting; this file contains no credentials.

## Handover Instructions for the Next Coding Agent

This project is **already implemented and deployed**. Continue from the existing codebase; do not rebuild it as a new application or replace its architecture. The current A2Z DSA functionality must remain intact unless a future task explicitly requires a change.

Before changing anything, inspect the current branch and working tree, read this document and `README.md`, and compare the request with the implementation. Keep curriculum IDs, progress storage/schema contracts, cloud pairing/sync, and PWA behavior stable. Do not expose values from `.env`, `.env.local`, generated configuration, Vercel metadata, or Supabase CLI state. Treat any `sources/` directory as read-only per the ChatGPT project instructions; no `sources/` directory was present in this checkout at the time of inspection.

## 1. Project Identity and Purpose

MOHIT.OS is a personal learning and creation space. LEARN is a static web application for tracking progress through Take U Forward’s A2Z DSA curriculum. BUILD manages local projects/tasks/resources; THINK manages categorized, optionally project-linked notes; PLAN manages project-linked tasks with date views; ACTIVITY presents their shared event history; global search groups results across all four. These modules use the separate Foundation IndexedDB repository. The A2Z tracker retains its optional cloud sync, installable PWA metadata, and offline app-shell support.

## 2. Branding and Hierarchy

- Product: **MOHIT.OS**
- Tagline: **Learn · Build · Think**
- Current hierarchy: **LEARN → A2Z DSA**, **BUILD → Projects**, **THINK → Notes**, **PLAN → Tasks & reminders**, and **ACTIVITY**.
- LEARN contains the existing A2Z tracker. BUILD, THINK, PLAN, and ACTIVITY use local Foundation storage. TRACK, AI, voice, notifications, calendar integration, and cloud synchronization for these modules remain future work.
- Educational/source attribution to Take U Forward (TUF) and Striver is curriculum attribution, not the product name.

The browser title is `MOHIT.OS · A2Z DSA`. The PWA manifest is named `MOHIT.OS · A2Z DSA`, with short name `MOHIT.OS`.

## 3. Repository and Git State

- Git root: this project directory. Branch/HEAD details below describe the initial 2026-10-02 snapshot only; inspect live Git state before any commit, merge, or push.
- Initial snapshot branch: `main`, tracking `origin/main`; HEAD was `8d603b7` — `feat: establish MOHIT.OS learn structure`.
- The initial handover task left this documentation file uncommitted. Later changes may have moved it into history.
- Remote: `https://github.com/MohitronAI/A2Z-DSA-tracker.git`.
- Recent history includes the MOHIT.OS hierarchy change, PWA cache refresh for the prior rebrand, and the earlier A2Z DSA Tracker branding change. The repository history is preserved; no history rewrite is needed.

## 4. Current Folder/File Structure

```text
.
├── AGENT_CONTEXT.md                 # This handover document
├── README.md                        # Setup, architecture, and deployment notes
├── index.html                       # App shell, pages, navigation, metadata
├── styles.css                       # Responsive visual styling
├── curriculum.js                    # Static curriculum and flattened lesson index
├── config.js                        # Browser Supabase configuration placeholder
├── manifest.webmanifest             # PWA name, theme, start URL, icons
├── service-worker.js                # App-shell caching and offline fallback
├── icons/                            # SVG and PNG PWA icons
├── src/
│   ├── app.js                       # Dashboard, roadmap, progress, sync, pairing
│   ├── qr.js                        # Small in-app QR encoder; no QR dependency
│   ├── foundation/                  # Local IndexedDB repository, actions, and bootstrap
│   ├── build/app.mjs                # BUILD Projects UI
│   └── os/app.mjs                   # THINK, PLAN, ACTIVITY, and global search UI
├── styles-build.css                 # BUILD responsive styling
├── scripts/
│   ├── build.mjs                    # Copies static app into dist and writes config
│   └── validate.mjs                 # Dependency-free regression validator
├── supabase/
│   ├── config.toml                  # Edge Function local configuration
│   ├── migrations/                  # Progress merge and pairing schema/RPCs
│   └── functions/progress-sync/     # Edge Function and allowed lesson IDs
├── package.json                     # Minimal build script; no frontend dependencies
└── vercel.json                      # Static Vercel build/output configuration
```

Local-only/ignored paths include `.env`, `.env.local`, `.vercel/`, `dist/`, and `supabase/.temp/`. These may contain local configuration, generated artifacts, or account/project metadata; do not copy their contents into documentation or commits. `dist/` is generated by the build.

## 5. Technology Stack and Dependencies

- Frontend: plain HTML, CSS, and browser JavaScript; no React, framework, bundler, or frontend npm dependency.
- Build: Node.js script `scripts/build.mjs`; `npm run build` produces a static `dist/` directory.
- Development server: Python’s built-in HTTP server is documented in `README.md`.
- Hosting: Vercel static output, configured by `vercel.json` with `npm run build` and `dist`.
- Cloud: Supabase Postgres, SQL migrations, and a Deno Edge Function.
- Edge dependency: `npm:@supabase/supabase-js@2` imported by the function. This is not a browser dependency.
- PWA: Web App Manifest and a hand-written service worker. QR generation is implemented locally in `src/qr.js`.

`package.json` defines `build` and dependency-free `validate` scripts. There is no configured linter or browser automation test framework.

## 6. Current A2Z DSA Functionality

- Dashboard with aggregate completed, in-progress, remaining, percent, last activity, and module progress.
- Roadmap grouped by module and expandable section, with lesson checkboxes and section/module completion progress.
- Search across lesson, module, and section titles; filters for all, completed, and to-do lessons.
- Direct YouTube buttons for lessons with a stored URL. A missing URL is shown for that individual lesson as “Video link unavailable.”
- Settings for device pairing/sync status and JSON progress backup export/import.
- The app does not infer that a video was watched. Completion is explicitly controlled by the lesson checkbox.

## 7. Curriculum Structure and Statistics

The curriculum is a static data set in `curriculum.js`, source-attributed to the public TUF A2Z sheet (`sourceAsOf` is `2026-09-30`). Current measured counts are **20 modules, 84 sections, 495 lessons, and 324 direct YouTube URLs**. The other 171 lesson records currently have no direct URL and are individually rendered as unavailable. These counts were computed from the checked-in data, not inferred from a roadmap label.

| # | Module | Sections | Lessons |
|---:|---|---:|---:|
| 1 | Beginner Problems | 12 | 83 |
| 2 | Sorting | 1 | 7 |
| 3 | Arrays | 4 | 32 |
| 4 | Hashing | 2 | 6 |
| 5 | Binary Search | 5 | 32 |
| 6 | Strings (Basic and Medium) | 3 | 7 |
| 7 | Recursion | 5 | 22 |
| 8 | Linked-List | 6 | 49 |
| 9 | Bit Manipulation | 3 | 14 |
| 10 | Greedy Algorithms | 3 | 14 |
| 11 | Sliding Window / 2 Pointer | 4 | 13 |
| 12 | Stack / Queues | 4 | 31 |
| 13 | Binary Trees | 5 | 32 |
| 14 | Binary Search Trees | 3 | 15 |
| 15 | Heaps | 2 | 20 |
| 16 | Graphs | 8 | 46 |
| 17 | Dynamic Programming | 9 | 53 |
| 18 | Tries | 2 | 7 |
| 19 | Strings (Advanced Algo) | 2 | 9 |
| 20 | Maths | 1 | 3 |
| **Total** |  | **84** | **495** |

The curriculum records include stable lesson, section, and module IDs, titles, a `youtubeUrl` that may be null, and a `type` such as `learning` or `practice`. The UI does not create a separate practice-problem tracker from that metadata.

## 8. Progress Tracking Behavior

Checking or unchecking a lesson immediately saves state and re-renders dashboard and roadmap totals. Dashboard and module/section progress are derived from checked lessons. A lesson is counted in progress when it has a `firstStartedAt` and is not currently complete.

When a lesson first changes, the app records its first-start time. Every checkbox change updates `lastActivityAt` and a random `revisionId`; checking sets `completedAt`, while unchecking clears `completedAt`. A later change uses a timestamp at least one millisecond later than that lesson’s prior activity time. The roadmap displays the stored start/completion/activity timing and elapsed time where available.

## 9. Local-First Architecture

- Main browser store: `localStorage` key **`striver-a2z-progress-v1`**. The legacy-looking key is compatibility-sensitive; do not rename it as a branding cleanup.
- State contains progress records plus device/session metadata and sync status. Progress survives reload and works without cloud configuration.
- Build config is optional: without both public Supabase settings, the site remains local-only.
- Browser storage is origin-scoped. `localhost`, a LAN IP, and each HTTPS hostname have separate localStorage. Switching origin does not itself transfer progress; pair devices through the same configured cloud tracker or use a backup.
- Backup export/import handles progress records and merges imported progress; it is not an account or credential export.
- MOHIT.OS Foundation uses a separate version-4 IndexedDB database for ActivityEvents, Projects, Tasks, typed Notes, and device metadata. Version 4 preserves existing notes and backfills their type as `Note`. BUILD/THINK/PLAN write meaningful events to that store. A2Z does not read from or write to Foundation storage.

## 10. Supabase Architecture and Sync Flow

The browser sends POST requests to `/functions/v1/progress-sync`, using the project’s publishable key for the Supabase API headers and an opaque per-device credential for tracker authorization. The function uses its server-side Supabase service credentials to read/write protected tables and call merge RPCs. The tables have RLS enabled and deny direct `anon`/`authenticated` table access; service-role access is granted server-side.

Progress synchronization is local-first and per lesson. A local change is saved immediately, then sync is debounced. The client merges remote/local records and the database merge RPC stores the record with the later `lastActivityAt`; equal timestamps use lexicographic `revisionId` as a deterministic tie-break. While online and paired, the app syncs after changes, on browser reconnect/return to foreground, and periodically while visible. Failed sync keeps local changes and retries with backoff.

## 11. Device Pairing Implementation

- The first browser is the primary/owner device and retains an owner secret locally.
- From Settings, the primary device can request a QR URL and a 12-character one-time code. Both expire after five minutes and can be consumed only once.
- The phone/tablet scans the QR or enters the code, receives its own device credential, and is associated with the same tracker hash.
- Tokens/codes are generated from random bytes; the server stores hashes of credentials and pairing values rather than raw values.
- The UI has no email, password, or Supabase Auth account flow. The primary device is required to create new pairings. There is no visible device-revocation or credential-recovery flow in the current UI/function actions.
- The pairing QR points at the current app origin. The phone must be able to reach that origin; HTTPS is needed for normal camera/PWA installation support on mobile.

## 12. Timestamp and Progress Data Model

Each lesson record is keyed by its stable lesson ID and has:

```text
completed: boolean
firstStartedAt: ISO timestamp | null
completedAt: ISO timestamp | null
lastActivityAt: ISO timestamp
revisionId: short random string (optional at API boundary)
```

The client’s storage key remains the versioned legacy string noted above. Backups and sync use schema version 2. The timestamp fields and per-lesson merge semantics are relied upon by both browser and server code.

## 13. Offline Behavior

The service worker precaches the static app shell, curriculum, local QR/app scripts, icons, manifest, and generated `config.js`. Navigation requests are network-first with a cached `index.html` fallback; static same-origin resources use cached responses when present and otherwise fetch and cache successful responses. Lesson progress remains in localStorage offline. YouTube playback itself requires internet.

The active cache is `striver-a2z-static-v10`. The `striver-a2z-static-` prefix is deliberately retained so activation can delete previous app caches after rebranding. Do not rename/remove the cleanup prefix without explicitly migrating cache behavior.

## 14. Database Schema and Migrations

1. `supabase/migrations/20260930000000_progress_sync.sql`
   - `public.progress_sync`: primary key `sync_id_hash`, `schema_version`, JSONB `progress`, and `updated_at`.
   - RLS enabled; direct anonymous/authenticated table access revoked; service role granted.
   - `public.merge_a2z_progress(...)`: upserts and merges each lesson entry by `lastActivityAt`, then `revisionId` on ties.
2. `supabase/migrations/20261001000000_device_pairing.sql`
   - `public.a2z_sync_devices`: hashed tracker/device credentials, device name/owner flag, created/last-seen/revoked timestamps.
   - `public.a2z_pairing_sessions`: hashed pairing token/code, tracker hash, expiration and consumed time.
   - `create_a2z_pairing_session(...)` creates a five-minute pairing session; `consume_a2z_pairing(...)` locks and consumes it once and registers a device.
   - RLS and grants restrict tables/RPCs to service-side use.

Do not alter schema or migration history casually. The Supabase CLI local link metadata lives under ignored `supabase/.temp/`; never paste its contents into logs or handover docs.

## 15. Edge Function

- Function: `supabase/functions/progress-sync/index.ts`, deployed as `progress-sync`.
- Local function config: `supabase/config.toml` sets `verify_jwt = false`. The function still validates opaque device credentials and pairing values itself; do not interpret this setting as public unauthenticated progress access.
- Actions: default/explicit `sync`, `create_pairing`, and `complete_pairing`.
- It limits request size, validates timestamps and IDs against `lesson-ids.json`, caps records at 495, sanitizes device names, and uses database RPCs for protected operations.
- `lesson-ids.json` is a separate 495-ID allowlist. If lesson IDs ever change, update curriculum and this allowlist together after considering existing stored progress.
- CORS currently allows any origin and the function accepts POST/OPTIONS. Preserve the current caller contract unless changing the deployed frontend and function together.

## 16. Environment Variables and Secret Handling

Browser-safe build variables (names only):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The build also accepts legacy `STRIVER_SUPABASE_URL` and `STRIVER_SUPABASE_PUBLISHABLE_KEY` aliases. `scripts/build.mjs` validates HTTPS Supabase URLs and requires a key with the `sb_publishable_` prefix; it rejects other key types. The script writes browser configuration into generated `dist/config.js` and does not include backend secrets.

The Edge Function reads the Supabase-provided server environment, including `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. **Never expose or document service-role/secret keys, database passwords, access tokens, or actual `.env`/`.env.local` values.** The local env files and Vercel CLI folder are ignored by Git. The Vercel project has the two public variables configured for deployment environments; values are intentionally omitted here.

## 17. GitHub and Vercel Deployment

- GitHub remote: `https://github.com/MohitronAI/A2Z-DSA-tracker.git`; deployed branch is `main`.
- `vercel.json`: framework unset (static site), build command `npm run build`, output `dist`, clean URLs enabled.
- Local `.vercel/project.json` identifies the existing Vercel project as `striver-a2z-dsa-tracker`; this deployment identity was kept when MOHIT.OS branding was applied.
- Deployment aliases verified in the 2026-10-02 project session: [https://mohit-os.vercel.app/](https://mohit-os.vercel.app/) and [https://striver-a2z-dsa-tracker-hazel.vercel.app/](https://striver-a2z-dsa-tracker-hazel.vercel.app/). The MOHIT.OS alias is the clean branded URL; the prior Vercel hostname remains assigned. Confirm live domains in Vercel before any future domain or project change.
- At the original 2026-10-02 snapshot, the latest checked-in app commit was deployed and showed the MOHIT.OS title and hierarchy. BUILD V0 and V1 usability work are subsequent local-only additions and must not be assumed deployed. Do not rename the Vercel project/domain or alter GitHub integration unless explicitly requested.

## 18. What Has Been Tested and Verified

Recorded checks in the current project session/history include:

- `npm run build` completed successfully and produced the static `dist/` output.
- Curriculum data was evaluated directly and counted as 20 modules, 84 sections, 495 lessons, and 324 non-null direct video URLs.
- Browser smoke checks confirmed the MOHIT.OS title/brand, LEARN → A2Z DSA navigation, roadmap module totals, manifest metadata, and service-worker/offline status on the deployed app.
- MOHIT.OS V1.1 browser smoke covers schema-v3 migration and data preservation, BUILD projects/resources and linked notes/tasks, THINK categories and filters, PLAN Today/Upcoming/All views, grouped global search, Activity filtering, reload persistence, A2Z progress regression, desktop/mobile navigation, and cleanup of temporary Foundation records.
- Settings on production displayed connected/synced and available-offline status. A clean browser at the separate branded hostname initially showed 0/495 until it had progress locally or was paired; this is expected origin-scoped storage behavior.
- `npm run validate` checks curriculum and Supabase allowlist invariants, progress contracts, strict timestamps/merge semantics, Foundation v4 and legacy-note migration contracts, ActivityEvent records, BUILD resource/project, THINK note-type, and PLAN task records, action/search APIs, and cross-module UI IDs. It is not a browser end-to-end suite. The latest sync UI observations are not a substitute for a fresh two-device edit-and-round-trip test after sync/schema changes. The 324 YouTube URLs have not all been individually revalidated against YouTube availability.

V1 modules are local-only and do not change the A2Z cloud contract. Confirm GitHub/production state directly before further integration or deployment work.

## 19. Known Limitations

- 171 of the 495 lesson entries currently have no direct YouTube URL. The UI marks those lessons individually as unavailable; do not invent URLs or silently substitute TUF lesson pages.
- Browser storage is isolated by origin. A new hostname does not inherit another hostname’s local progress automatically.
- Cloud sync and pairing require a correctly configured Supabase project and an internet connection for synchronization/pairing. Local tracking works when cloud sync is absent or offline.
- No user account, password login, credential recovery, or visible device-revocation UI is implemented.
- A locally served HTTP page is for development. Mobile PWA install/camera QR handoff requires a secure HTTPS origin; YouTube videos always stream externally.
- Vercel’s project slug and legacy storage/cache/global identifiers still contain `striver`; these are not the displayed product name and should not be removed casually.

## 20. Features Intentionally Not Implemented

- BUILD/THINK/PLAN/ACTIVITY are local-only; cloud sync, notification delivery, calendar integration, autonomous monitoring, and AI are not implemented. PLAN Today/Upcoming views filter stored task dates; due dates do not trigger alerts.
- Day-by-day schedules, prerequisite locking, or curriculum gates.
- A separate practice-problem completion area.
- User registration/login or server-managed account recovery.
- Backend video hosting or offline YouTube playback.

## 21. Current Unfinished Work

The existing A2Z tracker and Foundation are implemented. BUILD, THINK, PLAN, ACTIVITY, and global search add local-only structured OS workflows without changing A2Z progress or Supabase contracts. Foundation schema v4 migrates v3 notes by assigning the default `Note` type while retaining the existing records. These records are origin-scoped in IndexedDB. The known content gap is the 171 lesson records without direct video URLs; a future curriculum audit should verify each against official/public TUF and official Take U Forward/Striver sources before adding a URL.

## 22. Recommended Next Development Step

Continue local-first usability and regression work in focused milestones. Keep the modules separate from A2Z; design cross-device synchronization, notifications, and AI as separate changes with explicit data/version/action contracts.

## 23. Architectural Decisions to Preserve

- Static browser app, no framework requirement, local-first progress, optional Supabase cloud sync.
- Per-lesson, timestamp-based merge with deterministic revision tie-break.
- Device pairing through short-lived, single-use code/QR and opaque hashed credentials; no user account system.
- Curriculum is the source of module/section/lesson IDs; the server has a matching lesson-ID allowlist.
- PWA shell caching and localStorage-based offline progress.
- Existing LEARN → A2Z experience and the local-only Foundation boundary for BUILD/THINK/PLAN/ACTIVITY.

## 24. Things a Future Agent Must Not Break or Unnecessarily Rewrite

- Do not rename/delete `striver-a2z-progress-v1`, lesson IDs, section IDs, or module IDs without a compatible migration; existing browser and cloud progress depends on them.
- Do not change the progress timestamp fields or schema version without coordinated client, Edge Function, SQL, backup, and migration handling.
- Do not expose or move service-role credentials into browser code. Frontend configuration accepts publishable keys only.
- Do not break pairing token/code format, expiration, single-use behavior, device credential hashing, or QR target handling without an end-to-end replacement.
- Do not remove the service-worker’s legacy cache cleanup prefix or forget to bump/update precached asset URLs when changing cached app assets.
- Do not replace the 20-module curriculum, discard missing-link lessons, or fabricate video URLs to make all buttons appear populated.
- Do not redesign the familiar A2Z dashboard/roadmap or introduce schedule/locking/practice tracking. BUILD, THINK, PLAN, and ACTIVITY are active local modules; do not activate other future areas unless requested.
- Do not rename the GitHub repository or alter the existing production project/domains as part of unrelated work.
