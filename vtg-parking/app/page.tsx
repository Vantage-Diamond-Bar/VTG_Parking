'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'

function HomeCard({
  href, icon, title, desc, colorClass,
}: {
  href: string; icon: string; title: string; desc: string; colorClass: string
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col h-full rounded-2xl p-7 shadow-md hover:shadow-xl transition-all duration-200 hover:-translate-y-1 text-white ${colorClass}`}
    >
      <div className="text-4xl mb-3">{icon}</div>
      <h2 className="text-xl font-bold mb-1.5 leading-snug">{title}</h2>
      <p className="text-sm leading-relaxed" style={{ opacity: 0.88 }}>{desc}</p>
    </Link>
  )
}

export default function HomePage() {
  const t = useTranslations('home')

  return (
    <div className="min-h-screen flex flex-col relative" style={{ backgroundColor: '#f5f4f0' }}>

      {/* ── Background photo layer: extends from top through card area ── */}
      <div
        className="absolute top-0 left-0 right-0 pointer-events-none"
        style={{
          backgroundImage: "url('/community-gate.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center 50%',
          height: '85vh',
          zIndex: 0,
        }}
      >
        {/* Gradient: dark teal at top → fades to page bg over card area */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, rgba(3,43,42,0.84) 0%, rgba(10,100,92,0.48) 28%, rgba(245,244,240,0.68) 55%, rgba(245,244,240,0.94) 80%, rgba(245,244,240,1) 100%)',
          }}
        />
      </div>

      {/* ── Navbar ── */}
      <div className="relative" style={{ zIndex: 10 }}>
        <Navbar />
      </div>

      {/* ── Hero text ── */}
      <div
        className="relative text-center px-4"
        style={{ zIndex: 10, paddingTop: '68px', paddingBottom: '44px' }}
      >
        <h1
          className="font-extrabold text-white tracking-tight mb-3"
          style={{
            fontSize: 'clamp(1.9rem, 5vw, 3.1rem)',
            textShadow: '0 2px 14px rgba(0,0,0,0.40)',
          }}
        >
          {t('title')}
        </h1>
        <p className="text-lg mb-1" style={{ color: 'rgba(187,247,237,0.92)' }}>
          {t('subtitle')}
        </p>
        <p className="text-sm" style={{ color: 'rgba(148,236,220,0.76)' }}>
          {t('description')}
        </p>
      </div>

      {/* ── Service cards + staff portals ── */}
      <main
        className="relative flex-1 max-w-5xl mx-auto w-full px-4 pb-14"
        style={{ zIndex: 10 }}
      >
        {/* 3-col grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-9 items-stretch">

          <HomeCard
            href="/report"
            icon="📸"
            title={t('card_report_title')}
            desc={t('card_report_desc')}
            colorClass="bg-amber-600 hover:bg-amber-700"
          />

          <HomeCard
            href="/visitor"
            icon="🎫"
            title={t('card_visitor_title')}
            desc={t('card_visitor_desc')}
            colorClass="bg-teal-600 hover:bg-teal-700"
          />

          <div className="flex flex-col gap-5">
            <HomeCard
              href="/register"
              icon="🚗"
              title={t('card_register_title')}
              desc={t('card_register_desc')}
              colorClass="bg-teal-800 hover:bg-teal-900"
            />
            <Link
              href="/vacation"
              className="flex items-center gap-4 rounded-2xl px-6 py-5 shadow-md hover:shadow-xl transition-all duration-200 hover:-translate-y-1 text-white"
              style={{ backgroundColor: '#0f9e91' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#0c8a7e')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#0f9e91')}
            >
              <span className="text-3xl">🏖️</span>
              <div>
                <div className="font-bold text-base leading-snug">{t('vacation_portal')}</div>
                <div className="text-xs mt-0.5" style={{ opacity: 0.80 }}>
                  Extended stay request for residents
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* Staff portals */}
        <div className="border-t pt-7" style={{ borderColor: '#dedad2' }}>
          <p className="text-center text-sm mb-4" style={{ color: '#a09890' }}>
            {t('staff_portal')}
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/admin/login"
              className="px-6 py-2 rounded-lg border text-sm transition-colors"
              style={{ borderColor: '#ccc8bd', color: '#6b6460' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#eceae4')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              🔐 {t('admin_portal')}
            </Link>
            <Link
              href="/patrol/login"
              className="px-6 py-2 rounded-lg border text-sm transition-colors"
              style={{ borderColor: '#ccc8bd', color: '#6b6460' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#eceae4')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              🚔 {t('patrol_portal')}
            </Link>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer
        className="relative text-center py-5 text-xs border-t"
        style={{ zIndex: 10, color: '#a09890', borderColor: '#dedad2', backgroundColor: '#eeece6' }}
      >
        Vantage Community Parking Management System
      </footer>
    </div>
  )
}
