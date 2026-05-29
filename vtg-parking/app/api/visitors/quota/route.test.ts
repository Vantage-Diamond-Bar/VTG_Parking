import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mock handles ──────────────────────────────────────────────────────
const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mockFrom } }))

import { GET } from './route'

// ── Chain builder ─────────────────────────────────────────────────────────────
// Handles .from().select().eq().lt().gt() — resolves to { data, error }
type QueryResult = { data: { start_datetime: string; end_datetime: string }[] | null; error: { message: string } | null }

function queryChain(result: QueryResult) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    then: (resolve: (v: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
    catch: (_: unknown) => chain,
  }
  for (const m of ['select', 'eq', 'lt', 'gt', 'gte', 'lte', 'order', 'limit', 'not']) {
    chain[m] = vi.fn(() => chain)
  }
  return chain
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/visitors/quota')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url.toString())
}

// ── Test timestamps (PDT = UTC-7, May–June 2026) ──────────────────────────────
// PDT midnight → UTC: add 7h
const MAY_20_6PM  = '2026-05-21T01:00:00.000Z'  // May 20 18:00 PDT
const MAY_23_10AM = '2026-05-23T17:00:00.000Z'  // May 23 10:00 PDT
const MAY_29_MID  = '2026-05-29T07:00:00.000Z'  // May 29 00:00 PDT
const JUN_02_MID  = '2026-06-02T07:00:00.000Z'  // Jun 2  00:00 PDT
const MAY_01_MID  = '2026-05-01T07:00:00.000Z'  // May 1  00:00 PDT
const MAY_03_MID  = '2026-05-03T07:00:00.000Z'  // May 3  00:00 PDT
const MAY_10_MID  = '2026-05-10T07:00:00.000Z'  // May 10 00:00 PDT
const MAY_12_MID  = '2026-05-12T07:00:00.000Z'  // May 12 00:00 PDT

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('GET /api/visitors/quota — nights_used calculation', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── Cycle 1 — validation ──────────────────────────────────────────────────

  it('returns 400 when unit_id is missing', async () => {
    const res = await GET(makeRequest({ year_month: '2026-05' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when year_month is missing', async () => {
    const res = await GET(makeRequest({ unit_id: 'unit-1' }))
    expect(res.status).toBe(400)
  })

  // ── Cycle 2 — tracer bullet ───────────────────────────────────────────────

  it('returns nights_used: 0 and quota_limit: 10 when there are no registrations', async () => {
    mockFrom.mockReturnValueOnce(queryChain({ data: [], error: null }))

    const res = await GET(makeRequest({ unit_id: 'unit-1', year_month: '2026-05' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.nights_used).toBe(0)
    expect(body.quota_limit).toBe(10)
  })

  // ── Cycle 3 — single booking within the month ─────────────────────────────

  it('counts nights for a single booking wholly within the month', async () => {
    // May 20 18:00 PDT → May 23 10:00 PDT
    // PDT dates: May 20 → May 23  = 3 nights (20→21, 21→22, 22→23)
    mockFrom.mockReturnValueOnce(queryChain({
      data: [{ start_datetime: MAY_20_6PM, end_datetime: MAY_23_10AM }],
      error: null,
    }))

    const res = await GET(makeRequest({ unit_id: 'unit-1', year_month: '2026-05' }))
    const body = await res.json()

    expect(body.nights_used).toBe(3)
  })

  // ── Cycle 4 — cross-month booking (catches monthBounds timezone bug) ───────

  it('counts only the May portion of a booking that extends into June', async () => {
    // May 29 00:00 PDT → Jun 2 00:00 PDT
    // The month boundary is June 1 00:00 PDT (not UTC midnight)
    // May nights: 29→30, 30→31, 31→Jun1  = 3 nights
    mockFrom.mockReturnValueOnce(queryChain({
      data: [{ start_datetime: MAY_29_MID, end_datetime: JUN_02_MID }],
      error: null,
    }))

    const res = await GET(makeRequest({ unit_id: 'unit-1', year_month: '2026-05' }))
    const body = await res.json()

    expect(body.nights_used).toBe(3)
  })

  // ── Cycle 5 — multiple bookings ───────────────────────────────────────────

  it('sums nights from multiple same-month bookings correctly', async () => {
    // Booking A: May 1 → May 3 PDT  = 2 nights
    // Booking B: May 10 → May 12 PDT = 2 nights
    // Total: 4 nights
    mockFrom.mockReturnValueOnce(queryChain({
      data: [
        { start_datetime: MAY_01_MID, end_datetime: MAY_03_MID },
        { start_datetime: MAY_10_MID, end_datetime: MAY_12_MID },
      ],
      error: null,
    }))

    const res = await GET(makeRequest({ unit_id: 'unit-1', year_month: '2026-05' }))
    const body = await res.json()

    expect(body.nights_used).toBe(4)
  })

  // ── Cycle 6 — DB error ────────────────────────────────────────────────────

  it('returns 500 when the database query fails', async () => {
    mockFrom.mockReturnValueOnce(queryChain({ data: null, error: { message: 'connection error' } }))

    const res = await GET(makeRequest({ unit_id: 'unit-1', year_month: '2026-05' }))

    expect(res.status).toBe(500)
  })
})
