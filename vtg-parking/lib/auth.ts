import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { supabaseAdmin } from './supabase'
import bcrypt from 'bcryptjs'
import { createHmac, timingSafeEqual } from 'crypto'

export type UserRole = 'admin' | 'patrol'

export interface AuthUser {
  id: string
  username: string
  role: UserRole
  display_name: string | null
}

const SESSION_SECRET = process.env.SESSION_SECRET ?? ''
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET env var is missing or too short (minimum 32 characters). Set it before starting the server.')
}

function hmacSign(payload: string): string {
  return createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url')
}

function hmacVerify(payload: string, sig: string): boolean {
  const expected = hmacSign(payload)
  const sigBuf = Buffer.from(sig, 'base64url')
  const expBuf = Buffer.from(expected, 'base64url')
  if (sigBuf.length !== expBuf.length) return false
  return timingSafeEqual(sigBuf, expBuf)
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
    const dot = value.lastIndexOf('.')
    if (dot === -1) return null
    const payload = value.slice(0, dot)
    const sig = value.slice(dot + 1)
    if (!hmacVerify(payload, sig)) return null
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as AuthUser
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

// For Route Handlers — reads from httpOnly cookie only
export function getSessionFromRequest(req: NextRequest): AuthUser | null {
  const sessionCookie = req.cookies.get('session')
  if (sessionCookie) return decodeSession(sessionCookie.value)
  return null
}

export function encodeSession(user: AuthUser): string {
  const payload = Buffer.from(JSON.stringify(user)).toString('base64url')
  return `${payload}.${hmacSign(payload)}`
}

export interface VerificationTokenData {
  unit_id: string
  email: string
  exp: number
}

// Signed token issued after OTP verification — proves the user owns the email on file.
// Carries unit_id + email for downstream endpoints; valid for 60 minutes.
export function createVerificationToken(unit_id: string, email: string): string {
  const exp = Date.now() + 60 * 60 * 1000
  const payload = Buffer.from(JSON.stringify({ unit_id, email, exp })).toString('base64url')
  return `${payload}.${hmacSign(payload)}`
}

export function decodeVerificationToken(token: string | undefined): VerificationTokenData | null {
  if (!token) return null
  try {
    const dot = token.lastIndexOf('.')
    if (dot === -1) return null
    const payload = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    if (!hmacVerify(payload, sig)) return null
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as VerificationTokenData
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null
    return data
  } catch {
    return null
  }
}

export function verifyVerificationToken(token: string | undefined, unit_id: string): boolean {
  const data = decodeVerificationToken(token)
  return data !== null && data.unit_id === unit_id
}
