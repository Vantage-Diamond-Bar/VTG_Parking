'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

interface Violation {
  id: string;
  created_at: string;
  location: string;
  violation_type: string;
  license_plate?: string;
  description?: string;
  photo_urls?: string[];
  reporter_email?: string;
}

export default function AdminViolationsPage() {
  const t = useTranslations('admin');
  const [location, setLocation] = useState('');
  const [type, setType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(false);
  const [photoModal, setPhotoModal] = useState<string[] | null>(null);

  const fetchViolations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (location) params.set('location', location);
      if (type) params.set('type', type);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const res = await fetch(`/api/admin/violations?${params}`);
      const json = await res.json();
      if (res.ok) {
        setViolations(Array.isArray(json) ? json : json.data ?? []);
      } else {
        console.error('Violations fetch error:', json);
      }
    } finally {
      setLoading(false);
    }
  }, [location, type, fromDate, toDate]);

  useEffect(() => {
    fetchViolations();
  }, [fetchViolations]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('violations')}</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5 bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={t('filter_location')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder={t('filter_type')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          onClick={fetchViolations}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          {t('search')}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">{t('submitted')}</th>
                <th className="px-4 py-3 text-left">{t('location')}</th>
                <th className="px-4 py-3 text-left">{t('type')}</th>
                <th className="px-4 py-3 text-left">{t('plate')}</th>
                <th className="px-4 py-3 text-left">{t('description')}</th>
                <th className="px-4 py-3 text-left">{t('photos')}</th>
                <th className="px-4 py-3 text-left">{t('reporter_email')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">{t('loading')}</td>
                </tr>
              ) : violations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">{t('no_results')}</td>
                </tr>
              ) : (
                violations.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {new Date(v.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">{v.location}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full">
                        {v.violation_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold">{v.license_plate || '—'}</td>
                    <td className="px-4 py-3 max-w-[200px] truncate text-gray-600" title={v.description}>
                      {v.description || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {v.photo_urls && v.photo_urls.length > 0 ? (
                        <button
                          onClick={() => setPhotoModal(v.photo_urls!)}
                          className="text-blue-600 hover:underline text-xs"
                        >
                          {v.photo_urls.length} {t('photos_count')}
                        </button>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{v.reporter_email || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Photo Viewer Modal */}
      {photoModal && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setPhotoModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">{t('violation_photos')}</h2>
              <button
                onClick={() => setPhotoModal(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {photoModal.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Photo ${i + 1}`}
                    className="w-full rounded-lg object-cover border border-gray-100 hover:opacity-90 transition-opacity"
                  />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
