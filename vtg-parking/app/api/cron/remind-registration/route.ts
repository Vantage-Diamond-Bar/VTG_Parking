import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendRegistrationReminder } from '@/lib/email'
import {
  reminderDue,
  renewalExpiryDate,
  RENEWAL_NOTICE_DAYS,
  type ReminderKind,
} from '@/lib/utils'

export async function GET(req: NextRequest) {
  // Vercel cron sends the secret in the Authorization header, but only when
  // CRON_SECRET is set on the project.
  //
  // Fail CLOSED. This previously skipped the check entirely when CRON_SECRET
  // was unset, which left the endpoint open to the internet — and it was in
  // fact unset in production. It happened to be harmless only because the
  // query matched no rows; anyone able to reach the URL could otherwise
  // trigger a mass mailing to every resident on demand.
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cron/remind-registration] CRON_SECRET is not configured — refusing to run')
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Pull anything at or past the point where the notice window could be open,
  // with a few days of slack, then let reminderDue() make the real decision.
  // The cadence rules live in one tested pure function rather than being
  // half-expressed as a query filter.
  const windowOpensAfter = new Date(now)
  windowOpensAfter.setFullYear(windowOpensAfter.getFullYear() - 1)
  windowOpensAfter.setDate(windowOpensAfter.getDate() + RENEWAL_NOTICE_DAYS + 2)

  const { data: vehicles, error } = await supabaseAdmin
    .from('resident_vehicles')
    .select('id, owner_name, owner_email, make, model, color, license_plate, created_at, last_reminded_at, units(address)')
    .eq('opt_in_email', true)
    .eq('approval_status', 'approved')
    .not('owner_email', 'is', null)
    .lt('created_at', windowOpensAfter.toISOString())

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  type Row = NonNullable<typeof vehicles>[number]
  const due: { row: Row; kind: ReminderKind }[] = []
  for (const v of vehicles ?? []) {
    if (!v.owner_email) continue
    const kind = reminderDue(
      new Date(v.created_at),
      v.last_reminded_at ? new Date(v.last_reminded_at) : null,
      now
    )
    if (kind) due.push({ row: v, kind })
  }

  // One email per owner, however many vehicles they hold.
  const grouped: Record<string, { row: Row; kind: ReminderKind }[]> = {}
  for (const d of due) {
    const email = d.row.owner_email!
    ;(grouped[email] ??= []).push(d)
  }

  let sent = 0
  let failed = 0
  const sentIds: string[] = []

  for (const [email, items] of Object.entries(grouped)) {
    const first = items[0].row
    // An owner can hold one lapsed vehicle and one merely approaching its date.
    // The urgent one sets the tone; each vehicle still shows its own date.
    const variant: ReminderKind = items.some((i) => i.kind === 'overdue') ? 'overdue' : 'soon'

    const ok = await sendRegistrationReminder({
      ownerName: first.owner_name,
      ownerEmail: email,
      address: (first.units as any)?.address ?? '',
      variant,
      vehicles: items.map(({ row, kind }) => ({
        make: row.make ?? '',
        model: row.model ?? '',
        color: row.color ?? '',
        license_plate: row.license_plate,
        expiresAt: renewalExpiryDate(new Date(row.created_at)),
        isOverdue: kind === 'overdue',
      })),
      registeredAt: new Date(first.created_at),
    })

    if (ok) {
      sent++
      sentIds.push(...items.map((i) => i.row.id))
    } else {
      failed++
    }
  }

  // Only stamp vehicles whose email actually went out, so a Resend failure
  // means a retry next run rather than a silently skipped resident.
  if (sentIds.length > 0) {
    await supabaseAdmin
      .from('resident_vehicles')
      .update({ last_reminded_at: now.toISOString() })
      .in('id', sentIds)
  }

  return NextResponse.json({
    sent,
    failed,
    owners: Object.keys(grouped).length,
    vehiclesDue: due.length,
    soon: due.filter((d) => d.kind === 'soon').length,
    overdue: due.filter((d) => d.kind === 'overdue').length,
    scanned: vehicles?.length ?? 0,
  })
}
