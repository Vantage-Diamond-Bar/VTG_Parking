'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';

interface Resident {
  id: string;
  units?: { address: string };
  owner_name: string;
  registrant_type?: string;
  year: string;
  make: string;
  model: string;
  color: string;
  vehicle_type?: string;
  is_oversized?: boolean;
  license_plate: string;
  plate_state: string;
  owner_phone: string;
  owner_email: string;
  registration_doc_url?: string;
  created_at: string;
  opt_in_email?: boolean;
  opt_in_sms?: boolean;
}

interface EditFormData {
  make: string;
  model: string;
  color: string;
  license_plate: string;
  plate_state: string;
  owner_phone: string;
  owner_email: string;
  registrant_type: string;
  opt_in_email: boolean;
  opt_in_sms: boolean;
}

const PAGE_SIZE = 20;

export default function AdminResidentsPage() {
  const t = useTranslations('admin');
  const [search, setSearch] = useState('');
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [editTarget, setEditTarget] = useState<Resident | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Resident | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [docViewUrl, setDocViewUrl] = useState<string | null>(null);

  const { register, handleSubmit, reset } = useForm<EditFormData>();

  const fetchResidents = useCallback(async (q: string, pg: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('search', q);
      params.set('page', String(pg - 1));
      params.set('limit', String(PAGE_SIZE));
      const res = await fetch(`/api/residents?${params}`);
      if (res.ok) {
        const data = await res.json();
        setResidents(Array.isArray(data) ? data : data.data ?? []);
        setTotal(Array.isArray(data) ? data.length : data.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchResidents(search, 1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, fetchResidents]);

  useEffect(() => {
    fetchResidents(search, page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const openEdit = (r: Resident) => {
    setEditTarget(r);
    reset({
      make: r.make,
      model: r.model,
      color: r.color,
      license_plate: r.license_plate,
      plate_state: r.plate_state,
      owner_phone: r.owner_phone,
      owner_email: r.owner_email,
      registrant_type: r.registrant_type ?? 'owner',
      opt_in_email: r.opt_in_email ?? false,
      opt_in_sms: r.opt_in_sms ?? false,
    });
  };

  const onEditSubmit = async (data: EditFormData) => {
    if (!editTarget) return;
    const res = await fetch(`/api/residents/${editTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setEditTarget(null);
      fetchResidents(search, page);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const res = await fetch(`/api/residents/${deleteTarget.id}`, { method: 'DELETE' });
    if (res.ok) {
      setDeleteTarget(null);
      fetchResidents(search, page);
    }
    setDeleteLoading(false);
  };

  const exportData = (format: 'csv' | 'excel') => {
    window.open(`/api/residents/export?format=${format}`, '_blank');
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('residents')}</h1>
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

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('search')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">{t('unit')}</th>
                <th className="px-4 py-3 text-left">{t('owner')}</th>
                <th className="px-4 py-3 text-left">{t('registrant_type')}</th>
                <th className="px-4 py-3 text-left">{t('vehicle')}</th>
                <th className="px-4 py-3 text-left">{t('color')}</th>
                <th className="px-4 py-3 text-left">{t('plate')}/{t('state')}</th>
                <th className="px-4 py-3 text-left">{t('phone')}</th>
                <th className="px-4 py-3 text-left">{t('email')}</th>
                <th className="px-4 py-3 text-left">{t('doc')}</th>
                <th className="px-4 py-3 text-left">{t('registered')}</th>
                <th className="px-4 py-3 text-left">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                    {t('loading')}
                  </td>
                </tr>
              ) : residents.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                    {t('no_results')}
                  </td>
                </tr>
              ) : (
                residents.map((r) => {
                  const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                  const isExpired = new Date(r.created_at) < oneYearAgo;
                  return (
                  <tr key={r.id} className={isExpired ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}>
                    <td className="px-4 py-3 font-medium">{r.units?.address ?? '—'}</td>
                    <td className="px-4 py-3">{r.owner_name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${
                        r.registrant_type === 'tenant'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {r.registrant_type === 'tenant' ? 'Tenant' : 'Owner'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>{[r.year, r.make, r.model].filter(Boolean).join(' ')}</div>
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {r.vehicle_type && <span className="text-xs text-gray-500">{r.vehicle_type}</span>}
                        {r.is_oversized && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Oversized</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">{r.color}</td>
                    <td className="px-4 py-3 font-mono">{r.license_plate} / {r.plate_state}</td>
                    <td className="px-4 py-3">{r.owner_phone}</td>
                    <td className="px-4 py-3 truncate max-w-[140px]">{r.owner_email}</td>
                    <td className="px-4 py-3">
                      {r.registration_doc_url ? (
                        <button
                          onClick={() => setDocViewUrl(r.registration_doc_url!)}
                          className="text-blue-600 hover:underline text-sm"
                        >
                          {t('view')}
                        </button>
                      ) : '—'}
                    </td>
                    <td className={`px-4 py-3 ${isExpired ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
                      {isExpired && <span className="mr-1">⚠️</span>}
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(r)}
                          className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-2 py-1 rounded transition-colors"
                        >
                          {t('edit')}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(r)}
                          className="text-xs bg-red-50 text-red-700 hover:bg-red-100 px-2 py-1 rounded transition-colors"
                        >
                          {t('delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                )})
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <span className="text-xs text-gray-500">
            {t('prev') && `${page} / ${totalPages}`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-xs border border-gray-300 px-3 py-1.5 rounded disabled:opacity-40 hover:bg-gray-50"
            >
              {t('prev')}
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="text-xs border border-gray-300 px-3 py-1.5 rounded disabled:opacity-40 hover:bg-gray-50"
            >
              {t('next')}
            </button>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('edit')}</h2>
            <form onSubmit={handleSubmit(onEditSubmit)} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('registrant_type')}</label>
                  <select {...register('registrant_type')} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                    <option value="owner">Owner</option>
                    <option value="tenant">Tenant / Renter</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('make')}</label>
                  <input {...register('make')} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('model')}</label>
                  <input {...register('model')} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('color')}</label>
                  <input {...register('color')} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('plate')}</label>
                  <input {...register('license_plate')} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('state')}</label>
                  <input {...register('plate_state')} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('phone')}</label>
                  <input {...register('owner_phone')} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('email')}</label>
                  <input {...register('owner_email')} type="email" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" {...register('opt_in_email')} />
                  Email notifications
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" {...register('opt_in_sms')} />
                  SMS notifications
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Doc Viewer Modal */}
      {docViewUrl && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setDocViewUrl(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <span className="text-sm font-semibold text-gray-700">Registration Document</span>
              <div className="flex items-center gap-3">
                <a
                  href={docViewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 hover:underline"
                >
                  Open in new tab ↗
                </a>
                <button
                  onClick={() => setDocViewUrl(null)}
                  className="text-gray-500 hover:text-gray-700 text-xl leading-none"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2 bg-gray-100">
              {docViewUrl.match(/\.pdf(\?|$)/i) ? (
                <iframe
                  src={docViewUrl}
                  className="w-full h-full min-h-[70vh] rounded border-0"
                  title="Registration Document"
                />
              ) : (
                <img
                  src={docViewUrl}
                  alt="Registration Document"
                  className="max-w-full h-auto mx-auto rounded shadow block"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('confirm_delete')}</h2>
            <p className="text-sm text-gray-600 mb-6">
              {deleteTarget.owner_name} — {deleteTarget.license_plate}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="text-sm bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-60"
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
