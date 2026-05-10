import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const role = searchParams.get('role');
  const redirectTo = role === 'admin' ? '/admin/login' : '/patrol/login';

  const res = NextResponse.redirect(new URL(redirectTo, req.url));
  res.cookies.set('session', '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });

  return res;
}
