# Vantage Parking — Project Context

> **Read this file at the start of every new conversation.**
> It describes the full current state of the system so you can continue development without re-reading the entire chat history.

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

## 4. Database Tables (Supabase)

| Table | Purpose |
|-------|---------|
| `units` | All residential units. Columns: `id` (UUID), `address` (e.g. "123 Example St") |
| `admin_users` | Admin/patrol accounts. Columns: `username`, `password_hash`, `role`, `active`, `last_login` |
| `resident_vehicles` | Registered resident cars. Columns: `unit_id`, `owner_name`, `owner_phone`, `owner_phone_country_code`, `owner_email`, `opt_in_sms`, `opt_in_email`, `license_plate`, `plate_state`, `year`, `make`, `model`, `color` |
| `visitor_registrations` | Visitor parking passes. Columns: `unit_id`, `visitor_name`, `visitor_phone`, `visitor_phone_country_code`, `license_plate`, `plate_state`, `make`, `model`, `color`, `start_datetime`, `end_datetime`, `access_code`, `created_at` |
| `visitor_monthly_quota` | Tracks nights used per unit per month. Columns: `unit_id`, `year_month`, `nights_used` |
| `abuse_alerts` | Visitor abuse flags. Columns: `license_plate`, `plate_state`, `year_month`, `unit_ids` (UUID[]), `registration_count`, `is_resolved`, `resolved_at`, `resolved_note` |
| `violations` | Parking violations logged by patrol. Columns: `license_plate`, `plate_state`, `vehicle_type`, `make`, `model`, `color`, `location`, `violation_type`, `notes`, `photo_url`, `reported_by`, `created_at` |
| `vacation_requests` | Extended-stay parking applications. Columns: `unit_id`, `plate`, `plate_state`, `make`, `model`, `color`, `phone`, `phone_country_code`, `start_date`, `end_date`, `notes`, `status` (`pending`/`approved`/`rejected`) |
| `oversized_applications` | Large vehicle permit applications. Columns: similar structure to vacation, includes `vehicle_type` |

**Address sort helper** — always use `sortAddresses()` from `lib/utils.ts` when displaying unit lists (sorts by street name, then house number, then unit number).

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

- **Limit:** `VISITOR_QUOTA_LIMIT = 10` nights per unit per calendar month
- **Calculation:** `countNights(start, end)` uses PDT calendar dates — an 18:00→10:00 stay = 1 night
- **Cross-month stays:** Split into monthly segments, each checked against that month's limit
- **Storage:** `visitor_monthly_quota` table tracks `nights_used` per `unit_id + year_month`

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
- `POST /api/visitors` — register visitor pass (public)
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

## 10. Known Design Decisions & Constraints

1. **No RLS on Supabase** — all DB access goes through `supabaseAdmin` in API routes. The browser-side `supabase` client exists but is rarely used.

2. **Session is not signed** — the `session` cookie is just base64-encoded JSON. Any user who can forge a cookie can impersonate any role. This is acceptable for an internal community app.

3. **Visitor registration is unauthenticated** — `POST /api/visitors` has no auth check. The only safeguard is the access code mechanism (residents get a code for their guests). The abuse alert system is the backstop.

4. **Violation reporting is unauthenticated** — `POST /api/violations` has no auth. Anyone with the URL can submit a violation report. Acceptable for community use.

5. **No real-time updates** — the dashboard polls on load only. Admins must refresh to see new data.

6. **Plate normalization** — `normalizedPlate()` uppercases and strips spaces. All plate comparisons use `.ilike()` (case-insensitive) in Supabase.

---

## 11. Recent Changes (this session)

### Visitor Registration — error messages
- `app/visitor/page.tsx`: `handleSubmit` now handles error codes with specific i18n messages:
  - `plate_conflict` (409) → `t('error_plate_conflict')` (was already done)
  - `quota_exceeded` (429) → `t('error_quota_exceeded')` ← **new**
  - other errors → `t('error_submission_failed')` ← **new**
  - network catch → `t('error_network')` ← **new**
- New keys added to all three locale files: `error_quota_exceeded`, `error_submission_failed`, `error_network` (under `visitor` namespace)

### Visitor Registration — quota gate removed
- Previously: form fields were hidden when `quotaExceeded === true`
- Now: form is always visible after email verification; quota exceeded shows as a warning only; actual enforcement is server-side (API returns 429 → handled by error message above)

### Visitor Search (admin)
- `app/admin/(protected)/visitors/page.tsx`: search box now does **client-side** keyword filtering across address, plate, access code, make, model, color, visitor name
- Previously it passed text as a UUID query param to the API (broken)
- New: loads up to 500 records, filters in-browser; shows `N / Total results` count when keyword active

### Timezone — full system fix (12 files)
All timestamps now correctly display Pacific Time. See Section 3.1 for full rules.

Files changed: `lib/utils.ts` (+`ptInputToISO`), `lib/email.ts` (5 email templates), `app/visitor/page.tsx`, `app/vacation/page.tsx`, and all 7 admin pages + patrol page.

---

## 12. Pending / Future Work

These items were discussed but not yet implemented:

- [x] **i18n zh.json mixed-language strings fixed** — 4 strings in `messages/zh.json` had English mixed in: `quota_remaining_label`, `no_vehicles_message`, `overdue_message`, `pending_oversized`. All corrected to pure Chinese.

- [x] **Oversized application email notification** — `sendOversizedDecision()` added to `lib/email.ts`. Called from `app/api/admin/oversized/[id]/route.ts` after a successful PATCH (approve or reject). Sends to `owner_email` if present; fire-and-forget (no await, won't block the response).

- [x] **Patrol plate lookup timezone verified** — API route (`app/api/patrol/lookup/route.ts`) returns raw UTC ISO strings for `valid_from`/`valid_until`. Patrol page (`app/patrol/page.tsx`) calls `formatPDT(..., { short: true })` on both fields. Chain is correct.

---

## 12. Credentials (Local Dev / Test)

> Credentials are **not** stored in this repository. Get local/test login
> details from the team's shared password manager, or read them from your own
> local `.env` / the `admin_users` table in your own Supabase project.

**Test data created during development:**
- Plate `ABUSETEST` (CA) — registered for 3 test units, has an unresolved abuse alert
- Plate `ABTEST99` (CA) — older test plate, abuse alert has been resolved

---

## 13. File Structure Quick Reference

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
