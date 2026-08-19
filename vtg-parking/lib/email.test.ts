import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockSend }
  },
}))
vi.mock('./supabase', () => ({ supabaseAdmin: {} }))

import { sendRegistrationReminder } from './email'

const vehicles = [
  {
    make: 'Toyota', model: 'Camry', color: 'Silver', license_plate: 'ABC1234',
    expiresAt: new Date('2026-09-10T19:00:00Z'), isOverdue: false,
  },
  {
    make: 'Honda', model: 'CR-V', color: 'Blue', license_plate: 'XYZ7890',
    expiresAt: new Date('2026-06-01T19:00:00Z'), isOverdue: true,
  },
]

async function render(variant: 'soon' | 'overdue') {
  mockSend.mockClear()
  mockSend.mockResolvedValue({ id: 'stub' })
  await sendRegistrationReminder({
    ownerName: 'Test Owner',
    ownerEmail: 'owner@example.com',
    address: '860 Sunset Pl',
    vehicles,
    registeredAt: new Date('2025-06-01T19:00:00Z'),
    variant,
  })
  return mockSend.mock.calls[0][0] as { subject: string; html: string; to: string }
}

describe('sendRegistrationReminder', () => {
  beforeEach(() => vi.clearAllMocks())

  it('leaves no unsubstituted template placeholders', async () => {
    for (const variant of ['soon', 'overdue'] as const) {
      const { html } = await render(variant)
      expect(html, `${variant} variant`).not.toMatch(/\$\{/)
    }
  })

  it('uses a "due soon" subject and lead for the pre-expiry variant', async () => {
    const { subject, html } = await render('soon')
    expect(subject).toMatch(/due soon/i)
    expect(html).toMatch(/coming up for its annual renewal/i)
    expect(html).not.toMatch(/over one year since your last registration update/i)
  })

  it('uses an "overdue" subject and lead once expired', async () => {
    const { subject, html } = await render('overdue')
    expect(subject).toMatch(/overdue/i)
    expect(html).toMatch(/over one year since your last registration update/i)
  })

  // An owner can hold one lapsed vehicle and one still inside its notice
  // window, so a single date at the top of the mail would be wrong for at
  // least one of them.
  it('shows each vehicle its own due date and status', async () => {
    const { html } = await render('overdue')
    expect(html).toMatch(/ABC1234<\/strong>[\s\S]*?due September 10, 2026/)
    expect(html).toMatch(/XYZ7890<\/strong>[\s\S]*?expired June 1, 2026/)
  })

  it('warns that a lapsed registration blocks visitor and vacation requests', async () => {
    for (const variant of ['soon', 'overdue'] as const) {
      const { html } = await render(variant)
      expect(html, `${variant} variant`).toMatch(/Visitor Parking or Vacation Parking/i)
    }
  })

  it('reports failure instead of throwing when the mail provider errors', async () => {
    mockSend.mockRejectedValue(new Error('provider down'))
    const ok = await sendRegistrationReminder({
      ownerName: 'Test Owner',
      ownerEmail: 'owner@example.com',
      address: '860 Sunset Pl',
      vehicles,
      registeredAt: new Date('2025-06-01T19:00:00Z'),
      variant: 'soon',
    })
    expect(ok).toBe(false)
  })
})
