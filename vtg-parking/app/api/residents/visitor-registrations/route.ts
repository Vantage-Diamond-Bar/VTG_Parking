import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { decodeVerificationToken } from '@/lib/auth';
import { ptInputToISO, PT_ZONE } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function ptMonthStart(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PT_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  return ptInputToISO(`${y}-${m}-01T00:00`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const unit_id = searchParams.get('unit_id');
  const token = searchParams.get('token');

  if (!unit_id || !token) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const tokenData = decodeVerificationToken(token);
  if (!tokenData || tokenData.unit_id !== unit_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const monthStart = ptMonthStart();

  const { data, error } = await supabaseAdmin
    .from('visitor_registrations')
    .select('id, access_code, visitor_name, visitor_phone, visitor_phone_country_code, license_plate, plate_state, make, model, color, start_datetime, end_datetime, created_at')
    .eq('unit_id', unit_id)
    .gte('end_datetime', monthStart)
    .order('start_datetime', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const nowISO = new Date().toISOString();
  const registrations = (data ?? []).map((r) => ({
    ...r,
    status:
      nowISO > r.end_datetime ? 'expired'
      : nowISO >= r.start_datetime ? 'active'
      : 'upcoming',
  }));

  return NextResponse.json({ registrations });
}
