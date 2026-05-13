'use client'

import { useState, useEffect } from 'react'

export const COUNTRY_CODES = [
  { code: '+1', country: 'US', label: '+1 (US)' },
  { code: '+1-CA', country: 'CA', label: '+1 (CA)' },
  { code: '+52', country: 'MX', label: '+52 (MX)' },
  { code: '+86', country: 'CN', label: '+86 (CN)' },
  { code: '+82', country: 'KR', label: '+82 (KR)' },
  { code: '+81', country: 'JP', label: '+81 (JP)' },
  { code: '+44', country: 'GB', label: '+44 (GB)' },
  { code: '+61', country: 'AU', label: '+61 (AU)' },
  { code: '+91', country: 'IN', label: '+91 (IN)' },
  { code: '+49', country: 'DE', label: '+49 (DE)' },
  { code: '+33', country: 'FR', label: '+33 (FR)' },
  { code: '+34', country: 'ES', label: '+34 (ES)' },
  { code: '+39', country: 'IT', label: '+39 (IT)' },
  { code: '+55', country: 'BR', label: '+55 (BR)' },
  { code: '+63', country: 'PH', label: '+63 (PH)' },
  { code: '+84', country: 'VN', label: '+84 (VN)' },
  { code: '+66', country: 'TH', label: '+66 (TH)' },
  { code: '+62', country: 'ID', label: '+62 (ID)' },
  { code: '+60', country: 'MY', label: '+60 (MY)' },
  { code: '+65', country: 'SG', label: '+65 (SG)' },
  { code: '+886', country: 'TW', label: '+886 (TW)' },
  { code: '+852', country: 'HK', label: '+852 (HK)' },
  { code: '+853', country: 'MO', label: '+853 (MO)' },
]

// Returns the numeric dial code (e.g. "+1" for both US and CA)
export function dialCode(code: string) {
  return code.startsWith('+1') ? '+1' : code
}

interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  required?: boolean
}

/** Stores value as "{dialCode} {digits}", e.g. "+1 6265551234" or "+86 13912345678" */
export default function PhoneInput({ value, onChange, className, required }: PhoneInputProps) {
  const [countryCode, setCountryCode] = useState('+1')
  const [localNumber, setLocalNumber] = useState('')

  // Parse incoming value on mount / external change
  useEffect(() => {
    if (!value) return
    const matched = COUNTRY_CODES.find((c) => value.startsWith(dialCode(c.code) + ' '))
    if (matched) {
      setCountryCode(matched.code)
      setLocalNumber(value.slice(dialCode(matched.code).length + 1))
    } else {
      setLocalNumber(value)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleCountryChange(code: string) {
    setCountryCode(code)
    const cleaned = localNumber.replace(/\D/g, '')
    setLocalNumber(cleaned)
    onChange(`${dialCode(code)} ${cleaned}`)
  }

  function handleLocalChange(raw: string) {
    const cleaned = raw.replace(/\D/g, '')
    setLocalNumber(cleaned)
    onChange(`${dialCode(countryCode)} ${cleaned}`)
  }

  const inputCls = className ?? 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="flex gap-2">
      <select
        value={countryCode}
        onChange={(e) => handleCountryChange(e.target.value)}
        className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-32 shrink-0"
      >
        {COUNTRY_CODES.map((c) => (
          <option key={c.code} value={c.code}>{c.label}</option>
        ))}
      </select>
      <input
        type="tel"
        value={localNumber}
        onChange={(e) => handleLocalChange(e.target.value)}
        placeholder="Phone number"
        className={inputCls}
        required={required}
      />
    </div>
  )
}
