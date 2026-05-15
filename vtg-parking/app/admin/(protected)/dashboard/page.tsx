import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getPTYearMonth, PT_ZONE, formatPDT } from '@/lib/utils';
import ResolveAlertButton from './ResolveAlertButton';

interface Stats {
  total_residents: number;
  visitor_registrations_this_month: number;
  violations_this_month: number;
  pending_vacation: number;
  pending_oversized: number;
}

interface Alert {
  id: string;
  license_plate: string;
  plate_state: string;
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
  const year_month = getPTYearMonth();
  const monthStart = `${year_month}-01`;
  const [residentsResult, visitorsResult, violationsResult, vacationResult, oversizedResult] = await Promise.all([
    supabaseAdmin.from('resident_vehicles').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('visitor_registrations').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    supabaseAdmin.from('violation_reports').select('id', { count: 'exact', head: true }).gte('submitted_at', monthStart),
    supabaseAdmin.from('vacation_parking_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabaseAdmin.from('oversized_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  return {
    total_residents: residentsResult.count ?? 0,
    visitor_registrations_this_month: visitorsResult.count ?? 0,
    violations_this_month: violationsResult.count ?? 0,
    pending_vacation: vacationResult.count ?? 0,
    pending_oversized: oversizedResult.count ?? 0,
  };
}

async function getAlerts(): Promise<Alert[]> {
  const { data } = await supabaseAdmin
    .from('abuse_alerts')
    .select('*')
    .eq('is_resolved', false)
    .order('created_at', { ascending: false });

  const allUnitIds = [...new Set((data ?? []).flatMap((row: any) => row.unit_ids ?? []))];
  let unitMap: Record<string, string> = {};
  if (allUnitIds.length > 0) {
    const { data: units } = await supabaseAdmin.from('units').select('id, address').in('id', allUnitIds);
    unitMap = Object.fromEntries((units ?? []).map((u: any) => [u.id, u.address]));
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    license_plate: row.license_plate,
    plate_state: row.plate_state,
    month: row.year_month,
    units_involved: (row.unit_ids ?? []).map((uid: string) => unitMap[uid] ?? uid),
    count: (row.unit_ids ?? []).length,
  }));
}

async function getRecentViolations(): Promise<Violation[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const { data } = await supabaseAdmin
    .from('violation_reports')
    .select('id, submitted_at, location, violation_type, license_plate, description')
    .gte('submitted_at', sevenDaysAgo.toISOString())
    .order('submitted_at', { ascending: false })
    .limit(20);
  return (data ?? []).map((v: any) => ({
    id: v.id,
    submitted_at: v.submitted_at,
    location: v.location,
    type: v.violation_type,
    plate: v.license_plate ?? '',
    description: v.description ?? '',
  }));
}

async function getOverdueVehicles(): Promise<{ vehicles: OverdueVehicle[]; total: number }> {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const cutoff = oneYearAgo.toISOString();
  const [{ count }, { data }] = await Promise.all([
    supabaseAdmin.from('resident_vehicles').select('id', { count: 'exact', head: true }).lt('created_at', cutoff),
    supabaseAdmin
      .from('resident_vehicles')
      .select('id, owner_name, owner_email, make, model, color, license_plate, created_at, units(address)')
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(20),
  ]);
  return { vehicles: (data ?? []) as unknown as OverdueVehicle[], total: count ?? 0 };
}

export default async function AdminDashboardPage() {
  const t = await getTranslations('admin');
  const [stats, alerts, violations, overdueResult] = await Promise.all([
    getStats(),
    getAlerts(),
    getRecentViolations(),
    getOverdueVehicles(),
  ]);
  const overdueVehicles = overdueResult.vehicles;
  const overdueTotal = overdueResult.total;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('dashboard')}</h1>

