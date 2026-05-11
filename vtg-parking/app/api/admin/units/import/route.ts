import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionFromRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const units = body.units ?? body.items;

  if (!Array.isArray(units) || units.length === 0) {
    return NextResponse.json({ error: 'units array is required' }, { status: 400 });
  }

  const rows = units.map(({ unit_number, address }: { unit_number: string; address: string }) => ({
    unit_number,
    address,
  }));

  const { data, error } = await supabaseAdmin
    .from('units')
    .upsert(rows, { onConflict: 'unit_number' })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ imported: data?.length ?? 0 });
}
