import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionFromRequest } from '@/lib/auth';
import { sortAddresses } from '@/lib/utils';

export async function GET(_req: NextRequest) {
  // Unit addresses are non-sensitive; page is protected by admin layout
  const { data, error } = await supabaseAdmin
    .from('units')
    .select('*');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(sortAddresses(data ?? []));
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { address } = await req.json();

  const { data, error } = await supabaseAdmin
    .from('units')
    .insert({ unit_number: address, address })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, unit: data });
}
