'use client'

import { useTransition } from 'react'

const LANGUAGES = [
  { code: 'en', label: 'EN', full: 'English' },
  { code: 'zh', label: '中', full: '中文' },
  { code: 'ko', label: '한', full: '한국어' },
]

export default function LanguageSwitcher({ current }: { current: string }) {
  const [, startTransition] = useTransition()

  function switchLocale(locale: string) {
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
    <div className="flex items-center gap-1">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          onClick={() => switchLocale(lang.code)}
          title={lang.full}
          className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
            current === lang.code
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  )
}
