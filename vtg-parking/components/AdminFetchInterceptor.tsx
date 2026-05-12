'use client'

import { useEffect } from 'react'

export function AdminFetchInterceptor() {
  useEffect(() => {
    const original = window.fetch
    window.fetch = (input, init) => {
      const token = localStorage.getItem('vtg_admin_token')
      if (token) {
        init = { ...init, headers: { ...(init?.headers as Record<string, string>), 'X-Session-Token': token } }
      }
      return original(input, init)
    }
    return () => { window.fetch = original }
  }, [])
  return null
}
