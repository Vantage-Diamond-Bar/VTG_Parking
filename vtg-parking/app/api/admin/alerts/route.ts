import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

  // Resolve unit UUIDs → readable addresses
  const allUnitIds = [...new Set((data ?? []).flatMap((row: any) => row.unit_ids ?? []))];
  let unitMap: Record<string, string> = {};
  if (allUnitIds.length > 0) {
    const { data: units } = await supabaseAdmin
      .from('units')
      .select('id, address')
      .in('id', allUnitIds);
    unitMap = Object.fromEntries((units ?? []).map((u: any) => [u.id, u.address]));
  }

  const mapped = (data ?? []).map((row: any) => ({
    id: row.id,
    license_plate: row.license_plate,
    plate_state: row.plate_state,
    month: row.year_month,
    units_involved: (row.unit_ids ?? []).map((uid: string) => unitMap[uid] ?? uid),
    count: (row.unit_ids ?? []).length,
    resolved: row.is_resolved,
    resolved_at: row.resolved_at,
    resolved_note: row.resolved_note,
    created_at: row.created_at,
  }));

  return NextResponse.json(mapped);
}
