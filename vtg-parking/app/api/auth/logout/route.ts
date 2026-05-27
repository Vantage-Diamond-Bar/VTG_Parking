import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const role = searchParams.get('role');
  const redirectTo = role === 'admin' ? '/admin/login' : '/patrol/login';

  const cookieStore = await cookies();
  cookieStore.delete('session');

  return NextResponse.redirect(new URL(redirectTo, req.url));
}
