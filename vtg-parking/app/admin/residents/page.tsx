'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';

interface Resident {
  id: string;
  unit_number: string;
  owner_name: string;
  year: string;
  make: string;
  model: string;
  color: string;
  plate: string;
  state: string;
  phone: string;
  email: string;
  doc_url?: string;
  registered_at: string;
  opt_in_email?: boolean;
  opt_in_sms?: boolean;
}

interface EditFormData {
  make: string;
  model: string;
  color: string;
  plate: string;
  state: string;
  phone: string;
  email: string;
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

  const { register, handleSubmit, reset } = useForm<EditFormData>();

  const fetchResidents = useCallback(async (q: string, pg: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('search', q);
      params.set('page', String(pg));
      params.set('limit', String(PAGE_SIZE));
      const res = await fetch(`/api/residents?${params}`);
      if (res.ok) {
        const data = await res.json();
        setResidents(Array.isArray(data) ? data : data.items ?? []);
        setTotal(Array.isArray(data) ? data.length : data.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
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
      plate: r.plate,
      state: r.state,
      phone: r.phone,
      email: r.email,
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

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('search_residents')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">{t('unit')}</th>
                <th className="px-4 py-3 text-left">{t('owner')}</th>
                <th className="px-4 py-3 text-left">{t('vehicle')}</th>
                <th className="px-4 py-3 text-left">{t('color')}</th>
                <th className="px-4 py-3 text-left">{t('plate_state')}</th>
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
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                    {t('loading')}
                  </td>
                </tr>
              ) : residents.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                    {t('no_results')}
                  </td>
                </tr>
              ) : (
                residents.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{r.unit_number}</td>
                    <td className="px-4 py-3">{r.owner_name}</td>
                    <td className="px-4 py-3">{[r.year, r.make, r.model].filter(Boolean).join(' ')}</td>
                    <td className="px-4 py-3">{r.color}</td>
                    <td className="px-4 py-3 font-mono">{r.plate} / {r.state}</td>
                    <td className="px-4 py-3">{r.phone}</td>
                    <td className="px-4 py-3 truncate max-w-[140px]">{r.email}</td>
                    <td className="px-4 py-3">
                      {r.doc_url ? (
                        <a
                          href={r.doc_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {t('view')}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(r.registered_at).toLocaleDateString()}
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
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <span className="text-xs text-gray-500">
            {t('page')} {page} / {totalPages}
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
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('edit_resident')}</h2>
            <form onSubmit={handleSubmit(onEditSubmit)} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
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
                  <input {...register('plate')} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('state')}</label>
                  <input {...register('state')} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('phone')}</label>
                  <input {...register('phone')} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('email')}</label>
                  <input {...register('email')} type="email" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" {...register('opt_in_email')} />
                  {t('opt_in_email')}
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" {...register('opt_in_sms')} />
                  {t('opt_in_sms')}
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

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('confirm_delete')}</h2>
            <p className="text-sm text-gray-600 mb-6">
              {t('confirm_delete_resident', { name: deleteTarget.owner_name })}
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
