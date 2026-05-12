import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import Navbar from '@/components/Navbar'

function HomeCard({
  href, icon, title, desc, color,
}: {
  href: string; icon: string; title: string; desc: string; color: string
}) {
  return (
    <Link href={href} className={`block rounded-2xl p-8 shadow-md hover:shadow-lg transition-all hover:-translate-y-1 ${color} text-white`}>
      <div className="text-5xl mb-4">{icon}</div>
      <h2 className="text-2xl font-bold mb-2">{title}</h2>
      <p className="opacity-90 text-sm leading-relaxed">{desc}</p>
    </Link>
  )
}

export default async function HomePage() {
  const t = await getTranslations('home')

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-12">
        <div className="text-center mb-12">
          <div className="text-6xl mb-4">🅿️</div>
          <h1 className="text-4xl font-extrabold text-gray-900 mb-2">{t('title')}</h1>
          <p className="text-lg text-gray-500">{t('subtitle')}</p>
          <p className="text-gray-500 mt-2">{t('description')}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <HomeCard href="/register" icon="🚗" title={t('card_register_title')} desc={t('card_register_desc')} color="bg-blue-600" />
          <HomeCard href="/visitor" icon="🎫" title={t('card_visitor_title')} desc={t('card_visitor_desc')} color="bg-emerald-600" />
          <HomeCard href="/report" icon="📸" title={t('card_report_title')} desc={t('card_report_desc')} color="bg-orange-500" />
        </div>
        <div className="border-t border-gray-200 pt-8">
          <p className="text-center text-sm text-gray-400 mb-4">{t('staff_portal')}</p>
          <div className="flex justify-center gap-4">
            <Link href="/admin/login" className="px-6 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors text-sm">
              🔐 {t('admin_portal')}
            </Link>
            <Link href="/patrol/login" className="px-6 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors text-sm">
              🚔 {t('patrol_portal')}
            </Link>
          </div>
          <div className="flex justify-center mt-4">
            <Link href="/vacation" className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors">
              🏖️ {t('vacation_portal')}
            </Link>
          </div>
        </div>
      </main>
      <footer className="text-center py-6 text-xs text-gray-400 border-t border-gray-100">
        VTG Community Parking Management System
      </footer>
    </div>
  )
}
