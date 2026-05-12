import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    redirect('/admin/login');
  }

  const t = await getTranslations('admin');

  const navItems = [
    { key: 'dashboard', href: '/admin/dashboard', icon: '📊' },
    { key: 'residents', href: '/admin/residents', icon: '🚗' },
    { key: 'visitors', href: '/admin/visitors', icon: '👤' },
    { key: 'violations', href: '/admin/violations', icon: '⚠️' },
    { key: 'units', href: '/admin/units', icon: '🏠' },
    { key: 'emails', href: '/admin/emails', icon: '📧' },
    { key: 'alerts', href: '/admin/alerts', icon: '🔔' },
    { key: 'vacation', href: '/admin/vacation', icon: '🏖️' },
  ] as const;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col flex-shrink-0">
        <div className="px-6 py-5 border-b border-gray-700">
          <span className="text-xl font-bold tracking-tight">🅿️ VTG Admin</span>
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

        <div className="px-3 py-4 border-t border-gray-700">
          <Link
            href="/api/auth/logout?role=admin"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-700 hover:text-white transition-colors w-full"
          >
            <span>🚪</span>
            <span>{t('logout')}</span>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-gray-50 overflow-auto">
        {children}
      </main>
    </div>
  );
}
