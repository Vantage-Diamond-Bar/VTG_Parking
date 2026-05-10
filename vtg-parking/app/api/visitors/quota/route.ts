import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { VISITOR_QUOTA_LIMIT } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const unit_id = searchParams.get('unit_id');
  const year_month = searchParams.get('year_month');

  if (!unit_id || !year_month) {
    return NextResponse.json({ error: 'unit_id and year_month are required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('visitor_monthly_quota')
    .select('nights_used')
    .eq('unit_id', unit_id)
    .eq('year_month', year_month)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    nights_used: data?.nights_used ?? 0,
    quota_limit: VISITOR_QUOTA_LIMIT,
  });
}
