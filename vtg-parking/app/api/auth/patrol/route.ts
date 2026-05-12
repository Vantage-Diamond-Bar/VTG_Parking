import { NextRequest, NextResponse } from 'next/server';
import { verifyCredentials, encodeSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  const user = await verifyCredentials(username, password);

  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  if (user.role !== 'admin' && user.role !== 'patrol') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sessionToken = encodeSession(user);

  const res = NextResponse.json({ ok: true, role: user.role });
  res.cookies.set('session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });

  return res;
}