      {/*
        Top section layout:
        - Left: stat cards column (flex, natural height = 6 × 100px + 5 × 12px gap = 660px)
        - Right: violations box fixed at h-[660px] so it always aligns with last stat card
        Each card: p-5 (40px padding) + text-sm label (20px) + mt-1 (4px) + text-3xl number (36px) = 100px
      */}
      <div className="flex gap-6 mb-8 items-start">

        {/* Left: Stat Cards — 6 × 100px + 5 × 12px = 660px natural height */}
        <div className="flex flex-col gap-3 w-56 shrink-0">

          <Link href="/admin/residents" className="block bg-white rounded-xl shadow-sm p-5 border border-gray-100 hover:bg-gray-50 transition-colors">
            <p className="text-sm font-medium text-gray-500">{t('total_residents')}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.total_residents ?? '—'}</p>
          </Link>

          <Link href="/admin/visitors" className="block bg-white rounded-xl shadow-sm p-5 border border-gray-100 hover:bg-gray-50 transition-colors">
            <p className="text-sm font-medium text-gray-500">{t('visitor_registrations_month')}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.visitor_registrations_this_month ?? '—'}</p>
          </Link>

          <Link href="/admin/violations" className="block bg-white rounded-xl shadow-sm p-5 border border-gray-100 hover:bg-gray-50 transition-colors">
            <p className="text-sm font-medium text-gray-500">{t('violations_month')}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.violations_this_month ?? '—'}</p>
          </Link>

          <Link href="/admin/residents" className={`block rounded-xl shadow-sm p-5 border transition-colors ${overdueTotal > 0 ? 'bg-amber-50 border-amber-200 hover:bg-amber-100' : 'bg-white border-gray-100 hover:bg-gray-50'}`}>
            <p className={`text-sm font-medium ${overdueTotal > 0 ? 'text-amber-700' : 'text-gray-500'}`}>{t('overdue_vehicles')}</p>
            <p className={`text-3xl font-bold mt-1 ${overdueTotal > 0 ? 'text-amber-800' : 'text-gray-900'}`}>{overdueTotal}</p>
          </Link>

          <Link href="/admin/vacation" className={`block rounded-xl shadow-sm p-5 border transition-colors ${(stats?.pending_vacation ?? 0) > 0 ? 'bg-purple-50 border-purple-200 hover:bg-purple-100' : 'bg-white border-gray-100 hover:bg-gray-50'}`}>
            <p className={`text-sm font-medium ${(stats?.pending_vacation ?? 0) > 0 ? 'text-purple-700' : 'text-gray-500'}`}>{t('pending_vacation')}</p>
            <p className={`text-3xl font-bold mt-1 ${(stats?.pending_vacation ?? 0) > 0 ? 'text-purple-800' : 'text-gray-900'}`}>{stats?.pending_vacation ?? '—'}</p>
          </Link>

          <Link href="/admin/oversized" className={`block rounded-xl shadow-sm p-5 border transition-colors ${(stats?.pending_oversized ?? 0) > 0 ? 'bg-orange-50 border-orange-200 hover:bg-orange-100' : 'bg-white border-gray-100 hover:bg-gray-50'}`}>
            <p className={`text-sm font-medium ${(stats?.pending_oversized ?? 0) > 0 ? 'text-orange-700' : 'text-gray-500'}`}>{t('pending_oversized')}</p>
            <p className={`text-3xl font-bold mt-1 ${(stats?.pending_oversized ?? 0) > 0 ? 'text-orange-800' : 'text-gray-900'}`}>{stats?.pending_oversized ?? '—'}</p>
          </Link>

        </div>

        {/* Right: Recent Violations — fixed 660px height, scrollable content */}
        <Link
          href="/admin/violations"
          className={`flex-1 rounded-xl shadow-sm flex flex-col overflow-hidden cursor-pointer ${
            violations.length > 0 ? 'border-2 border-amber-300' : 'border border-gray-100'
          }`}
          style={{ height: '660px' }}
        >
          <div className={`px-6 py-4 border-b shrink-0 rounded-t-xl ${
            violations.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'
          }`}>
            <h2 className={`text-lg font-semibold ${violations.length > 0 ? 'text-amber-900' : 'text-gray-900'}`}>
              🚔 {t('recent_violations')}
              <span className={`text-sm font-normal ml-2 ${violations.length > 0 ? 'text-amber-700' : 'text-gray-500'}`}>(last 7 days)</span>
            </h2>
          </div>
          <div className="overflow-y-auto flex-1 bg-white">
            {violations.length === 0 ? (
              <p className="text-sm text-gray-500 px-6 py-4">{t('no_violations')}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {violations.map((v) => {
                  const submittedAt = new Date(v.submitted_at);
                  const diffMs = Date.now() - submittedAt.getTime();
                  const diffMin = Math.floor(diffMs / 60000);
                  const diffHr = Math.floor(diffMin / 60);
                  const diffDay = Math.floor(diffHr / 24);
                  const agoParts: string[] = [];
                  if (diffDay > 0) agoParts.push(`${diffDay}d`);
                  if (diffHr % 24 > 0 || diffDay > 0) agoParts.push(`${diffHr % 24}h`);
                  agoParts.push(`${diffMin % 60}m`);
                  const ago = agoParts.join(' ') + ' ago';
                  const isRecent = diffHr < 24;
                  return (
                    <li key={v.id} className="px-6 py-4 flex items-start justify-between gap-4 text-sm hover:bg-amber-50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2 mb-1">
                          {v.plate && <span className="font-mono font-bold text-gray-900">{v.plate}</span>}
                          <span className="inline-block bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full">{v.type}</span>
                        </div>
                        <div className="text-gray-500 text-xs truncate">{v.location}</div>
                        <div className="text-gray-400 text-xs mt-0.5">
                          {submittedAt.toLocaleString('en-US', { timeZone: PT_ZONE })}
                        </div>
                      </div>
                      <div className="shrink-0">
                        <span className={`inline-block px-3 py-1.5 rounded-lg font-bold text-sm tracking-wide ${
                          isRecent ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {ago}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Link>
      </div>

      {/* Visitor Abuse Alerts */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-8">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">🚨 {t('alerts')}</h2>
          <Link href="/admin/alerts" className="text-sm text-blue-600 hover:underline font-medium">
            {t('view_all')} →
          </Link>
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
                  <tr key={alert.id} className="hover:bg-red-50">
                    <td className="px-6 py-4 font-mono font-semibold">
                      {alert.license_plate}
                      {alert.plate_state && <span className="ml-1 text-xs text-gray-500 font-normal">({alert.plate_state})</span>}
                    </td>
                    <td className="px-6 py-4">{alert.month}</td>
                    <td className="px-6 py-4 text-xs text-gray-600">{alert.units_involved?.join(', ')}</td>
                    <td className="px-6 py-4">{alert.count}</td>
                    <td className="px-6 py-4">
                      <ResolveAlertButton alertId={alert.id} label={t('mark_resolved')} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Overdue Registrations */}
      {overdueVehicles.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-amber-200 mb-8">
          <div className="px-6 py-4 border-b border-amber-100 bg-amber-50 rounded-t-xl flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-amber-900">⚠️ {t('overdue_vehicles')}</h2>
              <p className="text-sm text-amber-700 mt-0.5">{t('overdue_desc')}</p>
            </div>
            <Link href="/admin/residents" className="text-sm text-amber-700 hover:underline font-medium shrink-0 ml-4">
              {t('view_all')} →
            </Link>
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
                      <div className="text-xs text-gray-600">{v.owner_email}</div>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{[v.color, v.make, v.model].filter(Boolean).join(' ')}</td>
                    <td className="px-6 py-3 font-mono font-semibold text-gray-800">{v.license_plate}</td>
                    <td className="px-6 py-3 text-red-600 font-medium">{formatPDT(v.created_at, { dateOnly: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
