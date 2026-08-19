import { describe, it, expect } from 'vitest'
import { monthBounds, countNights, reminderDue, daysUntilRenewal } from './utils'

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

// ─── Registration renewal reminder cadence ───────────────────────────────────
// This drives the only code path that emails every resident, so the boundaries
// are pinned down here rather than discovered in production.
describe('reminderDue', () => {
  // Registration created 2025-06-01 12:00 PT → expires 2026-06-01.
  const created = new Date('2025-06-01T19:00:00Z')
  const at = (iso: string) => new Date(iso)

  describe('before the notice window opens', () => {
    it('says nothing 31 days out', () => {
      expect(reminderDue(created, null, at('2026-05-01T19:00:00Z'))).toBeNull()
    })
    it('says nothing months out', () => {
      expect(reminderDue(created, null, at('2026-01-01T19:00:00Z'))).toBeNull()
    })
  })

  describe('inside the 30-day notice window', () => {
    it('fires exactly 30 days out', () => {
      expect(reminderDue(created, null, at('2026-05-02T19:00:00Z'))).toBe('soon')
    })
    it('fires a week out', () => {
      expect(reminderDue(created, null, at('2026-05-25T19:00:00Z'))).toBe('soon')
    })
    it('still says "soon" on the expiry date itself', () => {
      expect(reminderDue(created, null, at('2026-06-01T19:00:00Z'))).toBe('soon')
    })
  })

  describe('after expiry', () => {
    it('switches to overdue the day after', () => {
      expect(reminderDue(created, null, at('2026-06-02T19:00:00Z'))).toBe('overdue')
    })
    it('stays overdue long after', () => {
      expect(reminderDue(created, null, at('2026-12-01T19:00:00Z'))).toBe('overdue')
    })
  })

  describe('respects the send interval', () => {
    it('holds off 6 days after a "soon" reminder', () => {
      const last = at('2026-05-20T19:00:00Z')
      expect(reminderDue(created, last, at('2026-05-26T19:00:00Z'))).toBeNull()
    })
    it('sends again 7 days after a "soon" reminder', () => {
      const last = at('2026-05-20T19:00:00Z')
      expect(reminderDue(created, last, at('2026-05-27T19:00:00Z'))).toBe('soon')
    })
    it('holds off 29 days after an "overdue" reminder', () => {
      const last = at('2026-06-10T19:00:00Z')
      expect(reminderDue(created, last, at('2026-07-09T19:00:00Z'))).toBeNull()
    })
    it('sends again 30 days after an "overdue" reminder', () => {
      const last = at('2026-06-10T19:00:00Z')
      expect(reminderDue(created, last, at('2026-07-10T19:00:00Z'))).toBe('overdue')
    })
  })

  // The old implementation gated on "last reminded over a year ago", so a
  // resident who got one notice went silent for a full year afterwards.
  it('does not go silent for a year after a single reminder', () => {
    const last = at('2026-06-02T19:00:00Z')
    expect(reminderDue(created, last, at('2026-07-05T19:00:00Z'))).toBe('overdue')
  })

  it('never re-sends on the same day', () => {
    const now = at('2026-06-15T19:00:00Z')
    expect(reminderDue(created, now, now)).toBeNull()
  })
})

describe('daysUntilRenewal', () => {
  const created = new Date('2025-06-01T19:00:00Z')

  it('counts whole days down to expiry', () => {
    expect(daysUntilRenewal(created, new Date('2026-05-25T19:00:00Z'))).toBe(7)
  })

  it('is 0 on the expiry date', () => {
    expect(daysUntilRenewal(created, new Date('2026-06-01T19:00:00Z'))).toBe(0)
  })

  it('goes negative past expiry', () => {
    expect(daysUntilRenewal(created, new Date('2026-06-11T19:00:00Z'))).toBe(-10)
  })

  // Counted on Pacific calendar dates, so the hour of day cannot shift the
  // result by one — otherwise a registration created late at night would be
  // reminded a day off from one created in the morning.
  it('ignores the time of day', () => {
    const early = daysUntilRenewal(created, new Date('2026-05-25T08:00:00Z'))
    const late  = new Date('2026-05-25T23:59:00Z')
    expect(daysUntilRenewal(created, late)).toBe(early)
  })
})
