import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAdmin } from '@/lib/auth'

export async function GET(req: NextRequest) {
  // Read cookies via next/headers
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('session')
  const allCookies = cookieStore.getAll().map(c => c.name)

  // Also read directly from request header (bypasses next/headers abstraction)
  const rawCookieHeader = req.headers.get('cookie') ?? ''

  const session = await requireAdmin(req)

  // Also try setting a test cookie via raw header to diagnose middleware stripping
  const res = NextResponse.json({
    has_session_cookie: !!sessionCookie,
    session_cookie_length: sessionCookie?.value?.length ?? 0,
    all_cookie_names: allCookies,
    raw_cookie_header_length: rawCookieHeader.length,
    raw_cookie_header_preview: rawCookieHeader.slice(0, 100),
    requireAdmin_result: session ? {
      username: session.username,
      role: session.role,
      otp_verified: session.otp_verified,
    } : null,
  })
  // Set a test cookie via raw response header
  res.headers.set('Set-Cookie', 'debug_test=1; Path=/; SameSite=Lax; Max-Age=60')
  return res
}
