import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { doc_base64, doc_filename, unit_id } = await req.json();
  if (!doc_base64 || !doc_filename || !unit_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const ext = doc_filename.split('.').pop()?.toLowerCase() ?? 'bin';
  const buffer = Buffer.from(doc_base64, 'base64');
  const path = `${unit_id}/temp_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from('registration-docs')
    .upload(path, buffer, { contentType: 'application/octet-stream', upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const url = supabaseAdmin.storage.from('registration-docs').getPublicUrl(path).data.publicUrl;
  return NextResponse.json({ url });
}
