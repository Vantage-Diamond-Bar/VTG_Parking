import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { supabaseAdmin } from './supabase'
import bcrypt from 'bcryptjs'

export type UserRole = 'admin' | 'patrol'

export interface AuthUser {
  id: string
  username: string
  role: UserRole
  display_name: string | null
}

export async function verifyCredentials(
  username: string,
  password: string
): Promise<AuthUser | null> {
  const { data: user } = await supabaseAdmin
    .from('admin_users')
    .select('id, username, password_hash, role, display_name, active')
    .eq('username', username)
    .single()

  if (!user || !user.active) return null

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) return null

  await supabaseAdmin
    .from('admin_users')
    .update({ last_login: new Date().toISOString() })
    .eq('id', user.id)

  return { id: user.id, username: user.username, role: user.role, display_name: user.display_name }
}

function decodeSession(value: string): AuthUser | null {
  try {
    return JSON.parse(Buffer.from(value, 'base64').toString('utf-8')) as AuthUser
  } catch {
    return null
  }
}

// For Server Components and layouts — uses next/headers
export async function getSession(): Promise<AuthUser | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('session')
  if (!sessionCookie) return null
  return decodeSession(sessionCookie.value)
}

// For Route Handlers — reads from cookie first, falls back to X-Session-Token header
export function getSessionFromRequest(req: NextRequest): AuthUser | null {
  const sessionCookie = req.cookies.get('session')
  if (sessionCookie) return decodeSession(sessionCookie.value)
  const headerToken = req.headers.get('X-Session-Token')
  if (headerToken) return decodeSession(headerToken)
  return null
}

export function encodeSession(user: AuthUser): string {
  return Buffer.from(JSON.stringify(user)).toString('base64')
}
