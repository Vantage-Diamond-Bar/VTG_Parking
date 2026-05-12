'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';

interface LoginFormData {
  username: string;
  password: string;
}

export default function AdminLoginPage() {
  const t = useTranslations('admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit } = useForm<LoginFormData>();

  const onSubmit = async (data: LoginFormData) => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.role) {
          if (json.token) localStorage.setItem('vtg_admin_token', json.token);
          window.location.href = '/admin/dashboard';
        } else {
          setError(t('invalid_credentials'));
        }
      } else {
        setError(t('invalid_credentials'));
      }
    } catch {
      setError(t('invalid_credentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🅿️</div>
          <h1 className="text-2xl font-bold text-gray-900">VTG Parking</h1>
          <p className="text-gray-500 mt-1 text-sm">{t('login_subtitle')}</p>
        </div>

        <h2 className="text-xl font-semibold text-gray-800 mb-6 text-center">{t('login')}</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('username')}
            </label>
            <input
              {...register('username', { required: true })}
              type="text"
              autoComplete="username"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('password')}
            </label>
            <input
              {...register('password', { required: true })}
              type="password"
              autoComplete="current-password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
          >
            {loading ? t('signing_in') : t('sign_in')}
          </button>
        </form>
      </div>
    </div>
  );
}
