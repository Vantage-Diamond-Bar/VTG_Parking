import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getSession();
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

  return NextResponse.json(data);
}
