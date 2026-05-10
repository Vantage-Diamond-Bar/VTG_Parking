import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { getYearMonth } from '@/lib/utils';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const year_month = getYearMonth();
  const monthStart = `${year_month}-01`;

  const [residentsResult, visitorsResult, violationsResult] = await Promise.all([
    supabaseAdmin
      .from('resident_vehicles')
      .select('id', { count: 'exact', head: true }),
    supabaseAdmin
      .from('visitor_registrations')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart),
    supabaseAdmin
      .from('violation_reports')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart),
  ]);

  return NextResponse.json({
    total_residents: residentsResult.count ?? 0,
    visitors_this_month: visitorsResult.count ?? 0,
    violations_this_month: violationsResult.count ?? 0,
  });
}
