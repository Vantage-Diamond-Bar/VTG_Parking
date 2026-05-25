import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { decodeVerificationToken } from '@/lib/auth';
import { normalizedPlate, ptInputToISO, PT_ZONE, countNights } from '@/lib/utils';

// ── Timezone helpers ──────────────────────────────────────────────────────────

function ptYearMonth(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PT_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  return `${y}-${m}`;
}

// All PT calendar months touched by a UTC [startISO, endISO] span
function affectedMonths(startISO: string, endISO: string): string[] {
  const months = new Set<string>();
  const cursor = new Date(startISO);
  const end = new Date(endISO);
  while (cursor <= end) {
    months.add(ptYearMonth(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return Array.from(months);
}

// Recompute visitor_monthly_quota for given unit + months from live registration data.
// Uses ptInputToISO for correct PT→UTC month boundaries, matching the booking RPC.
async function recomputeQuota(unit_id: string, months: string[]) {
  for (const yearMonth of months) {
    const [y, mo] = yearMonth.split('-').map(Number);
    const nextMo = mo === 12 ? 1 : mo + 1;
    const nextY  = mo === 12 ? y + 1 : y;
    const monthStart = ptInputToISO(`${yearMonth}-01T00:00`);
    const monthEnd   = ptInputToISO(`${String(nextY)}-${String(nextMo).padStart(2, '0')}-01T00:00`);

    const { data: regs } = await supabaseAdmin
      .from('visitor_registrations')
      .select('start_datetime, end_datetime')
      .eq('unit_id', unit_id)
      .lt('start_datetime', monthEnd)
      .gt('end_datetime', monthStart);

    let totalNights = 0;
    for (const reg of regs ?? []) {
      const s = reg.start_datetime < monthStart ? monthStart : reg.start_datetime;
      const e = reg.end_datetime   > monthEnd   ? monthEnd   : reg.end_datetime;
      totalNights += countNights(s, e);
    }

    await supabaseAdmin
      .from('visitor_monthly_quota')
      .upsert(
        { unit_id, year_month: yearMonth, nights_used: totalNights },
        { onConflict: 'unit_id,year_month' }
      );
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const unit_id = searchParams.get('unit_id');
  const token   = searchParams.get('token');

  if (!unit_id || !token) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const tokenData = decodeVerificationToken(token);
  if (!tokenData || tokenData.unit_id !== unit_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { data: reg, error: fetchErr } = await supabaseAdmin
    .from('visitor_registrations')
    .select('id, unit_id, start_datetime, end_datetime, license_plate')
    .eq('id', id)
    .eq('unit_id', unit_id)
    .single();

  if (fetchErr || !reg) return NextResponse.json({ error: 'Registration not found' }, { status: 404 });

  const nowISO   = new Date().toISOString();
  const isExpired = nowISO > reg.end_datetime;
  const isActive  = !isExpired && nowISO >= reg.start_datetime;

  if (isExpired) {
    return NextResponse.json({ error: 'Cannot edit an expired registration' }, { status: 409 });
  }

  const body = await req.json();
  const updates: Record<string, any> = {};
  const oldStart = reg.start_datetime;
  const oldEnd   = reg.end_datetime;

  if (isActive) {
    // Active: only end_datetime can be extended/shortened
    const { end_datetime } = body;
    if (!end_datetime) return NextResponse.json({ error: 'end_datetime is required' }, { status: 400 });
    if (end_datetime <= nowISO) {
      return NextResponse.json({ error: 'New checkout time must be in the future' }, { status: 400 });
    }
    if (end_datetime <= reg.start_datetime) {
      return NextResponse.json({ error: 'Checkout must be after check-in' }, { status: 400 });
    }
    updates.end_datetime = end_datetime;
  } else {
    // Upcoming: full edit
    const { visitor_name, license_plate, plate_state, make, model, color, start_datetime, end_datetime } = body;

    if (!start_datetime || !end_datetime) {
      return NextResponse.json({ error: 'start_datetime and end_datetime are required' }, { status: 400 });
    }
    if (start_datetime <= nowISO) {
      return NextResponse.json({ error: 'Start time must be in the future' }, { status: 400 });
    }
    if (end_datetime <= start_datetime) {
      return NextResponse.json({ error: 'Checkout must be after check-in' }, { status: 400 });
    }

    if (license_plate) {
      const newPlate = normalizedPlate(license_plate);
      if (newPlate !== reg.license_plate) {
        const { data: conflict } = await supabaseAdmin
          .from('resident_vehicles')
          .select('id')
          .ilike('license_plate', newPlate)
          .eq('approval_status', 'approved')
          .maybeSingle();
        if (conflict) return NextResponse.json({ error: 'plate_is_resident' }, { status: 409 });
      }
      updates.license_plate = normalizedPlate(license_plate);
    }

    if (visitor_name  !== undefined) updates.visitor_name  = visitor_name  || null;
    if (plate_state   !== undefined) updates.plate_state   = plate_state   || null;
    if (make          !== undefined) updates.make          = make          || null;
    if (model         !== undefined) updates.model         = model         || null;
    if (color         !== undefined) updates.color         = color         || null;
    updates.start_datetime = start_datetime;
    updates.end_datetime   = end_datetime;
  }

  const { error: updateErr } = await supabaseAdmin
    .from('visitor_registrations')
    .update(updates)
    .eq('id', id)
    .eq('unit_id', unit_id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Recompute quota for all months touched by old or new range
  const newStart = updates.start_datetime ?? oldStart;
  const newEnd   = updates.end_datetime;
  const months   = Array.from(new Set([
    ...affectedMonths(oldStart, oldEnd),
    ...affectedMonths(newStart, newEnd),
  ]));
  await recomputeQuota(unit_id, months);

  return NextResponse.json({ success: true });
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const unit_id = searchParams.get('unit_id');
  const token   = searchParams.get('token');

  if (!unit_id || !token) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const tokenData = decodeVerificationToken(token);
  if (!tokenData || tokenData.unit_id !== unit_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { data: reg, error: fetchErr } = await supabaseAdmin
    .from('visitor_registrations')
    .select('id, unit_id, start_datetime, end_datetime')
    .eq('id', id)
    .eq('unit_id', unit_id)
    .single();

  if (fetchErr || !reg) return NextResponse.json({ error: 'Registration not found' }, { status: 404 });

  // Block deletion once check-in time has passed
  if (new Date().toISOString() >= reg.start_datetime) {
    return NextResponse.json({ error: 'Cannot delete a registration that has already started' }, { status: 409 });
  }

  const months = affectedMonths(reg.start_datetime, reg.end_datetime);

  const { error: deleteErr } = await supabaseAdmin
    .from('visitor_registrations')
    .delete()
    .eq('id', id)
    .eq('unit_id', unit_id);

  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

  await recomputeQuota(unit_id, months);

  return NextResponse.json({ success: true });
}
