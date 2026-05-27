import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyCredentials, encodeSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  const user = await verifyCredentials(username, password);

  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  if (user.role !== 'patrol') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Patrol login never grants admin-portal access — otp_verified must stay false
  const sessionToken = encodeSession({ ...user, otp_verified: false });

  const cookieStore = await cookies();
  cookieStore.set('session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });

  return NextResponse.json({ ok: true, role: user.role });
}
