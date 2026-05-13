'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'

function HomeCard({
  href, icon, title, desc, color,
}: {
  href: string; icon: string; title: string; desc: string; color: string
}) {
  return (
    <Link href={href} className={`flex flex-col h-full rounded-2xl p-8 shadow-md hover:shadow-xl transition-all hover:-translate-y-1 ${color} text-white`}>
      <div className="text-5xl mb-4">{icon}</div>
      <h2 className="text-2xl font-bold mb-2">{title}</h2>
      <p className="opacity-90 text-sm leading-relaxed">{desc}</p>
    </Link>
  )
}

export default function HomePage() {
  const t = useTranslations('home')
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('vtg-dark-mode')
    if (saved === 'true') setDark(true)
  }, [])

  function toggleDark() {
    const next = !dark
    setDark(next)
    localStorage.setItem('vtg-dark-mode', String(next))
  }

  const bg = dark ? 'bg-gray-900' : 'bg-gray-50'
  const text = dark ? 'text-gray-100' : 'text-gray-900'
  const subtext = dark ? 'text-gray-400' : 'text-gray-500'
  const divider = dark ? 'border-gray-700' : 'border-gray-200'
  const staffLabel = dark ? 'text-gray-500' : 'text-gray-400'
  const staffBtn = dark
    ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
    : 'border-gray-300 text-gray-600 hover:bg-gray-100'
  const toggleBtn = dark
    ? 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700'
    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
  const footerText = dark ? 'text-gray-600 border-gray-800' : 'text-gray-400 border-gray-100'

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-200 ${bg}`}>
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-12">
        {/* Dark mode toggle */}
        <div className="flex justify-end mb-2">
          <button
            onClick={toggleDark}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${toggleBtn}`}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>

        {/* Hero */}
        <div className="text-center mb-12">
          <div className="text-6xl mb-4">🅿️</div>
          <h1 className={`text-4xl font-extrabold mb-2 ${text}`}>{t('title')}</h1>
          <p className={`text-lg ${subtext}`}>{t('subtitle')}</p>
          <p className={`mt-2 ${subtext}`}>{t('description')}</p>
        </div>

        {/* Main 3-col layout: Report | Visitor | Register+Vacation stacked */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 items-stretch">
          <HomeCard href="/report"   icon="📸" title={t('card_report_title')}   desc={t('card_report_desc')}   color="bg-orange-500" />
          <HomeCard href="/visitor"  icon="🎫" title={t('card_visitor_title')}  desc={t('card_visitor_desc')}  color="bg-emerald-600" />
          <div className="flex flex-col gap-6">
            <HomeCard href="/register" icon="🚗" title={t('card_register_title')} desc={t('card_register_desc')} color="bg-blue-600" />
            <Link
              href="/vacation"
              className="flex items-center gap-3 rounded-2xl px-6 py-5 shadow-md hover:shadow-xl transition-all hover:-translate-y-1 bg-teal-500 text-white"
            >
              <span className="text-3xl">🏖️</span>
              <div>
                <div className="font-bold text-base">{t('vacation_portal')}</div>
                <div className="text-xs opacity-80 mt-0.5">Extended stay request for residents</div>
              </div>
            </Link>
          </div>
        </div>

        {/* Staff portal */}
        <div className={`border-t ${divider} pt-8`}>
          <p className={`text-center text-sm ${staffLabel} mb-4`}>{t('staff_portal')}</p>
          <div className="flex justify-center gap-4">
            <Link
              href="/admin/login"
              className={`px-6 py-2 rounded-lg border text-sm transition-colors ${staffBtn}`}
            >
              🔐 {t('admin_portal')}
            </Link>
            <Link
              href="/patrol/login"
              className={`px-6 py-2 rounded-lg border text-sm transition-colors ${staffBtn}`}
            >
              🚔 {t('patrol_portal')}
            </Link>
          </div>
        </div>
      </main>

      <footer className={`text-center py-6 text-xs border-t ${footerText}`}>
        Vantage Community Parking Management System
      </footer>
    </div>
  )
}
