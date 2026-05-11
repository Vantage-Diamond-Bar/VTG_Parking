import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sortAddresses } from '@/lib/utils';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('units')
    .select('id, address')
    .eq('active', true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(sortAddresses(data ?? []));
}
