import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mock handles ──────────────────────────────────────────────────────
const { mockGetSession, mockFrom } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getSessionFromRequest: mockGetSession }))
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mockFrom } }))
vi.mock('@/lib/utils', () => ({ normalizedPlate: (p: string) => p }))

import { GET } from './route'

// ── Chain builders ────────────────────────────────────────────────────────────
// For calls ending in .maybeSingle() — returns { data } immediately when awaited
function maybeSingleChain(data: object | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data })
  const eqChain: Record<string, unknown> = { maybeSingle }
  eqChain.eq = vi.fn(() => eqChain)
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => eqChain),
      ilike: vi.fn(() => ({ eq: vi.fn(() => eqChain) })),
    })),
  }
}

// For list calls ending with .then() — thenable that resolves to { data, error: null }
function listChain(rows: object[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    then: (resolve: (v: { data: object[]; error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
    catch: (_: unknown) => chain,
  }
  for (const m of ['select', 'eq', 'not', 'gte', 'order', 'limit']) {
    chain[m] = vi.fn(() => chain)
  }
  return chain
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/patrol/lookup')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url.toString())
}

const now = new Date()
const future = new Date(now.getTime() + 86400_000).toISOString()
const past = new Date(now.getTime() - 86400_000).toISOString()

const visitorRow = {
  unit_id: 'unit-1',
  visitor_name: 'Jane Guest',
  license_plate: 'XYZ999',
  plate_state: 'CA',
  make: 'Toyota',
  model: 'Camry',
  color: 'White',
  start_datetime: past,
  end_datetime: future,
  units: { address: '100 Main St' },
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('GET /api/patrol/lookup — code search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockReturnValue({ role: 'patrol', username: 'officer1' })
  })

  it('returns 401 when session is missing', async () => {
    mockGetSession.mockReturnValue(null)

    const res = await GET(makeRequest({ code: 'ABC123' }))

    expect(res.status).toBe(401)
  })

  it('returns found=false and empty arrays when code does not match anything', async () => {
    // visitor lookup → null, vacation lookup → null (no unit_id → no unit queries)
    mockFrom.mockReturnValueOnce(maybeSingleChain(null))   // visitor_registrations
    mockFrom.mockReturnValueOnce(maybeSingleChain(null))   // vacation_parking_requests

    const res = await GET(makeRequest({ code: 'XXXXXX' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.found).toBe(false)
    expect(body.unit_vehicles).toEqual([])
    expect(body.unit_visitors).toEqual([])
  })

  it('returns found=true with the matched visitor record', async () => {
    mockFrom.mockReturnValueOnce(maybeSingleChain(visitorRow))  // visitor match
    mockFrom.mockReturnValueOnce(maybeSingleChain(null))         // no vacation match
    mockFrom.mockReturnValueOnce(listChain([]))                  // other vehicles
    mockFrom.mockReturnValueOnce(listChain([]))                  // unit visitors

    const res = await GET(makeRequest({ code: 'ABC123' }))
    const body = await res.json()

    expect(body.found).toBe(true)
    expect(body.results).toHaveLength(1)
    expect(body.results[0].type).toBe('visitor')
    expect(body.results[0].plate).toBe('XYZ999')
  })

  it('populates unit_vehicles from other resident vehicles in the same unit', async () => {
    const otherVehicle = {
      owner_name: 'John Owner',
      year: '2019',
      make: 'Honda',
      model: 'Civic',
      color: 'Blue',
      license_plate: 'DEF456',
      plate_state: 'CA',
      is_oversized: false,
      vehicle_type: null,
    }

    mockFrom.mockReturnValueOnce(maybeSingleChain(visitorRow))    // visitor match
    mockFrom.mockReturnValueOnce(maybeSingleChain(null))           // no vacation match
    mockFrom.mockReturnValueOnce(listChain([otherVehicle]))        // other vehicles in unit
    mockFrom.mockReturnValueOnce(listChain([]))                    // unit visitors

    const res = await GET(makeRequest({ code: 'ABC123' }))
    const body = await res.json()

    expect(body.unit_vehicles).toHaveLength(1)
    expect(body.unit_vehicles[0].plate).toBe('DEF456')
    expect(body.unit_vehicles[0].owner_name).toBe('John Owner')
  })

  it('populates unit_visitors from current/upcoming registrations in the same unit', async () => {
    const unitVisitor = {
      visitor_name: 'Another Guest',
      license_plate: 'GHI789',
      plate_state: 'NV',
      make: 'Ford',
      model: 'Focus',
      color: 'Red',
      start_datetime: past,
      end_datetime: future,
    }

    mockFrom.mockReturnValueOnce(maybeSingleChain(visitorRow))    // visitor match
    mockFrom.mockReturnValueOnce(maybeSingleChain(null))           // no vacation match
    mockFrom.mockReturnValueOnce(listChain([]))                    // no other vehicles
    mockFrom.mockReturnValueOnce(listChain([unitVisitor]))         // unit visitors

    const res = await GET(makeRequest({ code: 'ABC123' }))
    const body = await res.json()

    expect(body.unit_visitors).toHaveLength(1)
    expect(body.unit_visitors[0].plate).toBe('GHI789')
  })
})
