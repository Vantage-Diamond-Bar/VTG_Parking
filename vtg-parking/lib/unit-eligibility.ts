// Whether a unit is currently entitled to outdoor guest parking.
//
// The rule lived in three separate copies (visitors/verify-host, vacation, and
// vacation/unit-check), each re-deriving "approved vehicles, created_at older
// than a year, .some()". Adding two more call sites would have made five, so
// the predicate lives here once.
//
// Server-only: imports the service-role client.

import { supabaseAdmin } from '@/lib/supabase'

/** A registration is good for one year from `created_at`. */
export function isRegistrationOverdue(createdAt: string | Date, now: Date = new Date()): boolean {
  const oneYearAgo = new Date(now)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  return new Date(createdAt) < oneYearAgo
}

/** `created_at` of every approved vehicle on the unit. */
async function approvedRegistrationDates(unit_id: string): Promise<string[] | null> {
  const { data, error } = await supabaseAdmin
    .from('resident_vehicles')
    .select('created_at')
    .eq('unit_id', unit_id)
    .eq('approval_status', 'approved')

  if (error) return null
  return (data ?? []).map((v) => v.created_at as string)
}

export type VisitorEligibility =
  | { ok: true }
  | { ok: false; reason: 'no_vehicles' | 'overdue' | 'lookup_failed' }

/**
 * Can this unit create or modify visitor parking right now?
 *
 * Mirrors exactly what /api/visitors/verify-host shows the resident, so the UI
 * gate and the write endpoints cannot disagree. Enforcing it only in
 * verify-host left the booking API open: the verification token comes from
 * /api/auth/verify-otp, which knows nothing about overdue registrations, so a
 * resident could skip the gate and POST straight to the booking endpoint.
 */
export async function checkVisitorEligibility(unit_id: string): Promise<VisitorEligibility> {
  const dates = await approvedRegistrationDates(unit_id)
  if (dates === null) return { ok: false, reason: 'lookup_failed' }
  if (dates.length === 0) return { ok: false, reason: 'no_vehicles' }
  if (dates.some((d) => isRegistrationOverdue(d))) return { ok: false, reason: 'overdue' }
  return { ok: true }
}

/**
 * Overdue-only check, for callers that deliberately do not require the unit to
 * hold vehicles — the Vacation Parking route decides eligibility by its own
 * rules (3+ vehicles, or oversized) and only wants the overdue gate here.
 */
export async function hasOverdueRegistration(unit_id: string): Promise<boolean> {
  const dates = await approvedRegistrationDates(unit_id)
  return (dates ?? []).some((d) => isRegistrationOverdue(d))
}

/** Maps a refusal onto the wire format the visitor endpoints return. */
export function eligibilityErrorBody(
  reason: Exclude<VisitorEligibility, { ok: true }>['reason']
): { error: string; status: number } {
  switch (reason) {
    case 'no_vehicles':
      return { error: 'no_resident_vehicles', status: 403 }
    case 'overdue':
      return { error: 'registration_overdue', status: 403 }
    case 'lookup_failed':
      return { error: 'eligibility_check_failed', status: 500 }
  }
}
