# VTG Parking Management System — Domain Glossary

## Unit（住户单元）
A residential unit in the VTG community. Identified by `unit_number` and `address`. Each unit has a fixed number of garage spaces; community rules require the 1st and 2nd vehicles to be parked inside the unit's own garage.

## Resident Vehicle（住户车辆）
A vehicle registered by a resident to their unit, backed by a DMV registration document. Requires admin approval (`approval_status`: `pending | approved | rejected`). Has an `is_oversized` flag.

## Registration Document（行驶证文件）
The DMV registration backing a Resident Vehicle. It is **PII**, so the `registration-docs` storage bucket is **private** (since 2026-08-19; it was public before that, and every stored URL was readable by anyone who had it).

`resident_vehicles.registration_doc_path` holds the **object path** inside the bucket (`{unit_id}/{plate}.{ext}`), never a URL. Reading one goes through `POST /api/documents/signed-url`, which authorises the caller and returns a signed URL valid for 5 minutes.

Three invariants hold this together — breaking any one reopens a hole:
1. **The path is stored, never recomputed.** Filenames are built from the plate at upload time, and `update_vehicle` lets residents change the plate without renaming the file. A derived path would drift off the real object.
2. **A client-supplied path is validated against its unit.** `POST /api/residents` takes the path from the browser; `isPathOwnedByUnit` requires the `{unit_id}/` prefix. Without it a registrant could point their own vehicle row at another unit's document and read it through the signing endpoint legitimately.
3. **The signing endpoint checks the vehicle's unit, not just the caller's.** A resident holding a valid token for their own unit must not be able to name someone else's `vehicle_id`.

`oversized_applications.registration_doc_url` is frozen legacy and deliberately keeps the old name and public-URL contents. Nothing reads it.

**Upload authorisation is conditional, by necessity.** `POST /api/residents/upload-doc` serves the first-time registration form, and a unit with no vehicles has no email on file to send an OTP to — that path cannot present a token. So the endpoint requires a verification token only when the unit already has vehicles. A unit with zero vehicles remains open to anonymous upload; that is inherent to public self-registration, not an oversight.

A registered vehicle occupies an **outdoor communal parking spot** only if:
- It is **oversized** (too large to fit in the garage), or
- It is the **3rd or later vehicle** registered to the unit.

All other registered vehicles are expected to park in the unit's own garage.

## Oversized Vehicle（超大型车辆）
A vehicle that physically cannot fit in the unit's garage (e.g., large trucks, boats, full-size vans). Classified via `is_oversized = true`. Oversized vehicles are always permitted to park in outdoor communal spots and require admin approval after a physical garage-space inspection.

## Visitor Registration（访客登记）
A temporary parking permit created by a resident (the "host") for a **guest vehicle** not registered to the unit. Grants the guest the right to park in a communal outdoor spot for a specified date range. Subject to the unit's monthly visitor quota. Produces an `access_code` that patrol can verify.

## Vacation Parking Request（度假停车申请）
A request by a resident to exempt one of their **own registered vehicles** from the community's parking time limit enforcement. Used when a resident must leave a vehicle parked in a communal outdoor spot for an extended period (travel, medical, etc.).

**Eligibility** — a vacation request is only valid if the submitted vehicle actually occupies an outdoor spot:
- The vehicle is **oversized**, OR
- The unit has **3 or more approved resident vehicles** (the submitted vehicle is the 3rd or beyond)

If the vehicle should be parked in the garage (1st or 2nd non-oversized vehicle), the request is rejected.

## Visitor Monthly Quota（访客月度额度）
A per-unit cap of **10 visitor-nights per calendar month** (Pacific Time). Enforced atomically via the `book_visitor_registration` database function. A "night" is counted as one calendar date difference in Pacific Time (e.g., check-in May 20 → check-out May 21 = 1 night). All quota reads compute directly from `visitor_registrations` — no separate cache table exists (the legacy `visitor_monthly_quota` table was dropped; it was write-only and never read).

## Abuse Alert（滥用警示）
An automatic flag raised when the same license plate is registered as a visitor for **2 or more different units** within the same calendar month. Surfaced to admins for review. Does not block the registration and carries no automated enforcement — purely informational at this stage.

