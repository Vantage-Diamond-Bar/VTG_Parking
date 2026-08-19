import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockRequireAdmin, mockDecodeToken, mockSign, mockFrom, mockMaybeSingle } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockDecodeToken: vi.fn(),
  mockSign: vi.fn(),
  mockFrom: vi.fn(),
  mockMaybeSingle: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireAdmin: mockRequireAdmin,
  decodeVerificationToken: mockDecodeToken,
}))
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mockFrom } }))
vi.mock('@/lib/registration-docs', () => ({ signRegistrationDoc: mockSign }))

import { POST } from './route'

const UNIT_A = 'unit-a'
const UNIT_B = 'unit-b'
const VEHICLE_A = 'vehicle-a'
const DOC_PATH = `${UNIT_A}/ABC123.pdf`
const SIGNED = 'https://example.supabase.co/storage/v1/object/sign/registration-docs/x?token=y'

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/documents/signed-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** The route's only DB read: .select().eq().maybeSingle() */
function setupVehicle(vehicle: { unit_id: string; registration_doc_path: string | null } | null) {
  mockFrom.mockReset()
  mockMaybeSingle.mockResolvedValue({ data: vehicle })
  mockFrom.mockReturnValue({
    select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: mockMaybeSingle })) })),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAdmin.mockResolvedValue(null)
  mockDecodeToken.mockReturnValue(null)
  mockSign.mockResolvedValue(SIGNED)
})

describe('POST /api/documents/signed-url', () => {
  it('rejects a request with no vehicle_id', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('404s when the vehicle has no document', async () => {
    setupVehicle({ unit_id: UNIT_A, registration_doc_path: null })
    const res = await POST(makeRequest({ vehicle_id: VEHICLE_A }))
    expect(res.status).toBe(404)
    expect(mockSign).not.toHaveBeenCalled()
  })

  it('signs any unit for an authenticated admin, without a token', async () => {
    setupVehicle({ unit_id: UNIT_A, registration_doc_path: DOC_PATH })
    mockRequireAdmin.mockResolvedValue({ role: 'admin', otp_verified: true })

    const res = await POST(makeRequest({ vehicle_id: VEHICLE_A }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: SIGNED })
    expect(mockSign).toHaveBeenCalledWith(DOC_PATH)
  })

  it('signs for a resident whose token matches the vehicle unit', async () => {
    setupVehicle({ unit_id: UNIT_A, registration_doc_path: DOC_PATH })
    mockDecodeToken.mockReturnValue({ unit_id: UNIT_A, email: 'a@example.com', exp: Date.now() + 1000 })

    const res = await POST(makeRequest({ vehicle_id: VEHICLE_A, unit_id: UNIT_A, token: 'good' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: SIGNED })
  })

  it('rejects an unauthenticated caller with no token', async () => {
    setupVehicle({ unit_id: UNIT_A, registration_doc_path: DOC_PATH })
    const res = await POST(makeRequest({ vehicle_id: VEHICLE_A, unit_id: UNIT_A }))
    expect(res.status).toBe(403)
    expect(mockSign).not.toHaveBeenCalled()
  })

  it('rejects a token issued for a different unit', async () => {
    setupVehicle({ unit_id: UNIT_A, registration_doc_path: DOC_PATH })
    mockDecodeToken.mockReturnValue({ unit_id: UNIT_B, email: 'b@example.com', exp: Date.now() + 1000 })

    const res = await POST(makeRequest({ vehicle_id: VEHICLE_A, unit_id: UNIT_A, token: 'other-unit' }))

    expect(res.status).toBe(403)
    expect(mockSign).not.toHaveBeenCalled()
  })

  // The escalation this endpoint exists to prevent: a resident holding a valid
  // token for their own unit asks for a vehicle belonging to someone else. The
  // token checks out against the unit_id they sent, so only comparing the
  // vehicle's own unit catches it.
  it("rejects a valid token used against another unit's vehicle", async () => {
    setupVehicle({ unit_id: UNIT_B, registration_doc_path: `${UNIT_B}/XYZ789.pdf` })
    mockDecodeToken.mockReturnValue({ unit_id: UNIT_A, email: 'a@example.com', exp: Date.now() + 1000 })

    const res = await POST(makeRequest({ vehicle_id: 'vehicle-b', unit_id: UNIT_A, token: 'own-unit' }))

    expect(res.status).toBe(403)
    expect(mockSign).not.toHaveBeenCalled()
  })

  it('500s when the object cannot be signed', async () => {
    setupVehicle({ unit_id: UNIT_A, registration_doc_path: DOC_PATH })
    mockRequireAdmin.mockResolvedValue({ role: 'admin', otp_verified: true })
    mockSign.mockResolvedValue(null)

    const res = await POST(makeRequest({ vehicle_id: VEHICLE_A }))

    expect(res.status).toBe(500)
  })
})
