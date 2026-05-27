import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAdmin } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('session')
  const allCookies = cookieStore.getAll().map(c => c.name)

  const session = await requireAdmin(req)

  return NextResponse.json({
    has_session_cookie: !!sessionCookie,
    session_cookie_length: sessionCookie?.value?.length ?? 0,
    all_cookie_names: allCookies,
    requireAdmin_result: session ? {
      username: session.username,
      role: session.role,
      otp_verified: session.otp_verified,
    } : null,
  })
}
