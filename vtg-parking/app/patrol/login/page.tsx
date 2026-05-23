'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import BrandName from '@/components/BrandName';

interface LoginFormData {
  username: string;
  password: string;
}

export default function PatrolLoginPage() {
  const tPatrol = useTranslations('patrol');
  const tAdmin = useTranslations('admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit } = useForm<LoginFormData>();

  const onSubmit = async (data: LoginFormData) => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/patrol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.role === 'patrol' || json.role === 'admin') {
          window.location.href = '/patrol';
        } else {
          setError(tAdmin('invalid_credentials'));
        }
      } else {
        setError(tAdmin('invalid_credentials'));
      }
    } catch {
      setError(tAdmin('invalid_credentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <BrandName size="1.5rem" />
          <p className="text-gray-500 mt-2 text-sm">{tPatrol('login_subtitle')}</p>
        </div>

        <h2 className="text-xl font-semibold text-gray-800 mb-6 text-center">{tPatrol('login')}</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {tAdmin('username')}
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
              {tAdmin('password')}
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
            {loading ? tAdmin('signing_in') : tAdmin('sign_in')}
          </button>
        </form>

        <div className="mt-5 text-center">
          <a href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
            <span>←</span> Return to Home
          </a>
        </div>
      </div>
    </div>
  );
}
