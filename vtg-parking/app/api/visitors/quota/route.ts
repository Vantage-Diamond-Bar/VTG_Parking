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

  const { data: regs, error } = await supabaseAdmin
    .from('visitor_registrations')
    .select('start_datetime, end_datetime')
    .eq('unit_id', unit_id)
    .gte('start_datetime', start)
    .lt('start_datetime', end);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const nights_used = (regs ?? []).reduce(
    (sum, r) => sum + countNights(r.start_datetime, r.end_datetime),
    0
  );

  return NextResponse.json({
    nights_used,
    quota_limit: VISITOR_QUOTA_LIMIT,
  });
}
