import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdmin, decodeVerificationToken } from '@/lib/auth';
import { signRegistrationDoc } from '@/lib/registration-docs';

/**
 * Mints a short-lived signed URL for one vehicle's registration document.
 *
 * The registration-docs bucket is private, so this is the only way a browser
 * can read a document. Two callers, two credentials:
 *   - admins       — session cookie, may view any unit's document
 *   - residents    — OTP verification token, may view only their own unit's
 *
 * POST rather than GET so the verification token stays out of the URL (and out
 * of logs and Referer headers), and so no caching layer can hold the response.
 */
export async function POST(req: NextRequest) {
  const { vehicle_id, unit_id, token } = await req.json();

  if (!vehicle_id) {
    return NextResponse.json({ error: 'vehicle_id is required' }, { status: 400 });
  }

  const { data: vehicle } = await supabaseAdmin
    .from('resident_vehicles')
    .select('unit_id, registration_doc_path')
    .eq('id', vehicle_id)
    .maybeSingle();

  if (!vehicle?.registration_doc_path) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const admin = await requireAdmin(req);
  if (!admin) {
    const tokenData = decodeVerificationToken(token);
    // Both halves matter. Checking only that the token matches unit_id would let
    // a resident pass someone else's vehicle_id alongside their own unit_id and
    // read that vehicle's document; checking only the vehicle's unit would let
    // any token holder read any unit's.
    if (!tokenData || tokenData.unit_id !== unit_id || vehicle.unit_id !== unit_id) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
    }
  }

  const url = await signRegistrationDoc(vehicle.registration_doc_path);
  if (!url) {
    return NextResponse.json({ error: 'sign_failed' }, { status: 500 });
  }

  return NextResponse.json({ url });
}
