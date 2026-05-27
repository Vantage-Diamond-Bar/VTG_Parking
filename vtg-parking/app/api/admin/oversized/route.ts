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

  // 'rejected' tab → vehicles whose oversized permit was denied (converted to regular)
  // 'pending'  tab → is_oversized=true, approval_status=pending
  // 'approved' tab → is_oversized=true, approval_status=approved (and NOT rejected)
  // 'all'      tab → pending + approved + rejected history
  let query = supabaseAdmin
    .from('resident_vehicles')
    .select('*, units(address)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status === 'rejected') {
    // Rejected history: oversized_rejected_at is set (is_oversized was flipped to false)
    query = query.not('oversized_rejected_at', 'is', null);
  } else if (status === 'pending') {
    query = query.eq('is_oversized', true).eq('approval_status', 'pending');
  } else if (status === 'approved') {
    query = query.eq('is_oversized', true).eq('approval_status', 'approved').is('oversized_rejected_at', null);
  } else {
    // all: either currently oversized OR has rejection history
    query = query.or('is_oversized.eq.true,not.oversized_rejected_at.is.null');
  }

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Map to a unified status for frontend:
  // - pending/approved is_oversized rows → use approval_status
  // - rejected history rows → status = 'rejected'
  const mapped = (data ?? []).map((row) => ({
    ...row,
    status: row.oversized_rejected_at ? 'rejected' : row.approval_status,
  }));

  return NextResponse.json({ data: mapped, total: count, page, limit });
}
