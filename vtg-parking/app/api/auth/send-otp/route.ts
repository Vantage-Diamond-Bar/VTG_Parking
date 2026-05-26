import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { randomInt } from 'crypto'
import { sendOtpEmail } from '@/lib/email'

// Max OTP sends per unit+email in any 10-minute rolling window
const RATE_LIMIT_MAX    = 3
const RATE_LIMIT_WINDOW = 10 * 60 * 1000 // ms

export async function POST(req: NextRequest) {
  const { unit_id, email } = await req.json()

  if (!unit_id || !email) {
    return NextResponse.json({ error: 'unit_id and email required' }, { status: 400 })
  }

  const emailLower = email.trim().toLowerCase()

  // Check email matches at least one vehicle owner on this unit
  const { data: vehicles } = await supabaseAdmin
    .from('resident_vehicles')
    .select('owner_email')
    .eq('unit_id', unit_id)

  if (!vehicles || vehicles.length === 0) {
    return NextResponse.json({ status: 'no_vehicles' })
  }

  const matched = vehicles.some(
    (v) => v.owner_email?.trim().toLowerCase() === emailLower
  )
  if (!matched) {
    return NextResponse.json({ status: 'mismatch' })
  }

  // ── Rate limit: count OTPs issued in the last 10 min BEFORE the cleanup delete ──
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW).toISOString()
  const { count: recentCount } = await supabaseAdmin
    .from('email_otps')
    .select('id', { count: 'exact', head: true })
    .eq('unit_id', unit_id)
    .eq('email', emailLower)
    .gte('created_at', windowStart)

  if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
    return NextResponse.json({ status: 'rate_limited' }, { status: 429 })
  }

  // Remove stale OTPs, then issue a fresh one
  await supabaseAdmin
    .from('email_otps')
    .delete()
    .eq('unit_id', unit_id)
    .eq('email', emailLower)

  const otp      = String(randomInt(100000, 999999))
  const otp_hash = await bcrypt.hash(otp, 8)
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  await supabaseAdmin
    .from('email_otps')
    .insert({ unit_id, email: emailLower, otp_hash, expires_at })

  await sendOtpEmail(email.trim(), otp)

  return NextResponse.json({ status: 'sent' })
}
