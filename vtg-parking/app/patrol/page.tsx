'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

type SearchTab = 'plate' | 'code';

interface LookupResult {
  found: boolean;
  type?: 'resident' | 'visitor';
  address?: string;
  owner_name?: string;
  guest_name?: string;
  year?: string;
  make?: string;
  model?: string;
  color?: string;
  plate?: string;
  state?: string;
  valid_from?: string;
  valid_until?: string;
  status?: 'active' | 'expired' | 'not_yet_active';
  message?: string;
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  'DC',
];

export default function PatrolPage() {
  const t = useTranslations('patrol');
  const [sessionChecked, setSessionChecked] = useState(false);
  const [tab, setTab] = useState<SearchTab>('plate');

  // Plate search state
  const [plate, setPlate] = useState('');
  const [plateState, setPlateState] = useState('');

  // Code search state
  const [code, setCode] = useState('');

  const [result, setResult] = useState<LookupResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  // Check session on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/session');
        if (!res.ok || res.status === 401) {
          window.location.href = '/patrol/login';
          return;
        }
        const data = await res.json();
        if (!data || !data.role) {
          window.location.href = '/patrol/login';
          return;
        }
        setSessionChecked(true);
      } catch {
        window.location.href = '/patrol/login';
      }
    })();
  }, []);

  const handlePlateSearch = async () => {
    if (!plate.trim()) return;
    setSearching(true);
    setResult(null);
    setError('');
    try {
      const params = new URLSearchParams({ plate: plate.toUpperCase() });
      if (plateState) params.set('state', plateState);
      const res = await fetch(`/api/patrol/lookup?${params}`);
      if (res.ok) {
        setResult(await res.json());
      } else {
        setError(t('search_error'));
      }
    } catch {
      setError(t('search_error'));
    } finally {
      setSearching(false);
    }
  };

  const handleCodeSearch = async () => {
    if (!code.trim()) return;
    setSearching(true);
    setResult(null);
    setError('');
    try {
      const res = await fetch(`/api/patrol/lookup?code=${code.toUpperCase()}`);
      if (res.ok) {
        setResult(await res.json());
      } else {
        setError(t('search_error'));
      }
    } catch {
      setError(t('search_error'));
    } finally {
      setSearching(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout?role=patrol');
    window.location.href = '/patrol/login';
  };

  if (!sessionChecked) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500 text-sm">{t('loading')}</div>
      </div>
    );
  }

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'active':
        return <span className="inline-block bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">ACTIVE</span>;
      case 'expired':
        return <span className="inline-block bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">EXPIRED</span>;
      case 'upcoming':
        return <span className="inline-block bg-yellow-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">NOT YET ACTIVE</span>;
      default:
        return null;
    }
  };

  const getResultCard = () => {
    if (!result) return null;

    if (!result.found) {
      return (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6 mt-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">❌</span>
            <h2 className="text-xl font-bold text-red-800">{t('not_found')}</h2>
          </div>
          <p className="text-red-600 text-sm">{result.message || t('not_found_desc')}</p>
        </div>
      );
    }

    if (result.type === 'resident') {
      return (
        <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🚗</span>
              <h2 className="text-xl font-bold text-blue-800">{t('resident_vehicle')}</h2>
            </div>
            <span className="inline-block bg-blue-700 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
              RESIDENT VEHICLE
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-blue-600 font-medium">{t('unit')}:</span> <span className="font-semibold">{result.address}</span></div>
            <div><span className="text-blue-600 font-medium">{t('owner')}:</span> <span className="font-semibold">{result.owner_name}</span></div>
            <div><span className="text-blue-600 font-medium">{t('vehicle')}:</span> <span className="font-semibold">{[result.year, result.make, result.model].filter(Boolean).join(' ')}</span></div>
            <div><span className="text-blue-600 font-medium">{t('color')}:</span> <span className="font-semibold">{result.color}</span></div>
            <div><span className="text-blue-600 font-medium">{t('plate')}:</span> <span className="font-mono font-bold text-blue-900">{result.plate} / {result.state}</span></div>
          </div>
        </div>
      );
    }

    if (result.type === 'visitor') {
      const isExpired = result.status === 'expired';
      const cardColor = isExpired ? 'red' : 'green';
      return (
        <div className={`bg-${cardColor}-50 border-2 border-${cardColor}-300 rounded-xl p-6 mt-6`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{isExpired ? '⛔' : '✅'}</span>
              <h2 className={`text-xl font-bold text-${cardColor}-800`}>{t('visitor_vehicle')}</h2>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`inline-block bg-${cardColor}-700 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide`}>
                VISITOR VEHICLE
              </span>
              {getStatusBadge(result.status)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className={`text-${cardColor}-600 font-medium`}>{t('unit')}:</span> <span className="font-semibold">{result.address}</span></div>
            {result.guest_name && (
              <div><span className={`text-${cardColor}-600 font-medium`}>{t('guest_name')}:</span> <span className="font-semibold">{result.guest_name}</span></div>
            )}
            <div><span className={`text-${cardColor}-600 font-medium`}>{t('plate')}:</span> <span className="font-mono font-bold">{result.plate} / {result.state}</span></div>
            <div><span className={`text-${cardColor}-600 font-medium`}>{t('vehicle')}:</span> <span className="font-semibold">{[result.make, result.model, result.color].filter(Boolean).join(' ')}</span></div>
            {result.valid_from && (
              <div>
                <span className={`text-${cardColor}-600 font-medium`}>{t('valid_from')}:</span>{' '}
                <span className="font-semibold">{new Date(result.valid_from).toLocaleString()}</span>
              </div>
            )}
            {result.valid_until && (
              <div>
                <span className={`text-${cardColor}-600 font-medium`}>{t('valid_until')}:</span>{' '}
                <span className="font-semibold">{new Date(result.valid_until).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🅿️</span>
          <span className="text-lg font-bold text-gray-900">VTG Parking — {t('patrol_lookup')}</span>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-gray-800 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          {t('logout')}
        </button>
      </header>

      <main className="max-w-xl mx-auto px-4 py-10">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-200 rounded-lg p-1">
          <button
            onClick={() => { setTab('plate'); setResult(null); setError(''); }}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'plate' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('tab_plate')}
          </button>
          <button
            onClick={() => { setTab('code'); setResult(null); setError(''); }}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'code' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('tab_code')}
          </button>
        </div>

        {/* Search Panel */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          {tab === 'plate' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('license_plate')}</label>
                <input
                  type="text"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handlePlateSearch()}
                  placeholder="ABC1234"
                  maxLength={10}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('state_optional')}</label>
                <select
                  value={plateState}
                  onChange={(e) => setPlateState(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{t('any_state')}</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handlePlateSearch}
                disabled={searching || !plate.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-lg transition-colors text-sm"
              >
                {searching ? t('searching') : t('search')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('access_code')}</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleCodeSearch()}
                  placeholder="ABCDEF"
                  maxLength={6}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-lg font-mono tracking-[0.4em] uppercase text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleCodeSearch}
                disabled={searching || !code.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-lg transition-colors text-sm"
              >
                {searching ? t('searching') : t('search')}
              </button>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-600 text-sm text-center mt-4">{error}</p>
        )}

        {/* Result */}
        {getResultCard()}
      </main>
    </div>
  );
}
