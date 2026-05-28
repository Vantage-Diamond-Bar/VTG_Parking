import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mock handles ──────────────────────────────────────────────────────
const { mockRequireAdmin, mockFrom } = vi.hoisted(() => {
  return {
    mockRequireAdmin: vi.fn(),
    mockFrom: vi.fn(),
  }
})

vi.mock('@/lib/auth', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mockFrom } }))

import { GET } from './route'

// ── Fixtures ──────────────────────────────────────────────────────────────────
const adminUser = { id: 'admin-1', username: 'admin', role: 'admin' as const }

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/admin/oversized')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url.toString())
}

// Supabase builders are thenables: every filter method returns the builder itself;
// `await query` is the only point of execution. All methods must return the same object.
function setupQuery(rows: object[], { error = null }: { error?: object | null } = {}) {
  const terminal = { data: rows, error, count: rows.length }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    then: (resolve: (v: typeof terminal) => unknown) => Promise.resolve(terminal).then(resolve),
    catch: (_: unknown) => chain,
  }
  for (const m of ['select', 'order', 'range', 'eq', 'not', 'is', 'or']) {
    chain[m] = vi.fn(() => chain)
  }
  mockFrom.mockReturnValue(chain)
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('GET /api/admin/oversized — status mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAdmin.mockResolvedValue(adminUser)
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireAdmin.mockResolvedValue(null)
    setupQuery([])

    const res = await GET(makeRequest())

    expect(res.status).toBe(401)
  })

  it('maps a pending row to status="pending" even when oversized_rejected_at is set (re-applicant)', async () => {
    // This row was previously rejected (oversized_rejected_at set) and has re-applied
    // (is_oversized=true, approval_status=pending). Before the fix, it mapped to 'rejected'.
    setupQuery([
      {
        id: 'v-1',
        is_oversized: true,
        approval_status: 'pending',
        oversized_rejected_at: '2026-04-01T00:00:00Z',
        units: { address: '101 Main St' },
      },
    ])

    const res = await GET(makeRequest({ status: 'all' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data[0].status).toBe('pending')
  })

  it('maps an approved oversized row (no rejection history) to status="approved"', async () => {
    setupQuery([
      {
        id: 'v-2',
        is_oversized: true,
        approval_status: 'approved',
        oversized_rejected_at: null,
        units: { address: '102 Main St' },
      },
    ])

    const res = await GET(makeRequest({ status: 'all' }))
    const body = await res.json()

    expect(body.data[0].status).toBe('approved')
  })

  it('maps a rejected row (is_oversized=false, oversized_rejected_at set) to status="rejected"', async () => {
    setupQuery([
      {
        id: 'v-3',
        is_oversized: false,
        approval_status: 'approved',
        oversized_rejected_at: '2026-04-01T00:00:00Z',
        units: { address: '103 Main St' },
      },
    ])

    const res = await GET(makeRequest({ status: 'all' }))
    const body = await res.json()

    expect(body.data[0].status).toBe('rejected')
  })

  it('returns 500 when the DB query fails', async () => {
    setupQuery([], { error: { message: 'connection refused' } })

    const res = await GET(makeRequest())

    expect(res.status).toBe(500)
  })
})
