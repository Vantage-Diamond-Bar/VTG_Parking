export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { maskEmail } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const unit_id = searchParams.get('unit_id');

  if (!unit_id) {
    return NextResponse.json({ error: 'unit_id is required' }, { status: 400 });
  }

  const { data: vehicles, error } = await supabaseAdmin
    .from('resident_vehicles')
    .select('owner_email')
    .eq('unit_id', unit_id);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch unit data' }, { status: 500 });
  }

  if (!vehicles || vehicles.length === 0) {
    return NextResponse.json({ has_vehicles: false });
  }

  const uniqueEmails = [...new Set(vehicles.map((v) => v.owner_email).filter(Boolean))];
  const email_hints = uniqueEmails.map((email) => maskEmail(email));

  return NextResponse.json({ has_vehicles: true, email_hints });
}
