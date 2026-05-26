# VTG Parking Management System — Domain Glossary

## Unit（住户单元）
A residential unit in the VTG community. Identified by `unit_number` and `address`. Each unit has a fixed number of garage spaces; community rules require the 1st and 2nd vehicles to be parked inside the unit's own garage.

## Resident Vehicle（住户车辆）
A vehicle registered by a resident to their unit, backed by a DMV registration document. Requires admin approval (`approval_status`: `pending | approved | rejected`). Has an `is_oversized` flag.

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

## Registration Renewal（登记年度更新）
Resident vehicles must renew their DMV registration document annually. The renewal timer is tracked via the `created_at` column on `resident_vehicles` — when a resident uploads a new document (`update_doc` action), `created_at` is intentionally overwritten with the current timestamp to reset the timer. The UI displays this field as "Doc Last Renewed."

A unit is considered **registration overdue** if any of its approved vehicles has `created_at` older than 1 year. Overdue status blocks the unit from submitting Vacation Parking Requests.

A scheduled cron job (`/api/cron/remind-registration`) emails residents when their registration is due. **Correct reminder schedule**:
- Starting 1 month before expiry: weekly reminders with a "renew soon" tone
- After expiry: monthly reminders with an "overdue" tone
Current implementation sends a single reminder only after the 1-year mark has already passed — missing the pre-expiry weekly cadence entirely.

**Overdue enforcement**: a unit with any overdue vehicle must be blocked from both Visitor Registrations and Vacation Parking Requests. Currently the overdue check only exists in the Vacation Parking route; the Visitor Registration route (`/api/visitors/route.ts`) has no such check — this is a bug.

## Parking Time Limit（停放时限）
The community rule currently enforces a **96-hour** maximum for a vehicle to remain in the same outdoor spot without movement. This value appears in all UI strings and `lib/utils.ts:VIOLATION_TYPES`. The `supabase/schema.sql` enum currently says "72 Hours" — that is a bug; all other references say 96. If HOA changes the rule, every reference below must be updated together:
- `supabase/schema.sql` (enum definition — needs a migration)
- `lib/utils.ts` (`VIOLATION_TYPES` constant)
- `messages/en.json`, `messages/zh.json`, `messages/ko.json` (both the violation type label and the vacation page subtitle)
