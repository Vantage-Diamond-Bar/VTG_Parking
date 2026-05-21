'use client'

import Link from 'next/link'
import LanguageSwitcher from './LanguageSwitcher'

export default function Navbar() {
  return (
    <nav className="bg-white shadow-sm" style={{ borderBottom: '2px solid #0d9488' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🅿️</span>
            <span className="font-bold text-lg hidden sm:block" style={{ color: '#0f766e' }}>
              VTG Parking
            </span>
          </Link>
          <LanguageSwitcher />
        </div>
      </div>
    </nav>
  )
}
