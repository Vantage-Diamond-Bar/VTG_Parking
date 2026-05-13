import { cookies } from 'next/headers'
import Link from 'next/link'
import LanguageSwitcher from './LanguageSwitcher'

export default async function Navbar() {
  const cookieStore = await cookies()
  const locale = cookieStore.get('locale')?.value ?? 'en'

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🅿️</span>
            <span className="font-bold text-gray-900 text-lg hidden sm:block">VTG Parking</span>
          </Link>
          <LanguageSwitcher current={locale} />
        </div>
      </div>
    </nav>
  )
}
