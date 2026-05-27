'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import BrandName from '@/components/BrandName';

type LoginStep = 'password' | 'otp';

export default function AdminLoginPage() {
  const t = useTranslations('admin');

  // ── Step 1: password ─────────────────────────────────────────────────────
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // ── Step 2: OTP ──────────────────────────────────────────────────────────
  const [step, setStep]           = useState<LoginStep>('password');
  const [emailHint, setEmailHint] = useState('');
  const [otpCode, setOtpCode]     = useState('');

  // ── UI state ─────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // ── Helpers ───────────────────────────────────────────────────────────────
  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json.error === 'no_email') {
          setError('No email address configured for this account. Contact the system administrator.');
        } else {
          setError(t('invalid_credentials'));
        }
        return;
      }

      if (json.status === 'otp_sent') {
        setEmailHint(json.email_hint ?? '');
        setOtpCode('');
        setStep('otp');
      } else if (json.status === 'rate_limited') {
        setError('Too many verification attempts. Please wait 10 minutes and try again.');
      } else {
        setError(t('invalid_credentials'));
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, otp: otpCode.trim() }),
      });
      const json = await res.json();

      if (res.ok && json.ok) {
        window.location.href = '/admin/dashboard';
        return;
      }

      if (json.status === 'too_many_attempts') {
        setError('Too many incorrect codes. This code has been invalidated. Please request a new one.');
        setStep('password');
        setOtpCode('');
      } else if (json.status === 'invalid') {
        setError('Incorrect verification code. Please try again.');
      } else {
        setError('Verification failed. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    setOtpCode('');
    setError('');
    // Re-trigger step 1 flow
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const json = await res.json();
      if (json.status === 'otp_sent') {
        setEmailHint(json.email_hint ?? emailHint);
      } else if (json.status === 'rate_limited') {
        setError('Too many verification attempts. Please wait 10 minutes and try again.');
      } else if (!res.ok) {
        setError(t('invalid_credentials'));
        setStep('password');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <BrandName size="1.5rem" />
          <p className="text-gray-500 mt-2 text-sm">{t('login_subtitle')}</p>
        </div>

        <h2 className="text-xl font-semibold text-gray-800 mb-6 text-center">{t('login')}</h2>

        {/* ── Step 1: Username + Password ─────────────────────────────── */}
        {step === 'password' && (
          <form onSubmit={sendOtp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('username')}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className={inputCls}
              />
            </div>

            {error && <p className="text-red-600 text-sm text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading || !username.trim() || !password}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
            >
              {loading ? 'Sending verification code…' : 'Continue'}
            </button>
          </form>
        )}

        {/* ── Step 2: OTP Input ───────────────────────────────────────── */}
        {step === 'otp' && (
          <form onSubmit={verifyOtp} className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
              <p className="font-semibold mb-1">📧 Check your email</p>
              <p>
                A 6-digit verification code was sent to{' '}
                <span className="font-mono font-bold">{emailHint}</span>.
                It expires in 10 minutes.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Verification Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && otpCode.length === 6 && verifyOtp(e as any)}
                placeholder="000000"
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono tracking-widest text-center text-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && <p className="text-red-600 text-sm text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading || otpCode.length < 6}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
            >
              {loading ? 'Verifying…' : 'Verify & Sign In'}
            </button>

            <div className="flex items-center justify-between text-sm pt-1">
              <button
                type="button"
                onClick={() => { setStep('password'); setError(''); setOtpCode(''); }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={resendOtp}
                disabled={loading}
                className="text-blue-600 hover:underline disabled:opacity-50"
              >
                Resend code
              </button>
            </div>
          </form>
        )}

        {/* ── Patrol Portal shortcut ──────────────────────────────── */}
        <div className="mt-6">
          <div className="relative flex items-center mb-4">
            <div className="flex-grow border-t border-gray-200" />
            <span className="mx-3 text-xs text-gray-400 whitespace-nowrap">or</span>
            <div className="flex-grow border-t border-gray-200" />
          </div>
          <a
            href="/patrol"
            className="flex items-center justify-between w-full bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl px-4 py-3 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🚔</span>
              <div className="text-left">
                <p className="text-sm font-semibold text-amber-900">Patrol Portal</p>
                <p className="text-xs text-amber-700">Vehicle lookup &amp; access code check</p>
              </div>
            </div>
            <span className="text-amber-400 group-hover:text-amber-600 transition-colors text-lg">→</span>
          </a>
        </div>

        <div className="mt-4 text-center">
          <a href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
            <span>←</span> Return to Home
          </a>
        </div>
      </div>
    </div>
  );
}
