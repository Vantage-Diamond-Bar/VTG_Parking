'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

interface Alert {
  id: string;
  license_plate: string;
  plate_state: string;
  month: string;
  units_involved: string[];
  count: number;
  created_at: string;
  resolved: boolean;
  resolved_at?: string;
}

type Tab = 'unresolved' | 'all';

export default function AdminAlertsPage() {
  const t = useTranslations('admin');
  const [tab, setTab] = useState<Tab>('unresolved');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab === 'unresolved') params.set('resolved', 'false');
      const res = await fetch(`/api/admin/alerts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(Array.isArray(data) ? data : data.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const markResolved = async (id: string) => {
    const res = await fetch(`/api/admin/alerts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved: true }),
    });
    if (res.ok) fetchAlerts();
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('alerts')}</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('unresolved')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'unresolved'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('unresolved')}
        </button>
        <button
          onClick={() => setTab('all')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'all'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('all')}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-6 py-3 text-left">{t('license_plate')}</th>
                <th className="px-6 py-3 text-left">{t('month')}</th>
                <th className="px-6 py-3 text-left">{t('units_involved')}</th>
                <th className="px-6 py-3 text-left">{t('count')}</th>
                <th className="px-6 py-3 text-left">{t('created')}</th>
                <th className="px-6 py-3 text-left">{t('status')}</th>
                <th className="px-6 py-3 text-left">{t('action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-400">{t('loading')}</td>
                </tr>
              ) : alerts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-400">{t('no_alerts')}</td>
                </tr>
              ) : (
                alerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-mono font-bold">
                      {alert.license_plate}
                      {alert.plate_state && <span className="ml-1 text-xs text-gray-400 font-normal">({alert.plate_state})</span>}
                    </td>
                    <td className="px-6 py-4">{alert.month}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {alert.units_involved?.join(', ')}
                    </td>
                    <td className="px-6 py-4 font-semibold">{alert.count}</td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(alert.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          alert.resolved
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {alert.resolved ? t('resolved') : t('unresolved')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {!alert.resolved && (
                        <button
                          onClick={() => markResolved(alert.id)}
                          className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                        >
                          {t('mark_resolved')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