## Access Code（通行码）
A 6-character alphanumeric code (excluding ambiguous chars 0, O, 1, I) generated for each Visitor Registration or approved Vacation Parking Request. Used by patrol to look up and verify a parked vehicle's authorization without knowing the plate number.

## Registrant Type（登记人身份）
Whether the person registering vehicles for a unit is the unit `owner` or a `tenant`.

## Admin User（管理员）
A system user with role `admin`. Can approve/reject resident vehicles and vacation requests, view all registrations, manage units, and configure notification emails.

## Patrol User（巡逻员）
A system user with role `patrol`. Can look up vehicles by license plate or access code to verify parking authorization. Read-only access; cannot modify any records.

## Violation Report（违章举报）
A parking violation submitted by any community member or patrol officer. Captures location, violation type, optional photo, and optional license plate. Routed to configured notification email recipients.

**Photo storage — `violation-photos` stays a public bucket, by decision (2026-08-19).** This is a deliberate, accepted trade-off, not an oversight, and it is the opposite of the call made for `registration-docs` (see [Registration Document](#registration-document行驶证文件)).

Two things drove it:
- `lib/email.ts` embeds each photo into the notification email as `<img src="{public url}">`. Making the bucket private breaks the images in every violation email already sitting in recipients' inboxes, and in every future one. Fixing that properly means sending photos as attachments, not a flag flip.
- The sensitivity is far lower. These are photos of vehicles in communal areas, and the object key is `{timestamp}-{index}.jpg` — it carries no unit or resident identity, unlike `registration-docs` where the key is `{unit_id}/{plate}.{ext}` and the file is a DMV document with name and address on it.

If the HOA ever requires these private, the work is: signed URLs for the admin UI (reuse the `registration-docs` pattern) **plus** switching the email from embedded `<img>` to real attachments. Do not "solve" it by replacing the photos with a link to the admin portal — that trades a one-glance email for a login every time.

## Registration Renewal（登记年度更新）
Resident vehicles must renew their DMV registration document annually. The renewal timer is tracked via the `created_at` column on `resident_vehicles` — when a resident uploads a new document (`update_doc` action), `created_at` is intentionally overwritten with the current timestamp to reset the timer. The UI displays this field as "Doc Last Renewed."

A unit is considered **registration overdue** if any of its approved vehicles has `created_at` older than 1 year. Overdue status blocks the unit from submitting Vacation Parking Requests.

A scheduled cron job (`/api/cron/remind-registration`) emails residents when their registration is due. **Correct reminder schedule**:
- Starting 1 month before expiry: weekly reminders with a "renew soon" tone
- After expiry: monthly reminders with an "overdue" tone
Current implementation sends a single reminder only after the 1-year mark has already passed — missing the pre-expiry weekly cadence entirely.

**Overdue enforcement**: a unit with any overdue vehicle must be blocked from both Visitor Registrations and Vacation Parking Requests. Currently the overdue check only exists in the Vacation Parking route; the Visitor Registration route (`/api/visitors/route.ts`) has no such check — this is a bug.

## Parking Time Limit（停放时限）
The community rule enforces a **72-hour** maximum for a vehicle to remain in the same outdoor spot without movement. Changed from 96 to 72 on 2026-08-19 by HOA decision; every reference below was updated together and must stay in lockstep if the rule changes again:
- `lib/utils.ts` (`VIOLATION_TYPES` constant — this string is both the DB enum value and the i18n lookup key)
- `messages/en.json`, `messages/zh.json`, `messages/ko.json` (the `violation_types` key **and** its translated value, plus the vacation page subtitle)
- `supabase/schema.sql` (enum definition, for fresh databases)

Missing any one of the four code references leaves the report dropdown showing the raw English string instead of the translation.

**Dead enum value**: `'Vehicle Parked for Over 96 Hours Without Movement'` remains in `violation_type` on existing databases (added by `20260527_schema_catch_up.sql`). Postgres cannot drop an enum value without rebuilding the type, and nothing writes it any more, so it is left in place. It is absent from `schema.sql`, so fresh databases never get it.
