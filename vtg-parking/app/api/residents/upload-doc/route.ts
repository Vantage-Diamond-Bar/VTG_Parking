import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const ALLOWED_EXTENSIONS: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const { doc_base64, doc_filename, unit_id } = await req.json();
  if (!doc_base64 || !doc_filename || !unit_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const ext = doc_filename.split('.').pop()?.toLowerCase() ?? '';
  const contentType = ALLOWED_EXTENSIONS[ext];
  if (!contentType) {
    return NextResponse.json({ error: 'Invalid file type. Allowed: PDF, JPG, PNG, WEBP' }, { status: 400 });
  }

  const buffer = Buffer.from(doc_base64, 'base64');
  if (buffer.length > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large. Maximum size is 10 MB' }, { status: 400 });
  }

  const path = `${unit_id}/temp_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from('registration-docs')
    .upload(path, buffer, { contentType, upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const url = supabaseAdmin.storage.from('registration-docs').getPublicUrl(path).data.publicUrl;
  return NextResponse.json({ url });
}
