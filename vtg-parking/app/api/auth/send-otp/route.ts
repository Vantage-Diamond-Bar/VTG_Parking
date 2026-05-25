import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { randomInt } from 'crypto'
import { sendOtpEmail } from '@/lib/email'

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

  // Generate a 6-digit code and store its bcrypt hash
  const otp = String(randomInt(100000, 999999))
  const otp_hash = await bcrypt.hash(otp, 8)
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  // Replace any existing unused OTPs for this unit+email
  await supabaseAdmin
    .from('email_otps')
    .delete()
    .eq('unit_id', unit_id)
    .eq('email', emailLower)

  await supabaseAdmin
    .from('email_otps')
    .insert({ unit_id, email: emailLower, otp_hash, expires_at })

  await sendOtpEmail(email.trim(), otp)

  return NextResponse.json({ status: 'sent' })
}
