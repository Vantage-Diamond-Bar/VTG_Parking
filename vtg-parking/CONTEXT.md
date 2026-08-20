# Vantage Parking — Engineering Orientation

> **Scope: how the code is laid out.** Stack, routing, file structure, and the
> conventions that are not obvious from reading a single file.
>
> **This file is not authoritative for business rules.** The community's rules —
> quotas, eligibility, renewal cadence, what counts as overdue — live in
> [`../CONTEXT.md`](../CONTEXT.md), the domain glossary. When the two disagree,
> the glossary wins and this file is the one to fix.
>
> **Nor is it authoritative for the schema.** `supabase/schema.sql` is the real
> definition and is kept current; a table list copied into prose here would only
> rot.

---

## 1. Project Overview

**Vantage Community Parking Management System** — a full-stack web app for managing parking in a gated residential community (Vantage, California). It handles resident vehicle registration, visitor parking passes, violation reporting, vacation/extended-stay requests, and oversized vehicle applications.

**Project path (local dev):**
```
C:\Users\wuxjj\OneDrive\吴潇俊的文档\Claude\Temp Project\VTG_Parking\vtg-parking
```

**Start dev server:**
```bash
cd "C:\Users\wuxjj\OneDrive\吴潇俊的文档\Claude\Temp Project\VTG_Parking\vtg-parking"
npm run dev   # → http://localhost:3000
```

---

## 2. Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | **Next.js 16.2.6** (App Router) | Uses Turbopack in dev |
| Database | **Supabase** (PostgreSQL) | `supabaseAdmin` used in all API routes (bypasses RLS) |
| Styling | **Tailwind CSS** | No component library |
| i18n | **next-intl 4.x** | 3 locales: `en`, `zh`, `ko` — message files in `/messages/` |
| Auth | **Custom JWT-like** (base64 JSON in cookie) | Not a real JWT; `bcryptjs` for password hashing |
| Email | **Resend** (via `lib/email.ts`) | Used for visitor booking confirmations |
| Export | **xlsx** library | For CSV and Excel export of residents/visitors |

