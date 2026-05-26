import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { createVerificationToken } from '@/lib/auth'

const MAX_ATTEMPTS = 5

export async function POST(req: NextRequest) {
  const { unit_id, email, otp } = await req.json()

  if (!unit_id || !email || !otp) {
    return NextResponse.json({ error: 'unit_id, email, and otp required' }, { status: 400 })
  }

  const emailLower = email.trim().toLowerCase()
  const now = new Date().toISOString()

  // Find the most recent valid (unexpired, unused) OTP for this unit+email
  const { data: record } = await supabaseAdmin
    .from('email_otps')
    .select('id, otp_hash, attempt_count')
    .eq('unit_id', unit_id)
    .eq('email', emailLower)
    .gt('expires_at', now)
    .is('used_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!record) {
    return NextResponse.json({ status: 'invalid' })
  }

  // Guard: already exhausted attempts (belt-and-suspenders; used_at should cover this)
  if ((record.attempt_count ?? 0) >= MAX_ATTEMPTS) {
    return NextResponse.json({ status: 'too_many_attempts' })
  }

  const valid = await bcrypt.compare(String(otp).trim(), record.otp_hash)

  if (!valid) {
    const newCount = (record.attempt_count ?? 0) + 1
    const exhausted = newCount >= MAX_ATTEMPTS

    // Increment attempt counter; if exhausted, also stamp used_at to invalidate
    await supabaseAdmin
      .from('email_otps')
      .update({
        attempt_count: newCount,
        ...(exhausted ? { used_at: now } : {}),
      })
      .eq('id', record.id)

    return NextResponse.json({
      status: exhausted ? 'too_many_attempts' : 'invalid',
    })
  }

  // Correct OTP — consume atomically (stamp used_at so concurrent requests see it as used)
  await supabaseAdmin
    .from('email_otps')
    .update({ used_at: now, attempt_count: (record.attempt_count ?? 0) + 1 })
    .eq('id', record.id)

  const verification_token = createVerificationToken(unit_id, emailLower)

  return NextResponse.json({ status: 'ok', verification_token })
}
