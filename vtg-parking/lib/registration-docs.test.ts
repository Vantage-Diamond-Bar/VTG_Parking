import { describe, it, expect, vi } from 'vitest'

// signRegistrationDoc pulls in the service-role client at import time; these
// tests only cover the pure path check, so stub the module out.
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { storage: { from: () => ({}) } } }))

import { isPathOwnedByUnit } from './registration-docs'

const UNIT = '11111111-2222-3333-4444-555555555555'
const OTHER = '99999999-8888-7777-6666-555555555555'

describe('isPathOwnedByUnit', () => {
  it('accepts a path directly under the unit folder', () => {
    expect(isPathOwnedByUnit(`${UNIT}/ABC123.pdf`, UNIT)).toBe(true)
    expect(isPathOwnedByUnit(`${UNIT}/temp_1234_abc.png`, UNIT)).toBe(true)
  })

  // The whole point: POST /api/residents takes this path from the client, and
  // documents are read back through an endpoint that authorises by the vehicle's
  // unit. Without this check a registrant could point their own vehicle row at
  // another unit's document and read it legitimately.
  it("rejects another unit's folder", () => {
    expect(isPathOwnedByUnit(`${OTHER}/ABC123.pdf`, UNIT)).toBe(false)
  })

  it('rejects traversal out of the unit folder', () => {
    expect(isPathOwnedByUnit(`${UNIT}/../${OTHER}/ABC123.pdf`, UNIT)).toBe(false)
  })

  it('rejects a bare filename with no unit prefix', () => {
    expect(isPathOwnedByUnit('ABC123.pdf', UNIT)).toBe(false)
  })

  // A unit id that merely prefixes another must not pass as a folder match.
  it('requires a full path segment, not a string prefix', () => {
    expect(isPathOwnedByUnit(`${UNIT}-extra/ABC123.pdf`, UNIT)).toBe(false)
  })

  it('rejects empty inputs', () => {
    expect(isPathOwnedByUnit('', UNIT)).toBe(false)
    expect(isPathOwnedByUnit(`${UNIT}/ABC123.pdf`, '')).toBe(false)
  })
})