**Key environment variables** (in `.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `NEXT_PUBLIC_APP_URL`

---

## 3. Critical Architecture Notes

### 3.1 Timezone — Everything Uses America/Los_Angeles (PDT/PST)

**This is the most important rule in the codebase.** The app runs on Vercel (UTC), but all date display and calculations must use Pacific Time.

All timezone-sensitive functions are in `lib/utils.ts`:

```typescript
export const PT_ZONE = 'America/Los_Angeles'

// Internal helper — converts any Date to PDT calendar date parts
function ptDateParts(d: Date): { y: number; m: number; day: number }
// Uses Intl.DateTimeFormat — works on both Node.js server and browser

export function formatPDT(dateStr, opts?)
// Format a DB timestamp for display in PDT
// opts.dateOnly → "5/20/2026"
// opts.short    → "5/20/2026, 6:00 PM"
// default       → full locale string
// USE THIS everywhere instead of toLocaleString()

export function getPTYearMonth(): string
// Returns current month as "2026-05" in Pacific Time

export function countNights(startStr, endStr): number
// Counts overnight stays using PDT calendar dates
// CRITICAL: uses ptDateParts() — NOT getDate() which returns UTC day

export function ptInputToISO(localStr: string): string
// Converts a datetime-local string (YYYY-MM-DDTHH:mm) treated as Pacific Time
// to a UTC ISO string. Handles DST correctly by probing offset near noon.
// USE THIS in form submissions for start_datetime / end_datetime fields.
// e.g. "2026-05-20T23:30" (user enters 11:30 PM PT) → "2026-05-21T06:30:00.000Z"
```

**Storage rule:** All `datetime-local` inputs from forms (visitor, vacation) are converted with `ptInputToISO()` before being sent to the API, so they are stored as correct UTC in Supabase.

**Display rule:** All timestamps read from Supabase must be rendered with `formatPDT()`. Never use bare `toLocaleString()` or `toLocaleDateString()` — the server is UTC, so those calls produce UTC times.

**Email rule:** All timestamps in `lib/email.ts` use `{ timeZone: 'America/Los_Angeles' }` in their `toLocaleString()` calls, and show "PT" as a suffix.

**Why this matters:** Supabase stores timestamps as UTC. A PDT 6:00 PM May 20 is UTC 1:00 AM May 21. Using `getDate()` or bare `toLocaleString()` on the server returns UTC time — e.g. 11:40 AM PT was being shown as 6:40 PM (UTC).

### 3.2 Authentication

- **Session cookie name:** `session`
- **Encoding:** `base64url(JSON) + "." + HMAC-SHA256(payload, SESSION_SECRET)` — server-signed, tamper-proof
- Server Components use `getSession()` (reads `next/headers` cookies)
- API Route Handlers use `getSessionFromRequest(req)` (reads httpOnly cookie only — no header fallback)
- `SESSION_SECRET` env var **must** be set to a random string ≥ 32 chars; the server throws on startup if missing
- Roles: `admin` | `patrol` — most admin API routes check `session.role === 'admin'` explicitly

### 3.3 Supabase Clients

```typescript
// lib/supabase.ts
export const supabase      // browser-side, limited by RLS
export const supabaseAdmin // server-side, bypasses all RLS — used in all API routes
```

### 3.4 i18n Pattern

All user-visible text **must** use `t('key')` via `useTranslations('namespace')`.

- Message files: `messages/en.json`, `messages/zh.json`, `messages/ko.json`
- Main namespaces: `home`, `admin`, `register`, `visitor`, `vacation`, `report`, `patrol`
- **Never hardcode Chinese or Korean strings** in `.tsx` files — it will break English locale
- When adding new UI text, add the key to **all three** locale files

### 3.5 Phone Numbers

Stored as two separate columns everywhere:
- `owner_phone_country_code` — e.g. `"+1"`
- `owner_phone` — e.g. `"(415)555-1234"`

Display pattern: `{countryCode && <span className="text-gray-500 mr-1">{countryCode}</span>}{phone}`

---

## 4. Database Tables

`supabase/schema.sql` is the source of truth for every table and column, and is
kept in step with production. Read it rather than a summary here.

Only the things the schema cannot tell you:

- **`resident_vehicles.created_at` is not a creation timestamp.** It is the
  renewal clock, deliberately overwritten whenever a resident re-uploads their
  document, and drives both the overdue rules and the reminder cadence.
- **`registration_doc_path` holds an object path, never a URL** — the bucket is
  private and URLs are signed at read time.
- **`oversized_applications` is frozen legacy.** Its rows were merged into
  `resident_vehicles`; nothing reads it.
- **Address sorting** — always use `sortAddresses()` from `lib/utils.ts` when
  displaying unit lists (street name, then house number, then unit number).

---

## 5. Page & Route Map

### Public Pages (no auth)

| URL | File | Purpose |
|-----|------|---------|
| `/` | `app/page.tsx` | Home — links to all portals. Cards: Report, Visitor, Register, Vacation |
| `/register` | `app/register/page.tsx` | Resident vehicle self-registration |
| `/visitor` | `app/visitor/page.tsx` | Visitor parking pass registration |
| `/report` | `app/report/page.tsx` | Anonymous violation reporting (photo upload) |
| `/vacation` | `app/vacation/page.tsx` | Resident vacation parking request |

### Admin Pages (requires `admin` role cookie)

Wrapped by `app/admin/(protected)/layout.tsx` which verifies session server-side.

| URL | File | Purpose |
|-----|------|---------|
| `/admin/login` | `app/admin/login/page.tsx` | Admin login form (react-hook-form) |
| `/admin/dashboard` | `app/admin/(protected)/dashboard/page.tsx` | Main dashboard |
| `/admin/residents` | `app/admin/(protected)/residents/page.tsx` | View/manage registered vehicles |
| `/admin/visitors` | `app/admin/(protected)/visitors/page.tsx` | View visitor registrations |
| `/admin/violations` | `app/admin/(protected)/violations/page.tsx` | View violation reports |
| `/admin/alerts` | `app/admin/(protected)/alerts/page.tsx` | Visitor abuse alerts (3 tabs: Unresolved/Resolved/All) |
| `/admin/vacation` | `app/admin/(protected)/vacation/page.tsx` | Vacation parking requests |
| `/admin/oversized` | `app/admin/(protected)/oversized/page.tsx` | Oversized vehicle applications |
| `/admin/quota-summary` | `app/admin/(protected)/quota-summary/page.tsx` | Monthly visitor night usage summary |
| `/admin/units` | `app/admin/(protected)/units/page.tsx` | Unit management |
| `/admin/emails` | `app/admin/(protected)/emails/page.tsx` | Email notification settings |

### Patrol Pages (requires `patrol` role cookie)

| URL | File | Purpose |
|-----|------|---------|
| `/patrol/login` | `app/patrol/login/page.tsx` | Patrol login |
| `/patrol` | `app/patrol/page.tsx` | Plate lookup — enter plate → shows resident or visitor record |

---

## 6. Admin Dashboard Layout

`app/admin/(protected)/dashboard/page.tsx` — key layout decisions:

- **Left column** (`w-56 shrink-0`): 6 clickable stat cards (each a `<Link>`)
  1. Registered Vehicles (total count)
  2. Visitor Registrations (Month) — uses `getPTYearMonth()` for current PDT month
  3. Violations (Month)
  4. Overdue Registrations (registered > 1 year ago)
  5. Pending Vacation Requests
  6. Pending Oversized Applications

- **Right column** (`flex-1`, fixed `height: 660px`): Recent Violations box
  - Height = 6 cards × 100px + 5 gaps × 12px = exactly matches left column
  - Yellow border + amber header when violations exist
  - `overflow-y-auto` inner content

- **Below** (full width): Visitor Parking Abuse Alerts section + Overdue Registrations section

- Abuse alerts section header uses `<Link href="/admin/alerts">View All →</Link>` 
  (NOT wrapping the whole table in Link, because "Mark as Resolved" button would conflict)

- All timestamps use `formatPDT()` or `.toLocaleString('en-US', { timeZone: PT_ZONE })`

---

## 7. Key Business Logic

### 7.1 Visitor Quota

Rules live in the glossary; this is where they are implemented.

- **Limit:** `VISITOR_QUOTA_LIMIT = 10` nights per unit per calendar month
- **Calculation:** `countNights(start, end)` uses PT calendar dates — an 18:00→10:00 stay = 1 night
- **Cross-month stays:** split into monthly segments, each checked against its own month
- **No cache table.** Every read computes from `visitor_registrations`. Enforcement
  is atomic inside the `book_visitor_registration` stored procedure, which takes an
  advisory lock per unit. A `visitor_monthly_quota` cache table once existed; it was
  written but never read, drifted out of sync, and was dropped 2026-08-20.

### 7.2 Visitor Abuse Detection

Triggered automatically on every successful visitor registration (`POST /api/visitors`):

1. Query all registrations this month with the same `license_plate`
2. Count unique `unit_id` values
3. If ≥ 2 unique units → upsert into `abuse_alerts` (conflict key: `license_plate + year_month`)
4. The alert appears on the admin dashboard and `/admin/alerts` page

The admin can mark alerts as resolved via the "Mark as Resolved" button, which calls:
`PATCH /api/admin/alerts/[id]` with `{ note: string }`

### 7.3 Resident Vehicle Registration

- Residents visit `/register`, enter their address + vehicle details + owner contact
- Phone stored as separate country code + number columns
- Duplicate plate detection: same plate in `resident_vehicles` → error
- Visitor plate conflict: if a visitor is registered with a plate that later tries to register as resident → blocked
- **Per-unit vehicle cap:** a unit may self-register at most `RESIDENT_VEHICLE_LIMIT = 4` vehicles (`lib/utils.ts`). Enforced server-side on both public insert paths (`POST /api/residents` batch, and `POST /api/residents/manage` `add_vehicle`) — count = `resident_vehicles` rows for the unit with `approval_status != 'rejected'` (i.e. approved + pending-oversized). Over-limit returns `{ error: 'vehicle_limit_exceeded' }` (409); the `/register` UI shows `register.error_vehicle_limit` and grays out the add button. A 5th vehicle requires HOA approval; the management company then adds it **directly in the DB** (admins have no in-app add path and are not subject to the cap).

### 7.4 Plate Lookup (Patrol)

- Patrol enters a plate at `/patrol`
- System checks `resident_vehicles` first, then `visitor_registrations`
- Shows resident info (name, unit, vehicle) or visitor info (access code, dates, hosting unit)

### 7.5 Violation Reporting

- Public form at `/report` — anyone can submit (no auth)
- Photo upload supported (stored in Supabase Storage)
- Patrol can also submit via `/patrol` page
- Admin views all violations at `/admin/violations`

---

## 8. API Routes Summary

### Auth
- `POST /api/auth/admin` — admin login → sets `session` cookie + returns token
- `POST /api/auth/patrol` — patrol login → sets `session` cookie
- `GET  /api/auth/session` — returns current session info
- `POST /api/auth/logout` — clears cookie

### Residents
- `GET  /api/residents` — list (admin)
- `POST /api/residents` — register new vehicle (public)
- `GET  /api/residents/[id]` — get one
- `PUT  /api/residents/[id]` — update (admin)
- `DELETE /api/residents/[id]` — delete (admin)
- `GET  /api/residents/export?format=csv|excel` — download (admin)
- `GET  /api/residents/unit-data?unit_id=` — get vehicles for a unit
- `GET  /api/residents/unit-status?unit_id=` — check if unit has registered vehicles

### Visitors
- `POST /api/visitors` — register visitor pass. **Not public**: needs a signed
  verification token (issued after email OTP) and passes the unit-eligibility gate
- `POST /api/visitors/verify-host` — what the UI calls to decide what to show;
  the same eligibility rule the write path enforces
- `GET  /api/visitors` — list (admin)
- `GET  /api/visitors/[id]` — get one
- `DELETE /api/visitors/[id]` — delete (admin)
- `GET  /api/visitors/export?format=csv|excel` — download (admin)
- `GET  /api/visitors/quota?unit_id=&year_month=` — nights used for a unit/month
- `GET  /api/visitors/unit-status?unit_id=&year_month=` — quota status

### Admin
- `GET  /api/admin/alerts` — list abuse alerts (supports `?resolved=true|false`)
- `PATCH /api/admin/alerts/[id]` — resolve alert
- `GET  /api/admin/stats` — dashboard stat counts
- `GET  /api/admin/overdue` — vehicles registered >1 year ago
- `GET/POST /api/admin/units` — list/create units
- `PUT/DELETE /api/admin/units/[id]`
- `GET  /api/admin/violations` — list violations
- `GET/PATCH /api/admin/vacation/[id]` — get/update vacation request
- `GET  /api/admin/oversized` — list oversized applications
- `GET  /api/admin/quota-summary` — monthly quota summary

### Documents
- `POST /api/documents/signed-url` — trade a vehicle's stored document path for a
  5-minute signed URL. Admins authenticate by session cookie, residents by
  verification token; the bucket is private so this is the only way to read one

### Cron
- `GET  /api/cron/remind-registration` — daily renewal reminders. Requires
  `CRON_SECRET` in the Authorization header; 503s if the variable is unset

### Other
- `POST /api/violations` — submit violation (public/patrol)
- `GET  /api/patrol/lookup?plate=` — plate lookup for patrol
- `POST /api/vacation` — submit vacation request (public)
- `GET  /api/vacation/unit-vehicles?unit_id=` — vehicles + owner info for a unit
- `GET  /api/units` — list all units (public, used in forms)

---

## 9. Key Utility Functions (`lib/utils.ts`)

```typescript
generateAccessCode()        // 6-char alphanumeric, no ambiguous chars (0,O,1,I)
normalizedPlate(plate)      // uppercase, remove spaces
formatPDT(dateStr, opts)    // display timestamp in PDT — USE THIS everywhere
getPTYearMonth()            // current "2026-05" in PDT — USE THIS for month queries
ptInputToISO(localStr)      // datetime-local string → UTC ISO (treats input as PT)
                            //   USE THIS before submitting form date fields to API
countNights(start, end)     // PDT-aware overnight count (uses ptDateParts internally)
monthBounds(yearMonth)      // { start, end } ISO strings for a given "YYYY-MM"
sortAddresses(items)        // sorts by street → house number → unit number
splitPhone(combined)        // "'+1' '4155551234'" → { countryCode, number }
maskPhone(phone)            // for display without exposing full number
maskEmail(email)            // for display
generateMonthOptions()      // 16 months (past 6 + current + future 9) for selects
US_STATES                   // string[] of US state codes
CAR_COLORS                  // predefined color options
CAR_MAKES                   // predefined make options
VIOLATION_LOCATIONS         // predefined location options for violation reports
VIOLATION_TYPES             // predefined violation type options
VEHICLE_TYPES               // Sedan, SUV, Truck, etc.
VISITOR_QUOTA_LIMIT = 10    // max nights per unit per month
PT_ZONE = 'America/Los_Angeles'
```

---

## 10. Design Decisions & Constraints

1. **RLS is on for every table**, and the app does not rely on it: all access goes
   through `supabaseAdmin` (service role), which bypasses RLS. The policies are the
   backstop for anything that reaches the database with the publishable key
   instead. The single deliberate exception is `units_public_read` — the address
   dropdown on public forms needs it, which does mean unit numbers and addresses
   are readable by anyone.

2. **The session cookie is signed** — HMAC-SHA256 over the payload using
   `SESSION_SECRET`, verified with `timingSafeEqual` (`lib/auth.ts`). The server
   refuses to start if the secret is missing or under 32 characters. Forging a
   role is not possible without the secret.

3. **Visitor registration requires a verified host.** `POST /api/visitors` needs a
   server-signed verification token (issued after email OTP) *and* passes the
   unit-eligibility gate — no overdue registrations, at least one approved
   vehicle. Enforced on the write path, not only in the UI. Abuse alerts are a
   monitoring backstop, not the access control.

4. **Violation reporting is unauthenticated** — `POST /api/violations` has no auth
   check. Anyone with the URL can submit a report. This is deliberate: residents
   must be able to report without an account.

5. **No real-time updates** — pages load data once; admins refresh to see changes.

6. **Plate normalization** — `normalizedPlate()` uppercases and strips spaces. All
   plate comparisons use `.ilike()` in Supabase.

7. **Cron requires `CRON_SECRET` and fails closed.** `/api/cron/remind-registration`
   returns 503 when the variable is unset rather than running unauthenticated.

---

## 11. Change History

Not maintained here — it went stale within days of being written. Use `git log`,
which carries the reasoning in the commit messages.

---

## 12. Open Items

Kept short on purpose; anything that stays here for long belongs in an issue.

- **Local development points at the production database.** `NEXT_PUBLIC_SUPABASE_URL`
  in `.env.local` is the live project, so `npm run dev` writes real data and can
  email real residents. A separate Supabase project for development is the fix.
- **`upload-doc` is open on units that have no vehicles.** Unavoidable for
  first-time registration — such a unit has no email on file to OTP against — but
  it does mean an unauthenticated upload path exists for new units.
- **Abandoned-upload orphans.** Documents uploaded through the registration form
  that is then never submitted (`temp_` prefix) are referenced by nothing, so the
  delete-time cleanup cannot see them. `scripts/clean-orphan-docs.mjs` sweeps them.
- **Migrations are applied by hand.** There is no record of which migration ran
  against production, and drift has happened in both directions — a column that
  existed only in production, and two migrations that were written but never run.

---

## 13. Credentials (Local Dev / Test)

> Credentials are **not** stored in this repository. Get local/test login
> details from the team's shared password manager, or read them from your own
> local `.env` / the `admin_users` table in your own Supabase project.

**No test data remains.** The pre-launch purge on 2026-08-20 emptied every
transactional table and both storage buckets. `units`, `admin_users` and
`notification_emails` were kept — they hold real data.

---

## 14. File Structure Quick Reference

```
vtg-parking/
├── app/
│   ├── page.tsx                          # Home page
│   ├── layout.tsx                        # Root layout (next-intl provider)
│   ├── admin/
│   │   ├── login/page.tsx                # Admin login
│   │   └── (protected)/
│   │       ├── layout.tsx                # Auth guard (server component)
│   │       ├── dashboard/page.tsx        # Main dashboard ⭐
│   │       ├── dashboard/ResolveAlertButton.tsx
│   │       ├── alerts/page.tsx           # Abuse alerts (3-tab)
│   │       ├── residents/page.tsx
│   │       ├── visitors/page.tsx
│   │       ├── violations/page.tsx
│   │       ├── vacation/page.tsx
│   │       ├── oversized/page.tsx
│   │       ├── quota-summary/page.tsx
│   │       ├── units/page.tsx
│   │       └── emails/page.tsx
│   ├── patrol/
│   │   ├── login/page.tsx
│   │   └── page.tsx                      # Plate lookup
│   ├── register/page.tsx                 # Resident registration
│   ├── visitor/page.tsx                  # Visitor pass
│   ├── report/page.tsx                   # Violation report
│   ├── vacation/page.tsx                 # Vacation request
│   └── api/                              # All API routes (see Section 8)
├── lib/
│   ├── utils.ts    ⭐ (timezone, formatting, constants)
│   ├── auth.ts     (session encode/decode)
│   ├── supabase.ts (client + admin clients)
│   └── email.ts    (Resend email sending)
├── messages/
│   ├── en.json
│   ├── zh.json
│   └── ko.json
├── components/
│   └── Navbar.tsx  (language switcher + home link)
├── CLAUDE.md       → @AGENTS.md
├── AGENTS.md       (Next.js version warning — read before writing code)
└── CONTEXT.md      ← this file
```
