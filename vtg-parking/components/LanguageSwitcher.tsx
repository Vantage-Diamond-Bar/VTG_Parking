'use client'

import { useState, useEffect, useTransition } from 'react'

const LANGUAGES = [
  { code: 'en', label: 'EN', full: 'English' },
  { code: 'zh', label: '中文', full: '中文' },
  { code: 'ko', label: '한국어', full: '한국어' },
]

export default function LanguageSwitcher({ current: initialCurrent }: { current?: string }) {
  const [current, setCurrent] = useState(initialCurrent ?? 'en')
  const [, startTransition] = useTransition()

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)locale=([^;]*)/)
    if (match) setCurrent(decodeURIComponent(match[1]))
    else if (!initialCurrent) setCurrent('en')
  }, [initialCurrent])

  function switchLocale(locale: string) {
    setCurrent(locale)
    startTransition(async () => {
      await fetch('/api/locale', {
        method: 'POST',
        body: JSON.stringify({ locale }),
        headers: { 'Content-Type': 'application/json' },
      })
      window.location.reload()
    })
  }

  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          onClick={() => switchLocale(lang.code)}
          title={lang.full}
          className={`px-3 py-1 rounded-full text-sm font-semibold transition-all ${
            current === lang.code
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200'
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  )
}
