import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { VISITOR_QUOTA_LIMIT, countNights, monthBounds } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const unit_id = searchParams.get('unit_id');
  const year_month = searchParams.get('year_month');

  if (!unit_id || !year_month) {
    return NextResponse.json({ error: 'unit_id and year_month are required' }, { status: 400 });
  }

  const { start, end } = monthBounds(year_month);

  // Fetch all bookings that overlap with this month (start before month ends AND end after month starts)
  const { data: regs, error } = await supabaseAdmin
    .from('visitor_registrations')
    .select('start_datetime, end_datetime')
    .eq('unit_id', unit_id)
    .lt('start_datetime', end)
    .gt('end_datetime', start);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Count only the nights that fall within this month (clamp to month boundaries)
  const nights_used = (regs ?? []).reduce((sum, r) => {
    const clampedStart = r.start_datetime > start ? r.start_datetime : start;
    const clampedEnd   = r.end_datetime   < end   ? r.end_datetime   : end;
    return sum + countNights(clampedStart, clampedEnd);
  }, 0);

  return NextResponse.json({
    nights_used,
    quota_limit: VISITOR_QUOTA_LIMIT,
  });
}
