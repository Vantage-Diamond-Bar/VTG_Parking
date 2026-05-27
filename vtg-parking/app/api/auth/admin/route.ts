import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyCredentials, encodeSession } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { sendOtpEmail } from '@/lib/email';

const RATE_LIMIT_MAX    = 3
const RATE_LIMIT_WINDOW = 10 * 60 * 1000  // ms
const MAX_OTP_ATTEMPTS  = 5

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  const hint = local.length > 2 ? local.slice(0, 2) + '***' : '***'
  return `${hint}@${domain}`
}

export async function POST(req: NextRequest) {
  const { username, password, otp } = await req.json();

  // Always verify credentials first (both steps)
  const user = await verifyCredentials(username, password);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  // Fetch this admin's email
  const { data: adminRow } = await supabaseAdmin
    .from('admin_users')
    .select('email')
    .eq('id', user.id)
    .single();

  if (!adminRow?.email) {
    return NextResponse.json({ error: 'no_email' }, { status: 500 });
  }

  const adminEmail = adminRow.email.trim().toLowerCase();
  const otpKey    = user.id;   // unit_id column is UUID — use admin user's UUID directly
  const now       = new Date().toISOString();

  // ── Step 2: OTP provided — verify it ─────────────────────────────────────
  if (otp) {
    const { data: record } = await supabaseAdmin
      .from('email_otps')
      .select('id, otp_hash, attempt_count')
      .eq('unit_id', otpKey)
      .eq('email', adminEmail)
      .gt('expires_at', now)
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!record) {
      return NextResponse.json({ status: 'invalid' });
    }

    if ((record.attempt_count ?? 0) >= MAX_OTP_ATTEMPTS) {
      return NextResponse.json({ status: 'too_many_attempts' });
    }

    const valid = await bcrypt.compare(String(otp).trim(), record.otp_hash);

    if (!valid) {
      const newCount  = (record.attempt_count ?? 0) + 1;
      const exhausted = newCount >= MAX_OTP_ATTEMPTS;
      await supabaseAdmin
        .from('email_otps')
        .update({ attempt_count: newCount, ...(exhausted ? { used_at: now } : {}) })
        .eq('id', record.id);
      return NextResponse.json({ status: exhausted ? 'too_many_attempts' : 'invalid' });
    }

    // Consume OTP atomically
    await supabaseAdmin
      .from('email_otps')
      .update({ used_at: now, attempt_count: (record.attempt_count ?? 0) + 1 })
      .eq('id', record.id);

    // Issue full admin session — otp_verified marks it as having passed email MFA
    const sessionToken = encodeSession({ ...user, otp_verified: true });
    const cookieStore = await cookies();
    cookieStore.set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60,   // 8 hours
      path: '/',
    });
    return NextResponse.json({ ok: true, role: user.role });
  }

  // ── Step 1: No OTP yet — send one ────────────────────────────────────────
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW).toISOString();
  const { count: recentCount } = await supabaseAdmin
    .from('email_otps')
    .select('id', { count: 'exact', head: true })
    .eq('unit_id', otpKey)
    .eq('email', adminEmail)
    .gte('created_at', windowStart);

  if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
    return NextResponse.json({ status: 'rate_limited' }, { status: 429 });
  }

  // Remove stale OTPs, then issue a fresh one
  await supabaseAdmin
    .from('email_otps')
    .delete()
    .eq('unit_id', otpKey)
    .eq('email', adminEmail);

  const otpCode    = String(randomInt(100000, 999999));
  const otp_hash   = await bcrypt.hash(otpCode, 8);
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await supabaseAdmin
    .from('email_otps')
    .insert({ unit_id: otpKey, email: adminEmail, otp_hash, expires_at });

  await sendOtpEmail(adminRow.email.trim(), otpCode);

  return NextResponse.json({
    status: 'otp_sent',
    email_hint: maskEmail(adminEmail),
  });
}
