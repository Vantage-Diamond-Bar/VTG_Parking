import { describe, it, expect } from 'vitest'
import { monthBounds, countNights } from './utils'

// ── monthBounds ───────────────────────────────────────────────────────────────
// monthBounds must return UTC ISO strings that represent PDT/PST midnight —
// NOT bare "YYYY-MM-DDTHH:mm" strings without a timezone designator.
// A bare string is ambiguous: Node.js parses it as LOCAL time, so on a UTC
// production server (Vercel) "2026-06-01T00:00" becomes June 1 UTC midnight,
// which is May 31 17:00 PDT — one calendar day early.
describe('monthBounds', () => {
  it('start is June 1 00:00 PDT expressed as UTC ISO for "2026-06"', () => {
    // PDT (UTC-7) applies in June
    const { start } = monthBounds('2026-06')
    expect(start).toBe('2026-06-01T07:00:00.000Z')
  })

  it('end is July 1 00:00 PDT expressed as UTC ISO for "2026-06"', () => {
    const { end } = monthBounds('2026-06')
    expect(end).toBe('2026-07-01T07:00:00.000Z')
  })

  it('uses PST offset (UTC-8) for a winter month', () => {
    // PST (UTC-8) applies in January
    const { start, end } = monthBounds('2026-01')
    expect(start).toBe('2026-01-01T08:00:00.000Z')
    expect(end).toBe('2026-02-01T08:00:00.000Z')
  })

  it('handles December→January year rollover', () => {
    const { end } = monthBounds('2026-12')
    expect(end).toBe('2027-01-01T08:00:00.000Z')  // January PST
  })
})

// ── countNights ───────────────────────────────────────────────────────────────
// Uses PDT calendar dates so UTC-stored timestamps near midnight are correct.
describe('countNights', () => {
  it('counts 3 nights for a May 20–23 PDT stay', () => {
    // May 20 18:00 PDT → May 23 10:00 PDT
    // PDT dates: May 20 → May 23  → 3 nights (20→21, 21→22, 22→23)
    expect(countNights(
      '2026-05-21T01:00:00.000Z',  // May 20 18:00 PDT
      '2026-05-23T17:00:00.000Z',  // May 23 10:00 PDT
    )).toBe(3)
  })

  it('counts 1 night for a single overnight stay', () => {
    // May 15 22:00 PDT → May 16 08:00 PDT
    expect(countNights(
      '2026-05-16T05:00:00.000Z',  // May 15 22:00 PDT
      '2026-05-16T15:00:00.000Z',  // May 16 08:00 PDT
    )).toBe(1)
  })

  it('returns 0 for a same-day (no overnight) stay', () => {
    // May 15 08:00 PDT → May 15 20:00 PDT — arrived and left same calendar day
    expect(countNights(
      '2026-05-15T15:00:00.000Z',  // May 15 08:00 PDT
      '2026-05-16T03:00:00.000Z',  // May 15 20:00 PDT
    )).toBe(0)
  })

  it('counts nights crossing a PDT midnight boundary correctly', () => {
    // May 31 23:30 PDT → June 1 00:30 PDT — spans midnight, still 1 night
    expect(countNights(
      '2026-06-01T06:30:00.000Z',  // May 31 23:30 PDT
      '2026-06-01T07:30:00.000Z',  // Jun 1  00:30 PDT
    )).toBe(1)
  })

  it('returns 0 for empty / invalid inputs', () => {
    expect(countNights('', '')).toBe(0)
    expect(countNights('not-a-date', '2026-05-01T00:00:00Z')).toBe(0)
  })
})
