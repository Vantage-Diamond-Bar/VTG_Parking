import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockVerifyToken, mockEligibility, mockFrom, mockRpc } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn(),
  mockEligibility: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  verifyVerificationToken: mockVerifyToken,
  requireAdmin: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mockFrom, rpc: mockRpc } }))
vi.mock('@/lib/email', () => ({ sendVisitorBookingEmail: vi.fn() }))
vi.mock('@/lib/unit-eligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/unit-eligibility')>()),
  checkVisitorEligibility: mockEligibility,
}))

import { POST } from './route'

const UNIT = 'unit-1'

function makeRequest(body: object = {}) {
  return new NextRequest('http://localhost/api/visitors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      unit_id: UNIT,
      license_plate: 'GUEST01',
      plate_state: 'CA',
      start_datetime: '2026-09-01T10:00:00Z',
      end_datetime: '2026-09-02T10:00:00Z',
      verification_token: 'valid',
      ...body,
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerifyToken.mockReturnValue(true)
  mockEligibility.mockResolvedValue({ ok: true })
})

describe('POST /api/visitors — eligibility gate', () => {
  // The verification token is issued by /api/auth/verify-otp, which knows
  // nothing about registration status. Before this gate the rule lived only in
  // /api/visitors/verify-host — a UI call the client could simply skip.
  it('refuses an overdue unit even with a valid token', async () => {
    mockEligibility.mockResolvedValue({ ok: false, reason: 'overdue' })

    const res = await POST(makeRequest())

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'registration_overdue' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('refuses a unit with no approved vehicles', async () => {
    mockEligibility.mockResolvedValue({ ok: false, reason: 'no_vehicles' })

    const res = await POST(makeRequest())

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'no_resident_vehicles' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  // Fail closed: a database hiccup must not open the gate.
  it('refuses when the eligibility lookup fails', async () => {
    mockEligibility.mockResolvedValue({ ok: false, reason: 'lookup_failed' })

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('checks eligibility only after the token is validated', async () => {
    mockVerifyToken.mockReturnValue(false)

    const res = await POST(makeRequest())

    expect(res.status).toBe(403)
    expect(mockEligibility).not.toHaveBeenCalled()
  })

  it('proceeds to booking for an eligible unit', async () => {
    // Three reads happen after the gate: plate conflict (.ilike().maybeSingle()),
    // access-code collision (.eq().maybeSingle()), and the abuse scan
    // (.ilike().gte()) — so ilike has to serve both shapes.
    mockFrom.mockReturnValue({
      select: vi.fn(() => ({
        ilike: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          gte: vi.fn().mockResolvedValue({ data: [] }),
        })),
        eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) })),
      })),
    })
    mockRpc.mockResolvedValue({ data: { success: true, id: 'reg-1' }, error: null })

    const res = await POST(makeRequest())

    expect(mockEligibility).toHaveBeenCalledWith(UNIT)
    expect(mockRpc).toHaveBeenCalledWith('book_visitor_registration', expect.anything())
    expect(res.status).toBe(200)
  })
})
