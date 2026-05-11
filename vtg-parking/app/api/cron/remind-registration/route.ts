import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendRegistrationReminder } from '@/lib/email'

export async function GET(req: NextRequest) {
  // Vercel cron sends the secret in Authorization header
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  // Find vehicles due for a reminder:
  // registered > 1 year ago AND (never reminded OR last reminded > 1 year ago)
  const { data: vehicles, error } = await supabaseAdmin
    .from('resident_vehicles')
    .select('id, owner_name, owner_email, make, model, color, license_plate, created_at, last_reminded_at, units(address)')
    .eq('opt_in_email', true)
    .not('owner_email', 'is', null)
    .lt('created_at', oneYearAgo.toISOString())
    .or(`last_reminded_at.is.null,last_reminded_at.lt.${oneYearAgo.toISOString()}`)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Group by email so one owner with multiple vehicles gets one email
  const grouped: Record<string, typeof vehicles> = {}
  for (const v of vehicles ?? []) {
    if (!v.owner_email) continue
    if (!grouped[v.owner_email]) grouped[v.owner_email] = []
    grouped[v.owner_email]!.push(v)
  }

  let sent = 0
  let failed = 0
  const sentIds: string[] = []

  for (const [email, rows] of Object.entries(grouped)) {
    const first = rows![0]
    const ok = await sendRegistrationReminder({
      ownerName: first.owner_name,
      ownerEmail: email,
      address: (first.units as any)?.address ?? '',
      vehicles: rows!.map((r) => ({
        make: r.make ?? '',
        model: r.model ?? '',
        color: r.color ?? '',
        license_plate: r.license_plate,
      })),
      registeredAt: new Date(first.created_at),
    })

    if (ok) {
      sent++
      sentIds.push(...rows!.map((r) => r.id))
    } else {
      failed++
    }
  }

  if (sentIds.length > 0) {
    await supabaseAdmin
      .from('resident_vehicles')
      .update({ last_reminded_at: new Date().toISOString() })
      .in('id', sentIds)
  }

  return NextResponse.json({
    sent,
    failed,
    total: Object.keys(grouped).length,
    checked: vehicles?.length ?? 0,
  })
}
