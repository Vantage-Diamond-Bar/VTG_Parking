import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const resolved = searchParams.get('resolved') || 'all';

  let query = supabaseAdmin
    .from('abuse_alerts')
    .select('*')
    .order('created_at', { ascending: false });

  if (resolved === 'true') {
    query = query.eq('is_resolved', true);
  } else if (resolved === 'false') {
    query = query.eq('is_resolved', false);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mapped = (data ?? []).map((row: any) => ({
    id: row.id,
    license_plate: row.license_plate,
    month: row.year_month,
    units_involved: row.unit_ids ?? [],
    count: (row.unit_ids ?? []).length,
    resolved: row.is_resolved,
    created_at: row.created_at,
  }));

  return NextResponse.json(mapped);
}
