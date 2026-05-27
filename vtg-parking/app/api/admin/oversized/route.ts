import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const page = parseInt(searchParams.get('page') || '0', 10);
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = page * limit;

  let query = supabaseAdmin
    .from('resident_vehicles')
    .select('*, units(address)', { count: 'exact' })
    .eq('is_oversized', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && status !== 'all') {
    query = query.eq('approval_status', status);
  }

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Map approval_status → status for frontend compatibility
  const mapped = (data ?? []).map((row) => ({ ...row, status: row.approval_status }));

  return NextResponse.json({ data: mapped, total: count, page, limit });
}
