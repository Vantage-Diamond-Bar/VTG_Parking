'use client'

// Auth is handled by the httpOnly session cookie, which browsers attach automatically
// to all same-origin requests. No client-side token injection needed.
export function AdminFetchInterceptor() {
  return null
}
