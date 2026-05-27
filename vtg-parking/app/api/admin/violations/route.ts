import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const location = searchParams.get('location');
  const type = searchParams.get('type');
  const status = searchParams.get('status');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const page = parseInt(searchParams.get('page') || '0', 10);
  const offset = page * limit;

  let query = supabaseAdmin
    .from('violation_reports')
    .select('*', { count: 'exact' })
    .order('submitted_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (location) query = query.ilike('location', `%${location}%`);
  if (type) query = query.eq('violation_type', type);
  if (status) query = query.eq('status', status);
  if (from) query = query.gte('submitted_at', from);
  if (to) query = query.lte('submitted_at', to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Attach violation history (last 2 years) for each unique unit_address
  const addresses = [...new Set((data ?? []).map((v: any) => v.unit_address).filter(Boolean))]
  let historyMap: Record<string, any[]> = {}
  if (addresses.length > 0) {
    const twoYearsAgo = new Date()
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
    const { data: hist } = await supabaseAdmin
      .from('violation_reports')
      .select('id, unit_address, submitted_at, violation_type, status, resolution_type, final_license_plate, license_plate')
      .in('unit_address', addresses)
      .gte('submitted_at', twoYearsAgo.toISOString())
      .order('submitted_at', { ascending: false })
    for (const h of hist ?? []) {
      if (!historyMap[h.unit_address]) historyMap[h.unit_address] = []
      historyMap[h.unit_address].push(h)
    }
  }

  const enriched = (data ?? []).map((v: any) => ({
    ...v,
    violation_history: v.unit_address ? (historyMap[v.unit_address] ?? []) : [],
  }))

  return NextResponse.json({ data: enriched, total: count, page, limit });
}
