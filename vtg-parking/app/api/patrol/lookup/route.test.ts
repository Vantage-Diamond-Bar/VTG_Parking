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

// Flat chain ending in .maybeSingle() — supports any sequence of filter methods
function maybeSingleChain(data: object | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = { maybeSingle }
  for (const m of ['select', 'eq', 'or', 'not', 'gte', 'order', 'limit', 'neq', 'ilike']) {
    chain[m] = vi.fn(() => chain)
  }
  return chain
}

// Flat chain for list queries — thenable resolving to { data, error: null }
function listChain(rows: object[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    then: (resolve: (v: { data: object[]; error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
    catch: (_: unknown) => chain,
  }
  for (const m of ['select', 'eq', 'not', 'gte', 'order', 'limit', 'ilike', 'or']) {
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
  access_code: 'ABC123',
  units: { address: '100 Main St' },
}

// ── Tests ─────────────────────────────────────────────────────────────────────
// Code-search from() call order:
//   1. visitor_registrations     — .eq('access_code').maybeSingle()
//   2. vacation_parking_requests — .eq('access_code').eq('status').maybeSingle()
//   3. resident_vehicles         — .ilike('license_plate').or().maybeSingle()  (resident by matched plate)
//   4. resident_vehicles         — fetchUnitContext vehicles (list)
//   5. vacation_parking_requests — fetchUnitContext vacations (list)
//   6. visitor_registrations     — fetchUnitContext visitors (list)

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
    mockFrom.mockReturnValueOnce(maybeSingleChain(visitorRow))  // 1: visitor match
    mockFrom.mockReturnValueOnce(maybeSingleChain(null))         // 2: no vacation match
    mockFrom.mockReturnValueOnce(maybeSingleChain(null))         // 3: resident by plate → not found
    mockFrom.mockReturnValueOnce(listChain([]))                  // 4: unit vehicles
    mockFrom.mockReturnValueOnce(listChain([]))                  // 5: unit vacations
    mockFrom.mockReturnValueOnce(listChain([]))                  // 6: unit visitors

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

    mockFrom.mockReturnValueOnce(maybeSingleChain(visitorRow))    // 1: visitor match
    mockFrom.mockReturnValueOnce(maybeSingleChain(null))           // 2: no vacation match
    mockFrom.mockReturnValueOnce(maybeSingleChain(null))           // 3: resident by plate → not found
    mockFrom.mockReturnValueOnce(listChain([otherVehicle]))        // 4: unit vehicles
    mockFrom.mockReturnValueOnce(listChain([]))                    // 5: unit vacations
    mockFrom.mockReturnValueOnce(listChain([]))                    // 6: unit visitors

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
      access_code: 'ZZZ999',
    }

    mockFrom.mockReturnValueOnce(maybeSingleChain(visitorRow))    // 1: visitor match
    mockFrom.mockReturnValueOnce(maybeSingleChain(null))           // 2: no vacation match
    mockFrom.mockReturnValueOnce(maybeSingleChain(null))           // 3: resident by plate → not found
    mockFrom.mockReturnValueOnce(listChain([]))                    // 4: unit vehicles
    mockFrom.mockReturnValueOnce(listChain([]))                    // 5: unit vacations
    mockFrom.mockReturnValueOnce(listChain([unitVisitor]))         // 6: unit visitors

    const res = await GET(makeRequest({ code: 'ABC123' }))
    const body = await res.json()

    expect(body.unit_visitors).toHaveLength(1)
    expect(body.unit_visitors[0].plate).toBe('GHI789')
  })

  it('excludes matched visitor from unit_visitors to prevent duplication', async () => {
    const otherVisitor = {
      visitor_name: 'Other Guest',
      license_plate: 'DEF456',
      plate_state: 'NV',
      make: 'Ford',
      model: 'Focus',
      color: 'Red',
      start_datetime: past,
      end_datetime: future,
      access_code: 'ZZZ999',
    }

    mockFrom.mockReturnValueOnce(maybeSingleChain(visitorRow))                       // 1: visitor match
    mockFrom.mockReturnValueOnce(maybeSingleChain(null))                              // 2: no vacation match
    mockFrom.mockReturnValueOnce(maybeSingleChain(null))                              // 3: resident by plate
    mockFrom.mockReturnValueOnce(listChain([]))                                       // 4: unit vehicles
    mockFrom.mockReturnValueOnce(listChain([]))                                       // 5: unit vacations
    mockFrom.mockReturnValueOnce(listChain([visitorRow, otherVisitor]))               // 6: unit visitors (both)

    const res = await GET(makeRequest({ code: 'ABC123' }))
    const body = await res.json()

    expect(body.results).toHaveLength(1)
    expect(body.results[0].access_code).toBe('ABC123')
    // matched visitor must NOT appear again in the unit context list
    expect(body.unit_visitors).toHaveLength(1)
    expect(body.unit_visitors[0].access_code).toBe('ZZZ999')
  })
})
