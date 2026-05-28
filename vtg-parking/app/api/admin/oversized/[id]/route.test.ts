import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mock handles (must precede vi.mock calls) ────────────────────────
const { mockRequireAdmin, mockSingle, mockUpdate, mockUpdateEq, mockFrom, mockSendOversizedDecision } =
  vi.hoisted(() => {
    const mockSingle = vi.fn()
    const mockUpdateEq = vi.fn()
    const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }))
    const mockFrom = vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: mockSingle })) })),
      update: mockUpdate,
    }))
    return {
      mockRequireAdmin: vi.fn(),
      mockSingle,
      mockUpdate,
      mockUpdateEq,
      mockFrom,
      mockSendOversizedDecision: vi.fn(),
    }
  })

vi.mock('@/lib/auth', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mockFrom } }))
vi.mock('@/lib/email', () => ({ sendOversizedDecision: mockSendOversizedDecision }))

import { PATCH } from './route'

// ── Fixtures ─────────────────────────────────────────────────────────────────
const adminUser = {
  id: 'admin-1',
  username: 'admin',
  role: 'admin' as const,
  display_name: 'Admin',
  otp_verified: true,
}

const baseVehicle = {
  id: 'vehicle-1',
  is_oversized: true,
  approval_status: 'pending',
  oversized_rejected_at: null,
  owner_email: null,
  owner_name: 'Test Owner',
  year: '2020',
  make: 'Ford',
  model: 'F-150',
  color: 'Black',
  license_plate: 'ABC123',
  plate_state: 'CA',
  units: { address: '123 Main St' },
}

function makeRequest(body: object, id = 'vehicle-1') {
  return new NextRequest(`http://localhost/api/admin/oversized/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeParams(id = 'vehicle-1') {
  return { params: Promise.resolve({ id }) }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('PATCH /api/admin/oversized/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: update succeeds
    mockUpdateEq.mockResolvedValue({ error: null })
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireAdmin.mockResolvedValue(null)

    const res = await PATCH(makeRequest({ status: 'approved' }), makeParams())

    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid status value', async () => {
    mockRequireAdmin.mockResolvedValue(adminUser)

    const res = await PATCH(makeRequest({ status: 'pending' }), makeParams())

    expect(res.status).toBe(400)
  })

  it('returns 404 when vehicle does not exist', async () => {
    mockRequireAdmin.mockResolvedValue(adminUser)
    mockSingle.mockResolvedValue({ data: null })

    const res = await PATCH(makeRequest({ status: 'approved' }), makeParams('nonexistent'))

    expect(res.status).toBe(404)
  })

  describe('rejection', () => {
    it('sets is_oversized false, records oversized_rejected_at, keeps approval_status approved', async () => {
      mockRequireAdmin.mockResolvedValue(adminUser)
      mockSingle.mockResolvedValue({ data: { ...baseVehicle } })

      const res = await PATCH(
        makeRequest({ status: 'rejected', admin_notes: 'fits in garage' }),
        makeParams()
      )

      expect(res.status).toBe(200)
      const payload = mockUpdate.mock.calls[0][0] as Record<string, unknown>
      expect(payload.is_oversized).toBe(false)
      expect(payload.approval_status).toBe('approved')
      expect(payload.oversized_rejected_at).toBeTruthy()
      expect(payload.admin_notes).toBe('fits in garage')
    })
  })

  describe('approval', () => {
    it('sets is_oversized true and clears oversized_rejected_at', async () => {
      mockRequireAdmin.mockResolvedValue(adminUser)
      mockSingle.mockResolvedValue({ data: { ...baseVehicle } })

      const res = await PATCH(makeRequest({ status: 'approved' }), makeParams())

      expect(res.status).toBe(200)
      const payload = mockUpdate.mock.calls[0][0] as Record<string, unknown>
      expect(payload.is_oversized).toBe(true)
      expect(payload.oversized_rejected_at).toBeNull()
      expect(payload.approval_status).toBe('approved')
    })

    it('re-approves a previously rejected vehicle (is_oversized was false)', async () => {
      mockRequireAdmin.mockResolvedValue(adminUser)
      // Vehicle was rejected: is_oversized=false, oversized_rejected_at set
      mockSingle.mockResolvedValue({
        data: {
          ...baseVehicle,
          is_oversized: false,
          oversized_rejected_at: '2026-05-01T00:00:00Z',
        },
      })

      const res = await PATCH(makeRequest({ status: 'approved' }), makeParams())

      expect(res.status).toBe(200)
      const payload = mockUpdate.mock.calls[0][0] as Record<string, unknown>
      expect(payload.is_oversized).toBe(true)
      expect(payload.oversized_rejected_at).toBeNull()
    })
  })

  describe('email notification', () => {
    it('sends decision email when owner_email is present', async () => {
      mockRequireAdmin.mockResolvedValue(adminUser)
      mockSingle.mockResolvedValue({
        data: { ...baseVehicle, owner_email: 'owner@example.com' },
      })

      await PATCH(makeRequest({ status: 'approved' }), makeParams())

      expect(mockSendOversizedDecision).toHaveBeenCalledOnce()
      expect(mockSendOversizedDecision).toHaveBeenCalledWith(
        expect.objectContaining({ applicantEmail: 'owner@example.com', status: 'approved' })
      )
    })

    it('does not send email when owner_email is absent', async () => {
      mockRequireAdmin.mockResolvedValue(adminUser)
      mockSingle.mockResolvedValue({ data: { ...baseVehicle, owner_email: null } })

      await PATCH(makeRequest({ status: 'approved' }), makeParams())

      expect(mockSendOversizedDecision).not.toHaveBeenCalled()
    })

    it('still returns 200 when email sending throws (DB update already committed)', async () => {
      mockRequireAdmin.mockResolvedValue(adminUser)
      mockSingle.mockResolvedValue({
        data: { ...baseVehicle, owner_email: 'owner@example.com' },
      })
      mockSendOversizedDecision.mockRejectedValue(new Error('mail service unavailable'))

      const res = await PATCH(makeRequest({ status: 'approved' }), makeParams())

      expect(res.status).toBe(200)
    })
  })

  it('returns 500 when DB update fails', async () => {
    mockRequireAdmin.mockResolvedValue(adminUser)
    mockSingle.mockResolvedValue({ data: { ...baseVehicle } })
    mockUpdateEq.mockResolvedValue({ error: { message: 'connection timeout' } })

    const res = await PATCH(makeRequest({ status: 'approved' }), makeParams())

    expect(res.status).toBe(500)
  })
})
