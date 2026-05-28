import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mock handles ──────────────────────────────────────────────────────
const { mockDecodeToken, mockMaybeSingle, mockCurrentSingle, mockUpdate, mockUpdateEq, mockUpdateEqEq, mockFrom } =
  vi.hoisted(() => {
    const mockMaybeSingle = vi.fn()
    const mockCurrentSingle = vi.fn()
    const mockUpdateEqEq = vi.fn()
    const mockUpdateEq = vi.fn(() => ({ eq: mockUpdateEqEq }))
    const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }))
    const mockFrom = vi.fn()
    return { mockDecodeToken: vi.fn(), mockMaybeSingle, mockCurrentSingle, mockUpdate, mockUpdateEq, mockUpdateEqEq, mockFrom }
  })

vi.mock('@/lib/auth', () => ({ decodeVerificationToken: mockDecodeToken }))
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mockFrom } }))
vi.mock('@/lib/utils', () => ({ normalizedPlate: (p: string) => p }))

import { PATCH } from './route'

// ── Helpers ───────────────────────────────────────────────────────────────────
const UNIT_ID = 'unit-1'
const VEHICLE_ID = 'vehicle-1'
const TOKEN = 'valid-token'

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/residents/manage', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function setupUpdateVehicle({
  conflict = null,
  currentIsOversized = false,
  vehicleFound = true,
  updateError = null,
}: {
  conflict?: object | null
  currentIsOversized?: boolean
  vehicleFound?: boolean
  updateError?: { message: string } | null
} = {}) {
  mockFrom.mockReset()
  // call 1: plate conflict check — .select().ilike().neq().maybeSingle()
  mockFrom.mockReturnValueOnce({
    select: vi.fn(() => ({
      ilike: vi.fn(() => ({
        neq: vi.fn(() => ({ maybeSingle: mockMaybeSingle.mockResolvedValue({ data: conflict }) })),
      })),
    })),
  })
  // call 2: fetch current is_oversized — .select().eq().eq().single()
  const currentResult = vehicleFound
    ? { data: { is_oversized: currentIsOversized }, error: null }
    : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
  mockFrom.mockReturnValueOnce({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({ single: mockCurrentSingle.mockResolvedValue(currentResult) })),
      })),
    })),
  })
  // call 3: the actual update — .update().eq().eq()
  mockUpdateEqEq.mockResolvedValue({ error: updateError })
  mockFrom.mockReturnValueOnce({ update: mockUpdate })
}

function vehicleBody(overrides: object = {}) {
  return {
    action: 'update_vehicle',
    unit_id: UNIT_ID,
    token: TOKEN,
    vehicle_id: VEHICLE_ID,
    license_plate: 'ABC123',
    year: '2020', make: 'Ford', model: 'F-150', color: 'Black', plate_state: 'CA',
    is_oversized: false,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('PATCH /api/residents/manage — update_vehicle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDecodeToken.mockReturnValue({ unit_id: UNIT_ID, email: 'resident@example.com' })
  })

  it('returns 403 when token is invalid', async () => {
    mockDecodeToken.mockReturnValue(null)

    const res = await PATCH(makeRequest(vehicleBody()))

    expect(res.status).toBe(403)
  })

  it('returns 409 when license plate conflicts with another vehicle', async () => {
    // Only first from() call needed — conflict short-circuits before update
    mockFrom.mockReturnValueOnce({
      select: vi.fn(() => ({
        ilike: vi.fn(() => ({
          neq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'other-vehicle' } }) })),
        })),
      })),
    })

    const res = await PATCH(makeRequest(vehicleBody()))

    expect(res.status).toBe(409)
  })

  describe('oversized upgrade — false → true (privilege escalation regression)', () => {
    it('resets approval_status to pending', async () => {
      setupUpdateVehicle({ currentIsOversized: false })

      await PATCH(makeRequest(vehicleBody({ is_oversized: true })))

      const payload = mockUpdate.mock.calls[0][0] as Record<string, unknown>
      expect(payload.approval_status).toBe('pending')
    })

    it('clears reviewed_at, reviewed_by, and oversized_rejected_at', async () => {
      setupUpdateVehicle({ currentIsOversized: false })

      await PATCH(makeRequest(vehicleBody({ is_oversized: true })))

      const payload = mockUpdate.mock.calls[0][0] as Record<string, unknown>
      expect(payload.reviewed_at).toBeNull()
      expect(payload.reviewed_by).toBeNull()
      expect(payload.oversized_rejected_at).toBeNull()
    })

    it('returns 200', async () => {
      setupUpdateVehicle({ currentIsOversized: false })

      const res = await PATCH(makeRequest(vehicleBody({ is_oversized: true })))

      expect(res.status).toBe(200)
    })
  })

  describe('no change to oversized flag — false → false', () => {
    it('does not inject approval_status into the update payload', async () => {
      setupUpdateVehicle({ currentIsOversized: false })

      await PATCH(makeRequest(vehicleBody({ is_oversized: false })))

      const payload = mockUpdate.mock.calls[0][0] as Record<string, unknown>
      expect(payload.approval_status).toBeUndefined()
    })
  })

  describe('already oversized — true → true', () => {
    it('does not reset approval_status', async () => {
      setupUpdateVehicle({ currentIsOversized: true })

      await PATCH(makeRequest(vehicleBody({ is_oversized: true })))

      const payload = mockUpdate.mock.calls[0][0] as Record<string, unknown>
      expect(payload.approval_status).toBeUndefined()
    })
  })

  it('returns 404 when vehicle_id does not belong to the unit (cross-unit update blocked)', async () => {
    setupUpdateVehicle({ vehicleFound: false })

    const res = await PATCH(makeRequest(vehicleBody()))

    expect(res.status).toBe(404)
  })

  it('returns 500 when DB update fails', async () => {
    setupUpdateVehicle({ updateError: { message: 'connection timeout' } })

    const res = await PATCH(makeRequest(vehicleBody({ is_oversized: false })))

    expect(res.status).toBe(500)
  })
})
