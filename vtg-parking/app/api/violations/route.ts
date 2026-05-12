import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { sendViolationReport } from '@/lib/email';

export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const location = formData.get('location') as string;
  const violation_type = formData.get('violation_type') as string;
  const license_plate = formData.get('license_plate') as string | null;
  const description = formData.get('description') as string | null;
  const reporter_email = formData.get('reporter_email') as string | null;
  const photoFiles = formData.getAll('photos') as File[];

  const photo_urls: string[] = [];

  for (let i = 0; i < Math.min(photoFiles.length, 5); i++) {
    const file = photoFiles[i];

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: `Photo ${i + 1} exceeds 5MB limit` }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: `Photo ${i + 1} is not a valid image` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const path = `${Date.now()}-${i}.jpg`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('violation-photos')
      .upload(path, buffer, { contentType: file.type });

    if (!uploadError) {
      const publicUrl = supabaseAdmin.storage
        .from('violation-photos')
        .getPublicUrl(path).data.publicUrl;
      photo_urls.push(publicUrl);
    }
  }

  const { data: report, error: insertError } = await supabaseAdmin
    .from('violation_reports')
    .insert({
      location,
      violation_type,
      license_plate: license_plate || null,
      description: description || null,
      reporter_email: reporter_email || null,
      photo_urls,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Best-effort email — never fail the request if email delivery fails
  try {
    await sendViolationReport({
      location,
      violation_type,
      license_plate: license_plate ?? undefined,
      description: description ?? undefined,
      reporter_email: reporter_email ?? undefined,
      photo_urls,
      submitted_at: new Date().toISOString(),
    });
  } catch {}

  return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
