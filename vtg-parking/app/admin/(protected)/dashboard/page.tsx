import { getTranslations } from 'next-intl/server';
import { supabaseAdmin } from '@/lib/supabase';

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

interface OverdueVehicle {
  id: string;
  owner_name: string;
  owner_email: string;
  make: string;
  model: string;
  color: string;
  license_plate: string;
  created_at: string;
  units: { address: string } | null;
}

async function getStats(): Promise<Stats | null> {
  const year_month = new Date().toISOString().slice(0, 7);
  const monthStart = `${year_month}-01`;
  const [residentsResult, visitorsResult, violationsResult] = await Promise.all([
    supabaseAdmin.from('resident_vehicles').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('visitor_registrations').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    supabaseAdmin.from('violation_reports').select('id', { count: 'exact', head: true }).gte('submitted_at', monthStart),
  ]);
  return {
    total_residents: residentsResult.count ?? 0,
    visitor_registrations_this_month: visitorsResult.count ?? 0,
    violations_this_month: violationsResult.count ?? 0,
  };
}

async function getAlerts(): Promise<Alert[]> {
  const { data } = await supabaseAdmin
    .from('abuse_alerts')
    .select('*')
    .eq('is_resolved', false)
    .order('created_at', { ascending: false });
  return (data ?? []).map((row: any) => ({
    id: row.id,
    license_plate: row.license_plate,
    month: row.year_month,
    units_involved: row.unit_ids ?? [],
    count: (row.unit_ids ?? []).length,
  }));
}

async function getRecentViolations(): Promise<Violation[]> {
  const { data } = await supabaseAdmin
    .from('violation_reports')
    .select('id, submitted_at, location, violation_type, license_plate, description')
    .order('submitted_at', { ascending: false })
    .limit(5);
  return (data ?? []).map((v: any) => ({
    id: v.id,
    submitted_at: v.submitted_at,
    location: v.location,
    type: v.violation_type,
    plate: v.license_plate ?? '',
    description: v.description ?? '',
  }));
}

async function getOverdueVehicles(): Promise<OverdueVehicle[]> {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const { data } = await supabaseAdmin
    .from('resident_vehicles')
    .select('id, owner_name, owner_email, make, model, color, license_plate, created_at, units(address)')
    .lt('created_at', oneYearAgo.toISOString())
    .order('created_at', { ascending: true })
    .limit(20);
  return (data ?? []) as unknown as OverdueVehicle[];
}

export default async function AdminDashboardPage() {
  const t = await getTranslations('admin');
  const [stats, alerts, violations, overdueVehicles] = await Promise.all([
    getStats(),
    getAlerts(),
    getRecentViolations(),
    getOverdueVehicles(),
  ]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('dashboard')}</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
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
        <div className={`rounded-xl shadow-sm p-6 border ${overdueVehicles.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
          <p className={`text-sm ${overdueVehicles.length > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
            {t('overdue_vehicles')}
          </p>
          <p className={`text-3xl font-bold mt-1 ${overdueVehicles.length > 0 ? 'text-amber-800' : 'text-gray-900'}`}>
            {overdueVehicles.length}
          </p>
        </div>
      </div>

      {/* Overdue Registrations */}
      {overdueVehicles.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-amber-200 mb-8">
          <div className="px-6 py-4 border-b border-amber-100 bg-amber-50 rounded-t-xl">
            <h2 className="text-lg font-semibold text-amber-900">⚠️ {t('overdue_vehicles')}</h2>
            <p className="text-sm text-amber-700 mt-0.5">{t('overdue_desc')}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-6 py-3 text-left">{t('unit')}</th>
                  <th className="px-6 py-3 text-left">{t('owner')}</th>
                  <th className="px-6 py-3 text-left">{t('vehicle')}</th>
                  <th className="px-6 py-3 text-left">{t('plate')}</th>
                  <th className="px-6 py-3 text-left">{t('registered')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {overdueVehicles.map((v) => (
                  <tr key={v.id} className="hover:bg-amber-50">
                    <td className="px-6 py-3 text-gray-700">{v.units?.address ?? '—'}</td>
                    <td className="px-6 py-3">
                      <div className="font-medium">{v.owner_name}</div>
                      <div className="text-xs text-gray-400">{v.owner_email}</div>
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {[v.color, v.make, v.model].filter(Boolean).join(' ')}
                    </td>
                    <td className="px-6 py-3 font-mono font-semibold text-gray-800">{v.license_plate}</td>
                    <td className="px-6 py-3 text-red-600 font-medium">
                      {new Date(v.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
