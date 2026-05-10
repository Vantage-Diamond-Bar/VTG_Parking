import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { locale } = await req.json();

  const res = NextResponse.json({ ok: true });
  res.cookies.set('locale', locale, {
    httpOnly: false,
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  });

  return res;
}
