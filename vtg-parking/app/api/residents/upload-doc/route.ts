import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { decodeVerificationToken } from '@/lib/auth';
import { REGISTRATION_DOCS_BUCKET } from '@/lib/registration-docs';

const ALLOWED_EXTENSIONS: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const { doc_base64, doc_filename, unit_id, token } = await req.json();
  if (!doc_base64 || !doc_filename || !unit_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Authorisation is conditional, because this endpoint serves the first-time
  // registration form — a resident whose unit has no vehicles yet has no email
  // on file to send an OTP to, so that path cannot present a token. Requiring
  // one unconditionally would break new registrations entirely.
  //
  // So: a unit that already has vehicles is claimed, and writing into its folder
  // requires proof of ownership. A unit with no vehicles is still open for its
  // first registration.
  const { count: existingCount, error: countError } = await supabaseAdmin
    .from('resident_vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('unit_id', unit_id);

  if (countError) {
    return NextResponse.json({ error: 'Failed to verify unit' }, { status: 500 });
  }

  if ((existingCount ?? 0) > 0) {
    const tokenData = decodeVerificationToken(token);
    if (!tokenData || tokenData.unit_id !== unit_id) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
    }
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
    .from(REGISTRATION_DOCS_BUCKET)
    .upload(path, buffer, { contentType, upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The bucket is private, so hand back the path, not a URL. The form only
  // confirms the filename; nothing previews the file before submission, so no
  // signed URL is needed here.
  return NextResponse.json({ path });
}
