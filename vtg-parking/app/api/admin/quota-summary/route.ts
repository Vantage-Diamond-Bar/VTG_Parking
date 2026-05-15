import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSessionFromRequest } from '@/lib/auth'
import { countNights, monthBounds, VISITOR_QUOTA_LIMIT } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const search = new URL(req.url).searchParams.get('search') || ''

  const { data: regs, error: regsError } = await supabaseAdmin
    .from('visitor_registrations')
    .select('id, unit_id, start_datetime, end_datetime, license_plate, plate_state, visitor_name, make, model, color, visitor_phone, access_code')
    .order('start_datetime', { ascending: false })

  if (regsError) return NextResponse.json({ error: regsError.message }, { status: 500 })

  const { data: units } = await supabaseAdmin
    .from('units')
    .select('id, address')

  const unitAddressMap: Record<string, string> = {}
  for (const u of units ?? []) unitAddressMap[u.id] = u.address

  // ── Group by unit ────────────────────────────────────────────────────────────
  type MonthEntry = { year_month: string; nights_used: number; count: number; limit: number }
  type UnitEntry = {
    unit_id: string
    address: string
    total_nights: number
    months: Record<string, MonthEntry>
    registrations: Array<{
      id: string; start_datetime: string; end_datetime: string
      license_plate: string; plate_state: string; visitor_name: string
      make: string; model: string; color: string; visitor_phone: string
      access_code: string; nights: number
    }>
  }

  const unitMap: Record<string, UnitEntry> = {}

  for (const reg of regs ?? []) {
    if (!reg.unit_id) continue
    if (!unitMap[reg.unit_id]) {
      unitMap[reg.unit_id] = {
        unit_id: reg.unit_id,
        address: unitAddressMap[reg.unit_id] ?? 'Unknown',
        total_nights: 0,
        months: {},
        registrations: [],
      }
    }
    const entry = unitMap[reg.unit_id]
    const totalNights = countNights(reg.start_datetime, reg.end_datetime)

    // Distribute nights across each month the booking spans
    const startYm = (reg.start_datetime ?? '').slice(0, 7)
    const endYm = (reg.end_datetime ?? '').slice(0, 7)
    let ym = startYm
    while (ym && ym <= endYm) {
      const { start: ms, end: me } = monthBounds(ym)
      const cs = reg.start_datetime > ms ? reg.start_datetime : ms
      const ce = reg.end_datetime < me ? reg.end_datetime : me
      const monthNights = countNights(cs, ce)
      if (monthNights > 0) {
        if (!entry.months[ym]) {
          entry.months[ym] = { year_month: ym, nights_used: 0, count: 0, limit: VISITOR_QUOTA_LIMIT }
        }
        entry.months[ym].nights_used += monthNights
        if (ym === startYm) entry.months[ym].count++
      }
      const [y, mo] = ym.split('-').map(Number)
      ym = `${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}`
    }

    entry.total_nights += totalNights
    entry.registrations.push({
      id: reg.id,
      start_datetime: reg.start_datetime,
      end_datetime: reg.end_datetime,
      license_plate: reg.license_plate ?? '',
      plate_state: reg.plate_state ?? '',
      visitor_name: reg.visitor_name ?? '',
      make: reg.make ?? '',
      model: reg.model ?? '',
      color: reg.color ?? '',
      visitor_phone: reg.visitor_phone ?? '',
      access_code: reg.access_code ?? '',
      nights: totalNights,
    })
  }

  let result = Object.values(unitMap).map((u) => ({
    ...u,
    months: Object.values(u.months).sort((a, b) => b.year_month.localeCompare(a.year_month)),
  })).sort((a, b) => b.total_nights - a.total_nights)

  if (!search) {
    for (const u of units ?? []) {
      if (!unitMap[u.id]) {
        result.push({ unit_id: u.id, address: u.address, total_nights: 0, months: [], registrations: [] })
      }
    }
  }

  if (search) {
    const q = search.toLowerCase()
    result = result.filter((u) =>
      u.address.toLowerCase().includes(q) ||
      u.registrations.some(
        (r) =>
          r.license_plate.toLowerCase().includes(q) ||
          r.visitor_name.toLowerCase().includes(q) ||
          r.make.toLowerCase().includes(q) ||
          r.model.toLowerCase().includes(q)
      )
    )
  }

  // ── Group by vehicle (license_plate + plate_state) ───────────────────────────
  type VehicleMonthEntry = { year_month: string; nights_used: number; count: number }
  type VehicleEntry = {
    license_plate: string
    plate_state: string
    make: string
    model: string
    color: string
    total_nights: number
    monthsMap: Record<string, VehicleMonthEntry>
    registrations: Array<{
      unit_id: string
      address: string
      start_datetime: string
      end_datetime: string
      nights: number
      visitor_name: string
    }>
  }

  const vehicleMap: Record<string, VehicleEntry> = {}

  for (const reg of regs ?? []) {
    const key = `${reg.license_plate ?? ''}|${reg.plate_state ?? ''}`
    if (!vehicleMap[key]) {
      vehicleMap[key] = {
        license_plate: reg.license_plate ?? '',
        plate_state: reg.plate_state ?? '',
        make: reg.make ?? '',
        model: reg.model ?? '',
        color: reg.color ?? '',
        total_nights: 0,
        monthsMap: {},
        registrations: [],
      }
    }
    const ve = vehicleMap[key]
    const totalNights = countNights(reg.start_datetime, reg.end_datetime)

    // Distribute nights across each month the booking spans
    const vStartYm = (reg.start_datetime ?? '').slice(0, 7)
    const vEndYm = (reg.end_datetime ?? '').slice(0, 7)
    let vYm = vStartYm
    while (vYm && vYm <= vEndYm) {
      const { start: ms, end: me } = monthBounds(vYm)
      const cs = reg.start_datetime > ms ? reg.start_datetime : ms
      const ce = reg.end_datetime < me ? reg.end_datetime : me
      const monthNights = countNights(cs, ce)
      if (monthNights > 0) {
        if (!ve.monthsMap[vYm]) ve.monthsMap[vYm] = { year_month: vYm, nights_used: 0, count: 0 }
        ve.monthsMap[vYm].nights_used += monthNights
        if (vYm === vStartYm) ve.monthsMap[vYm].count++
      }
      const [vy, vmo] = vYm.split('-').map(Number)
      vYm = `${vmo === 12 ? vy + 1 : vy}-${String(vmo === 12 ? 1 : vmo + 1).padStart(2, '0')}`
    }

    ve.total_nights += totalNights
    ve.registrations.push({
      unit_id: reg.unit_id,
      address: unitAddressMap[reg.unit_id] ?? 'Unknown',
      start_datetime: reg.start_datetime,
      end_datetime: reg.end_datetime,
      nights: totalNights,
      visitor_name: reg.visitor_name ?? '',
    })
  }

  let vehicles = Object.values(vehicleMap).map((ve) => ({
    license_plate: ve.license_plate,
    plate_state: ve.plate_state,
    make: ve.make,
    model: ve.model,
    color: ve.color,
    total_nights: ve.total_nights,
    months: Object.values(ve.monthsMap).sort((a, b) => a.year_month.localeCompare(b.year_month)),
    registrations: ve.registrations.sort((a, b) => b.start_datetime.localeCompare(a.start_datetime)),
  })).sort((a, b) => b.total_nights - a.total_nights)

  if (search) {
    const q = search.toLowerCase()
    vehicles = vehicles.filter((v) =>
      v.license_plate.toLowerCase().includes(q) ||
      v.make.toLowerCase().includes(q) ||
      v.model.toLowerCase().includes(q) ||
      v.color.toLowerCase().includes(q) ||
      v.registrations.some(
        (r) => r.address.toLowerCase().includes(q) || r.visitor_name.toLowerCase().includes(q)
      )
    )
  }

  return NextResponse.json({ data: result, vehicles, total: result.length })
}
