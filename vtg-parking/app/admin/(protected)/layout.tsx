import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AdminFetchInterceptor } from '@/components/AdminFetchInterceptor';
import BrandName from '@/components/BrandName';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vantage Parking – Admin Portal',
};

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  // otp_verified must be true — prevents patrol-portal sessions from bypassing email MFA
  if (!session || session.role !== 'admin' || !session.otp_verified) {
    redirect('/admin/login');
  }

  const t = await getTranslations('admin');

  const navItems = [
    { key: 'dashboard', href: '/admin/dashboard', icon: '📊' },
    { key: 'violations', href: '/admin/violations', icon: '⚠️' },
    { key: 'residents', href: '/admin/residents', icon: '🚗' },
    { key: 'visitors', href: '/admin/visitors', icon: '👤' },
    { key: 'quota_summary', href: '/admin/quota-summary', icon: '📅' },
    { key: 'units', href: '/admin/units', icon: '🏠' },
    { key: 'emails', href: '/admin/emails', icon: '📧' },
    { key: 'alerts', href: '/admin/alerts', icon: '🔔' },
    { key: 'vacation', href: '/admin/vacation', icon: '🏖️' },
    { key: 'oversized', href: '/admin/oversized', icon: '🚛' },
  ] as const;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col flex-shrink-0 h-screen sticky top-0">
        <div className="px-6 py-5 border-b border-gray-700">
          <BrandName color="#5eead4" size="1rem" />
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-1 px-3">
            {navItems.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                >
                  <span>{item.icon}</span>
                  <span>{t(item.key as Parameters<typeof t>[0])}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="px-3 py-4 border-t border-gray-700 space-y-1">
          <a
            href="/patrol"
            className="block rounded-xl bg-indigo-900 hover:bg-indigo-800 transition-colors p-3 border border-indigo-700"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-2xl leading-none">🚔</span>
              <div>
                <div className="text-sm font-bold text-white leading-tight">Patrol Portal</div>
                <div className="text-xs text-indigo-300 leading-tight mt-0.5">Vehicle lookup</div>
              </div>
            </div>
          </a>
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-700 hover:text-white transition-colors w-full"
          >
            <span>🏠</span>
            <span>Return to Home</span>
          </Link>
          <a
            href="/api/auth/logout?role=admin"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-700 hover:text-white transition-colors w-full"
          >
            <span>🚪</span>
            <span>{t('logout')}</span>
          </a>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-gray-50 overflow-auto">
        <AdminFetchInterceptor />
        {children}
      </main>
    </div>
  );
}
