'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { formatPDT } from '@/lib/utils';

interface Visitor {
  id: string;
  access_code: string;
  units?: { address: string };
  visitor_name?: string;
  visitor_phone?: string;
  visitor_phone_country_code?: string;
  license_plate: string;
  plate_state: string;
  make?: string;
  model?: string;
  color?: string;
  start_datetime: string;
  end_datetime: string;
  created_at: string;
}

export default function AdminVisitorsPage() {
  const t = useTranslations('admin');
  const [keyword, setKeyword] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const fetchVisitors = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      params.set('limit', '500');
      const res = await fetch(`/api/visitors?${params}`, { credentials: 'include' });
      const json = await res.json();
      if (res.ok) {
        setVisitors(Array.isArray(json) ? json : json.data ?? []);
      } else {
        console.error('Visitors fetch error:', json);
      }
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  // Client-side keyword filter: address, plate, access code, make/model/color, name
  const filteredVisitors = keyword.trim()
    ? visitors.filter((v) => {
        const kw = keyword.trim().toLowerCase();
        return (
          v.access_code?.toLowerCase().includes(kw) ||
          v.units?.address?.toLowerCase().includes(kw) ||
          v.license_plate?.toLowerCase().includes(kw) ||
          v.plate_state?.toLowerCase().includes(kw) ||
          v.visitor_name?.toLowerCase().includes(kw) ||
          v.make?.toLowerCase().includes(kw) ||
          v.model?.toLowerCase().includes(kw) ||
          v.color?.toLowerCase().includes(kw)
        );
      })
    : visitors;

  useEffect(() => {
    fetchVisitors();
  }, [fetchVisitors]);

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/visitors/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
      setDeleteTarget(null);
      fetchVisitors();
    }
  };

  const exportData = (format: 'csv' | 'excel') => {
    const params = new URLSearchParams();
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    params.set('format', format);
    window.open(`/api/visitors/export?${params}`, '_blank');
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('visitors')}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => exportData('csv')}
            className="text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t('export_csv')}
          </button>
          <button
            onClick={() => exportData('excel')}
            className="text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t('export_excel')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5 bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchVisitors()}
          placeholder={t('search_visitors_placeholder')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[220px]"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">{t('from')}</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">{t('to')}</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={fetchVisitors}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          {t('search')}
        </button>
        {keyword && (
          <span className="self-center text-xs text-gray-500">
            {filteredVisitors.length} / {visitors.length} {t('results')}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">{t('access_code')}</th>
                <th className="px-4 py-3 text-left">{t('unit')}</th>
                <th className="px-4 py-3 text-left">{t('guest_name')}</th>
                <th className="px-4 py-3 text-left">{t('phone')}</th>
                <th className="px-4 py-3 text-left">{t('plate_state')}</th>
                <th className="px-4 py-3 text-left">{t('vehicle')}</th>
                <th className="px-4 py-3 text-left">{t('valid_from')}</th>
                <th className="px-4 py-3 text-left">{t('valid_until')}</th>
                <th className="px-4 py-3 text-left">{t('created')}</th>
                <th className="px-4 py-3 text-left">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">{t('loading')}</td>
                </tr>
              ) : filteredVisitors.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">{t('no_results')}</td>
                </tr>
              ) : (
                filteredVisitors.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-bold tracking-widest text-blue-700">{v.access_code}</td>
                    <td className="px-4 py-3">{v.units?.address ?? '—'}</td>
                    <td className="px-4 py-3">{v.visitor_name || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {v.visitor_phone ? (
                        <>
                          {v.visitor_phone_country_code && <span className="text-gray-500 mr-1">{v.visitor_phone_country_code}</span>}
                          {v.visitor_phone}
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono">{v.license_plate} / {v.plate_state}</td>
                    <td className="px-4 py-3">{[v.make, v.model, v.color].filter(Boolean).join(' ')}</td>
                    <td className="px-4 py-3 text-gray-600">{formatPDT(v.start_datetime, { short: true })}</td>
                    <td className="px-4 py-3 text-gray-600">{formatPDT(v.end_datetime, { short: true })}</td>
                    <td className="px-4 py-3 text-gray-500">{formatPDT(v.created_at, { dateOnly: true })}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setDeleteTarget(v.id)}
                        className="text-xs bg-red-50 text-red-700 hover:bg-red-100 px-2 py-1 rounded transition-colors"
                      >
                        {t('delete')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('confirm_delete')}</h2>
            <p className="text-sm text-gray-600 mb-6">{t('confirm_delete_visitor')}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="text-sm bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
