import { getTranslations } from 'next-intl/server';

interface Stats {
  total_residents: number;
  visitor_registrations_this_month: number;
  violations_this_month: number;
}

interface Alert {
  id: string;
  license_plate: string;
  month: string;
  units_involved: string[];
  count: number;
}

interface Violation {
  id: string;
  submitted_at: string;
  location: string;
  type: string;
  plate: string;
  description: string;
}

async function getStats(): Promise<Stats | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/stats`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getAlerts(): Promise<Alert[]> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/alerts?resolved=false`,
      { cache: 'no-store' }
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function getRecentViolations(): Promise<Violation[]> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/violations?limit=5`,
      { cache: 'no-store' }
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function AdminDashboardPage() {
  const t = await getTranslations('admin');
  const [stats, alerts, violations] = await Promise.all([
    getStats(),
    getAlerts(),
    getRecentViolations(),
  ]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('dashboard')}</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <p className="text-sm text-gray-500">{t('total_residents')}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {stats?.total_residents ?? '—'}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <p className="text-sm text-gray-500">{t('visitor_registrations_month')}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {stats?.visitor_registrations_this_month ?? '—'}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <p className="text-sm text-gray-500">{t('violations_month')}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {stats?.violations_this_month ?? '—'}
          </p>
        </div>
      </div>

      {/* Unresolved Abuse Alerts */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-8">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{t('unresolved_alerts')}</h2>
        </div>
        <div className="overflow-x-auto">
          {alerts.length === 0 ? (
            <p className="text-sm text-gray-500 px-6 py-4">{t('no_alerts')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-6 py-3 text-left">{t('license_plate')}</th>
                  <th className="px-6 py-3 text-left">{t('month')}</th>
                  <th className="px-6 py-3 text-left">{t('units_involved')}</th>
                  <th className="px-6 py-3 text-left">{t('count')}</th>
                  <th className="px-6 py-3 text-left">{t('action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {alerts.map((alert) => (
                  <tr key={alert.id}>
                    <td className="px-6 py-4 font-mono font-semibold">{alert.license_plate}</td>
                    <td className="px-6 py-4">{alert.month}</td>
                    <td className="px-6 py-4">{alert.units_involved?.join(', ')}</td>
                    <td className="px-6 py-4">{alert.count}</td>
                    <td className="px-6 py-4">
                      <form action={`/api/admin/alerts/${alert.id}`} method="PATCH">
                        <button
                          type="submit"
                          className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                        >
                          {t('mark_resolved')}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Recent Violations */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{t('recent_violations')}</h2>
        </div>
        {violations.length === 0 ? (
          <p className="text-sm text-gray-500 px-6 py-4">{t('no_violations')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {violations.map((v) => (
              <li key={v.id} className="px-6 py-4 flex items-center justify-between text-sm">
                <div>
                  <span className="font-mono font-semibold text-gray-900 mr-3">{v.plate}</span>
                  <span className="text-gray-600 mr-3">{v.location}</span>
                  <span className="inline-block bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full">{v.type}</span>
                </div>
                <span className="text-gray-400 text-xs">
                  {new Date(v.submitted_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
