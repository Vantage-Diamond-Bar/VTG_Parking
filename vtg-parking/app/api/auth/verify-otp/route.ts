import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { createVerificationToken } from '@/lib/auth'

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
    .select('id, otp_hash')
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

  const valid = await bcrypt.compare(String(otp).trim(), record.otp_hash)
  if (!valid) {
    return NextResponse.json({ status: 'invalid' })
  }

  // Mark as used so it cannot be reused
  await supabaseAdmin
    .from('email_otps')
    .update({ used_at: now })
    .eq('id', record.id)

  const verification_token = createVerificationToken(unit_id, emailLower)

  return NextResponse.json({ status: 'ok', verification_token })
}
