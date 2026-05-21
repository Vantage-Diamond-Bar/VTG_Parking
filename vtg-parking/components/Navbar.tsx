'use client'

import Link from 'next/link'
import { Playfair_Display } from 'next/font/google'
import LanguageSwitcher from './LanguageSwitcher'

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['700'],
  display: 'swap',
})

export default function Navbar() {
  return (
    <nav className="bg-white shadow-sm" style={{ borderBottom: '2px solid #0d9488' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center">
            <span
              className={playfair.className}
              style={{
                color: '#0f766e',
                fontSize: 'clamp(1rem, 2.2vw, 1.25rem)',
                letterSpacing: '0.015em',
                lineHeight: 1,
              }}
            >
              Vantage Community Parking
            </span>
          </Link>
          <LanguageSwitcher />
        </div>
      </div>
    </nav>
  )
}
