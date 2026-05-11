'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';

interface NotificationEmail {
  id: string;
  email: string;
  label: string;
  active: boolean;
}

interface AddEmailFormData {
  email: string;
  label: string;
}

export default function AdminEmailsPage() {
  const t = useTranslations('admin');
  const [emails, setEmails] = useState<NotificationEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const { register, handleSubmit, reset } = useForm<AddEmailFormData>();

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/emails');
      if (res.ok) {
        const data = await res.json();
        setEmails(Array.isArray(data) ? data : data.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, []);

  const onAddSubmit = async (data: AddEmailFormData) => {
    setSubmitError('');
    const res = await fetch('/api/admin/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      reset();
      fetchEmails();
    } else {
      const body = await res.json().catch(() => ({}));
      setSubmitError(`Error ${res.status}: ${body.error ?? 'Unknown error'}`);
    }
  };

  const toggleActive = async (entry: NotificationEmail) => {
    const res = await fetch(`/api/admin/emails/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !entry.active }),
    });
    if (res.ok) fetchEmails();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirm_delete'))) return;
    const res = await fetch(`/api/admin/emails/${id}`, { method: 'DELETE' });
    if (res.ok) fetchEmails();
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('emails')}</h1>

      {/* Add Email Form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('add_email')}</h2>
        <form onSubmit={handleSubmit(onAddSubmit)} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('email')}</label>
            <input
              {...register('email', { required: true })}
              type="email"
              placeholder="notify@example.com"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('label')}</label>
            <input
              {...register('label', { required: true })}
              placeholder={t('email_label_placeholder')}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('add')}
          </button>
        </form>
        {submitError && (
          <p className="mt-2 text-sm text-red-600">{submitError}</p>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-6 py-3 text-left">{t('email')}</th>
                <th className="px-6 py-3 text-left">{t('label')}</th>
                <th className="px-6 py-3 text-left">{t('status')}</th>
                <th className="px-6 py-3 text-left">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-400">{t('loading')}</td>
                </tr>
              ) : emails.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-400">{t('no_results')}</td>
                </tr>
              ) : (
                emails.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">{entry.email}</td>
                    <td className="px-6 py-4 text-gray-600">{entry.label}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          entry.active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {entry.active ? t('active') : t('inactive')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleActive(entry)}
                          className="text-xs border border-gray-300 px-2 py-1 rounded hover:bg-gray-50 transition-colors"
                        >
                          {entry.active ? t('deactivate') : t('activate')}
                        </button>
                        <button
                          onClick={() => handleDelete(entry.id)}
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
      </div>
    </div>
  );
}
