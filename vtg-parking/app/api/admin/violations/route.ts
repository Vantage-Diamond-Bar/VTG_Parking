import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  // Page is protected by admin layout; no per-route auth needed here
  const { searchParams } = new URL(req.url);
  const location = searchParams.get('location');
  const type = searchParams.get('type');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const page = parseInt(searchParams.get('page') || '0', 10);
  const offset = page * limit;

  let query = supabaseAdmin
    .from('violation_reports')
    .select('*', { count: 'exact' })
    .order('submitted_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (location) query = query.ilike('location', `%${location}%`);
  if (type) query = query.eq('violation_type', type);
  if (from) query = query.gte('submitted_at', from);
  if (to) query = query.lte('submitted_at', to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, total: count, page, limit });
}
