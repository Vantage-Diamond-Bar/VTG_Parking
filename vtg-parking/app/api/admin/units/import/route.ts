import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';

export async function POST(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const units = body.units ?? body.items;

  if (!Array.isArray(units) || units.length === 0) {
    return NextResponse.json({ error: 'units array is required' }, { status: 400 });
  }

  const rows = units.map(({ address }: { address: string }) => ({
    unit_number: address,
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
