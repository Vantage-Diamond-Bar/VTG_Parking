import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom, mockEqUnit, mockEqStatus } = vi.hoisted(() => {
  const mockEqStatus = vi.fn()
  const mockEqUnit = vi.fn(() => ({ eq: mockEqStatus }))
  const mockFrom = vi.fn(() => ({ select: vi.fn(() => ({ eq: mockEqUnit })) }))
  return { mockFrom, mockEqUnit, mockEqStatus }
})

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mockFrom } }))

import {
  checkVisitorEligibility,
  hasOverdueRegistration,
  isRegistrationOverdue,
  eligibilityErrorBody,
} from './unit-eligibility'

const UNIT = 'unit-1'
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

/** The helper issues one query: .select().eq(unit_id).eq(approval_status) */
function vehicles(created: string[] | null) {
  mockEqStatus.mockResolvedValue(
    created === null
      ? { data: null, error: { message: 'boom' } }
      : { data: created.map((c) => ({ created_at: c })), error: null }
  )
}

beforeEach(() => vi.clearAllMocks())

describe('isRegistrationOverdue', () => {
  const now = new Date('2026-08-19T12:00:00Z')

  it('is false one day short of a year', () => {
    expect(isRegistrationOverdue('2025-08-20T12:00:00Z', now)).toBe(false)
  })

  it('is true one day past a year', () => {
    expect(isRegistrationOverdue('2025-08-18T12:00:00Z', now)).toBe(true)
  })

  it('is false exactly on the anniversary', () => {
    expect(isRegistrationOverdue('2025-08-19T12:00:00Z', now)).toBe(false)
  })
})

describe('checkVisitorEligibility', () => {
  it('allows a unit whose registrations are current', async () => {
    vehicles([daysAgo(10), daysAgo(200)])
    expect(await checkVisitorEligibility(UNIT)).toEqual({ ok: true })
  })

  it('refuses a unit with no approved vehicles', async () => {
    vehicles([])
    expect(await checkVisitorEligibility(UNIT)).toEqual({ ok: false, reason: 'no_vehicles' })
  })

  // Any single lapsed vehicle taints the unit — matching what verify-host has
  // always shown residents.
  it('refuses when one of several vehicles is overdue', async () => {
    vehicles([daysAgo(10), daysAgo(400)])
    expect(await checkVisitorEligibility(UNIT)).toEqual({ ok: false, reason: 'overdue' })
  })

  // Fail closed: a database error must not read as "eligible".
  it('refuses when the lookup fails', async () => {
    vehicles(null)
    expect(await checkVisitorEligibility(UNIT)).toEqual({ ok: false, reason: 'lookup_failed' })
  })

  it('queries only approved vehicles for the unit', async () => {
    vehicles([daysAgo(5)])
    await checkVisitorEligibility(UNIT)
    expect(mockFrom).toHaveBeenCalledWith('resident_vehicles')
    expect(mockEqUnit).toHaveBeenCalledWith('unit_id', UNIT)
    expect(mockEqStatus).toHaveBeenCalledWith('approval_status', 'approved')
  })
})

describe('hasOverdueRegistration', () => {
  it('is true when any vehicle has lapsed', async () => {
    vehicles([daysAgo(400)])
    expect(await hasOverdueRegistration(UNIT)).toBe(true)
  })

  // Unlike checkVisitorEligibility, an empty unit is not "overdue" — the
  // Vacation route decides emptiness by its own eligibility rules.
  it('is false for a unit with no vehicles', async () => {
    vehicles([])
    expect(await hasOverdueRegistration(UNIT)).toBe(false)
  })
})

describe('eligibilityErrorBody', () => {
  it('maps refusals to stable wire codes', () => {
    expect(eligibilityErrorBody('overdue')).toEqual({ error: 'registration_overdue', status: 403 })
    expect(eligibilityErrorBody('no_vehicles')).toEqual({ error: 'no_resident_vehicles', status: 403 })
    expect(eligibilityErrorBody('lookup_failed')).toEqual({ error: 'eligibility_check_failed', status: 500 })
  })
})
