'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { formatPDT } from '@/lib/utils';
import BrandName from '@/components/BrandName';

type SearchTab = 'plate' | 'code';

interface ResultItem {
  type: 'resident' | 'visitor' | 'vacation';
  address?: string;
  owner_name?: string;
  guest_name?: string;
  year?: string | number;
  make?: string;
  model?: string;
  color?: string;
  plate?: string;
  state?: string;
  valid_from?: string;
  valid_until?: string;
  access_code?: string;
  status?: 'active' | 'expired' | 'upcoming';
  message?: string;
  approval_status?: string;
  is_oversized?: boolean;
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

  const [plate, setPlate] = useState('');
  const [plateState, setPlateState] = useState('');
  const [code, setCode] = useState('');

  const [results, setResults] = useState<ResultItem[]>([]);
  const [unitVehicles, setUnitVehicles] = useState<ResultItem[]>([]);
  const [unitVacations, setUnitVacations] = useState<ResultItem[]>([]);
  const [unitVisitors, setUnitVisitors] = useState<ResultItem[]>([]);
  const [searchedPlate, setSearchedPlate] = useState('');
  const [searchedCode, setSearchedCode] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/session');
        if (!res.ok || res.status === 401) { window.location.href = '/patrol/login'; return; }
        const data = await res.json();
        if (!data?.role) { window.location.href = '/patrol/login'; return; }
        setSessionChecked(true);
      } catch {
        window.location.href = '/patrol/login';
      }
    })();
  }, []);

  function resetResults() {
    setResults([]);
    setUnitVehicles([]);
    setUnitVacations([]);
    setUnitVisitors([]);
    setSearchedPlate('');
    setSearchedCode('');
    setNotFound(false);
    setError('');
  }

  const handlePlateSearch = async () => {
    if (!plate.trim()) return;
    setSearching(true);
    resetResults();
    const normalizedSearchPlate = plate.trim().toUpperCase().replace(/\s+/g, '');
    try {
      const params = new URLSearchParams({ plate: normalizedSearchPlate });
      if (plateState) params.set('state', plateState);
      const res = await fetch(`/api/patrol/lookup?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (data.found) {
          setResults(data.results ?? []);
          setUnitVehicles(data.unit_vehicles ?? []);
          setUnitVacations(data.unit_vacations ?? []);
          setUnitVisitors(data.unit_visitors ?? []);
          setSearchedPlate(normalizedSearchPlate);
        } else {
          setNotFound(true);
        }
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
    resetResults();
    const normalizedCode = code.trim().toUpperCase();
    try {
      const res = await fetch(`/api/patrol/lookup?code=${normalizedCode}`);
      if (res.ok) {
        const data = await res.json();
        if (data.found) {
          setResults(data.results ?? []);
          setUnitVehicles(data.unit_vehicles ?? []);
          setUnitVacations(data.unit_vacations ?? []);
          setUnitVisitors(data.unit_visitors ?? []);
          setSearchedCode(normalizedCode);
        } else {
          setNotFound(true);
        }
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

  /** True if this compact-list item matches the current search query */
  const isThisVehicle = (item: ResultItem) => {
    if (searchedPlate && item.plate?.toUpperCase().replace(/\s+/g, '') === searchedPlate) return true;
    if (searchedCode && item.access_code?.toUpperCase() === searchedCode) return true;
    return false;
  };

  const renderCard = (item: ResultItem, index: number) => {
    if (item.type === 'resident') {
      if (item.approval_status === 'pending') {
        return (
          <div key={index} className="bg-orange-50 border-2 border-orange-400 rounded-xl p-6 mt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🚛</span>
                <h2 className="text-xl font-bold text-orange-800">{t('resident_vehicle')}</h2>
              </div>
              <span className="inline-block bg-orange-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                RESIDENT VEHICLE
              </span>
            </div>
            <div className="bg-orange-400 text-white rounded-lg px-4 py-3 mb-4 flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <span className="font-bold text-sm uppercase tracking-wide">OVERSIZED — SUBJECT TO APPROVAL</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-orange-700 font-medium">{t('unit')}:</span> <span className="font-semibold">{item.address}</span></div>
              <div><span className="text-orange-700 font-medium">{t('owner')}:</span> <span className="font-semibold">{item.owner_name}</span></div>
              <div><span className="text-orange-700 font-medium">{t('vehicle')}:</span> <span className="font-semibold">{[item.year, item.make, item.model].filter(Boolean).join(' ')}</span></div>
              <div><span className="text-orange-700 font-medium">{t('color')}:</span> <span className="font-semibold">{item.color}</span></div>
              <div><span className="text-orange-700 font-medium">{t('plate')}:</span> <span className="font-mono font-bold text-orange-900">{item.plate}{item.state ? ` / ${item.state}` : ''}</span></div>
            </div>
          </div>
        );
      }
      if (item.is_oversized) {
        return (
          <div key={index} className="bg-emerald-50 border-2 border-emerald-500 rounded-xl p-6 mt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🚛</span>
                <h2 className="text-xl font-bold text-emerald-900">{t('resident_vehicle')}</h2>
              </div>
              <span className="inline-block bg-emerald-700 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                RESIDENT VEHICLE
              </span>
            </div>
            <div className="bg-emerald-600 text-white rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">✅</span>
                <span className="font-bold text-sm uppercase tracking-wide">APPROVED OVERSIZED VEHICLE</span>
              </div>
              <span className="text-emerald-200 text-xs font-semibold">PERMITTED</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-emerald-700 font-medium">{t('unit')}:</span> <span className="font-semibold">{item.address}</span></div>
              <div><span className="text-emerald-700 font-medium">{t('owner')}:</span> <span className="font-semibold">{item.owner_name}</span></div>
              <div><span className="text-emerald-700 font-medium">{t('vehicle')}:</span> <span className="font-semibold">{[item.year, item.make, item.model].filter(Boolean).join(' ')}</span></div>
              <div><span className="text-emerald-700 font-medium">{t('color')}:</span> <span className="font-semibold">{item.color}</span></div>
              <div><span className="text-emerald-700 font-medium">{t('plate')}:</span> <span className="font-mono font-bold text-emerald-900">{item.plate}{item.state ? ` / ${item.state}` : ''}</span></div>
            </div>
          </div>
        );
      }
      return (
        <div key={index} className="bg-blue-50 border-2 border-blue-300 rounded-xl p-6 mt-4">
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
            <div><span className="text-blue-600 font-medium">{t('unit')}:</span> <span className="font-semibold">{item.address}</span></div>
            <div><span className="text-blue-600 font-medium">{t('owner')}:</span> <span className="font-semibold">{item.owner_name}</span></div>
            <div><span className="text-blue-600 font-medium">{t('vehicle')}:</span> <span className="font-semibold">{[item.year, item.make, item.model].filter(Boolean).join(' ')}</span></div>
            <div><span className="text-blue-600 font-medium">{t('color')}:</span> <span className="font-semibold">{item.color}</span></div>
            <div><span className="text-blue-600 font-medium">{t('plate')}:</span> <span className="font-mono font-bold text-blue-900">{item.plate}{item.state ? ` / ${item.state}` : ''}</span></div>
          </div>
        </div>
      );
    }

    if (item.type === 'visitor') {
      const isExpired = item.status === 'expired';
      const c = isExpired ? 'red' : 'green';
      return (
        <div key={index} className={`bg-${c}-50 border-2 border-${c}-300 rounded-xl p-6 mt-4`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{isExpired ? '⛔' : '✅'}</span>
              <h2 className={`text-xl font-bold text-${c}-800`}>{t('visitor_vehicle')}</h2>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`inline-block bg-${c}-700 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide`}>
                VISITOR VEHICLE
              </span>
              {getStatusBadge(item.status)}
            </div>
          </div>
          {item.access_code && (
            <div className={`bg-${c}-100 border border-${c}-200 rounded-lg px-4 py-2 mb-3 text-center`}>
              <span className={`text-xs font-bold text-${c}-600 uppercase`}>Access Code: </span>
              <span className={`font-mono font-bold text-${c}-900 tracking-widest text-lg`}>{item.access_code}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className={`text-${c}-600 font-medium`}>{t('unit')}:</span> <span className="font-semibold">{item.address}</span></div>
            {item.guest_name && (
              <div><span className={`text-${c}-600 font-medium`}>{t('guest_name')}:</span> <span className="font-semibold">{item.guest_name}</span></div>
            )}
            <div><span className={`text-${c}-600 font-medium`}>{t('plate')}:</span> <span className="font-mono font-bold">{item.plate}{item.state ? ` / ${item.state}` : ''}</span></div>
            <div><span className={`text-${c}-600 font-medium`}>{t('vehicle')}:</span> <span className="font-semibold">{[item.make, item.model, item.color].filter(Boolean).join(' ')}</span></div>
            {item.valid_from && (
              <div><span className={`text-${c}-600 font-medium`}>{t('valid_from')}:</span> <span className="font-semibold">{formatPDT(item.valid_from, { short: true })}</span></div>
            )}
            {item.valid_until && (
              <div><span className={`text-${c}-600 font-medium`}>{t('valid_until')}:</span> <span className="font-semibold">{formatPDT(item.valid_until, { short: true })}</span></div>
            )}
          </div>
        </div>
      );
    }

    if (item.type === 'vacation') {
      const isExpired = item.status === 'expired';
      const isUpcoming = item.status === 'upcoming';
      const c = isExpired ? 'red' : isUpcoming ? 'yellow' : 'purple';
      return (
        <div key={index} className={`bg-${c}-50 border-2 border-${c}-300 rounded-xl p-6 mt-4`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏖️</span>
              <h2 className={`text-xl font-bold text-${c}-800`}>{t('vacation_vehicle')}</h2>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`inline-block bg-${c}-700 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide`}>
                VACATION PARKING
              </span>
              {getStatusBadge(item.status)}
            </div>
          </div>
          {item.access_code && (
            <div className={`bg-${c}-100 border border-${c}-200 rounded-lg px-4 py-2 mb-3 text-center`}>
              <span className={`text-xs font-bold text-${c}-600 uppercase`}>{t('access_code')}: </span>
              <span className={`font-mono font-bold text-${c}-900 tracking-widest text-lg`}>{item.access_code}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className={`text-${c}-600 font-medium`}>{t('unit')}:</span> <span className="font-semibold">{item.address}</span></div>
            <div><span className={`text-${c}-600 font-medium`}>{t('owner')}:</span> <span className="font-semibold">{item.owner_name}</span></div>
            <div><span className={`text-${c}-600 font-medium`}>{t('vehicle')}:</span> <span className="font-semibold">{[item.year, item.make, item.model].filter(Boolean).join(' ')}</span></div>
            <div><span className={`text-${c}-600 font-medium`}>{t('color')}:</span> <span className="font-semibold">{item.color}</span></div>
            <div><span className={`text-${c}-600 font-medium`}>{t('plate')}:</span> <span className="font-mono font-bold">{item.plate}{item.state ? ` / ${item.state}` : ''}</span></div>
            {item.valid_from && (
              <div><span className={`text-${c}-600 font-medium`}>{t('valid_from')}:</span> <span className="font-semibold">{formatPDT(item.valid_from, { short: true })}</span></div>
            )}
            {item.valid_until && (
              <div><span className={`text-${c}-600 font-medium`}>{t('valid_until')}:</span> <span className="font-semibold">{formatPDT(item.valid_until, { short: true })}</span></div>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex flex-col justify-center">
          <BrandName size="1.1rem" />
          <span className="text-xs text-gray-500 mt-0.5 leading-none">{t('patrol_lookup')}</span>
        </div>
        <div className="flex items-center gap-2">
          <a href="/" className="text-sm text-gray-500 hover:text-gray-800 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">🏠</a>
          <a href="/admin/dashboard" className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors shadow-sm">
            <span>🔐</span><span>Admin Portal</span>
          </a>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-800 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">{t('logout')}</button>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-10">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-200 rounded-lg p-1">
          <button
            onClick={() => { setTab('plate'); resetResults(); }}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'plate' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t('tab_plate')}
          </button>
          <button
            onClick={() => { setTab('code'); resetResults(); }}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'code' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
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
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
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
        {error && <p className="text-red-600 text-sm text-center mt-4">{error}</p>}

        {/* Not found */}
        {notFound && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6 mt-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">❌</span>
              <h2 className="text-xl font-bold text-red-800">{t('not_found')}</h2>
            </div>
            <p className="text-red-600 text-sm">{t('not_found_desc')}</p>
          </div>
        )}

        {/* Results — primary match card(s) */}
        {results.map((item, i) => renderCard(item, i))}

        {/* Vacation parking records for this unit — last month onwards */}
        {unitVacations.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">
              Unit Vacation Parking — Last Month &amp; Upcoming
            </h3>
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              {unitVacations.map((v, i) => {
                const expired = v.status === 'expired';
                const upcoming = v.status === 'upcoming';
                const dot = expired ? 'bg-red-400' : upcoming ? 'bg-yellow-400' : 'bg-purple-400';
                const thisVeh = isThisVehicle(v);
                return (
                  <div key={i} className={`flex items-center gap-3 px-4 py-3 text-sm${thisVeh ? ' bg-purple-50' : ''}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs font-semibold text-gray-900 flex items-center gap-1.5 flex-wrap">
                        {v.plate}{v.state ? ` · ${v.state}` : ''}
                        {thisVeh && (
                          <span className="bg-purple-600 text-white text-xs font-bold px-1.5 py-0.5 rounded uppercase tracking-wide">
                            THIS VEHICLE
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {[v.make, v.model, v.color].filter(Boolean).join(' ')}
                        {v.owner_name ? ` · ${v.owner_name}` : ''}
                      </div>
                      {v.access_code && (
                        <div className="mt-1 inline-block bg-purple-100 border border-purple-200 rounded px-2 py-0.5">
                          <span className="text-xs font-bold text-purple-600 uppercase">Code: </span>
                          <span className="font-mono font-bold text-purple-900 tracking-widest text-xs">{v.access_code}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-right text-xs text-gray-400 shrink-0">
                      <div>{formatPDT(v.valid_from!, { short: true })}</div>
                      <div>→ {formatPDT(v.valid_until!, { short: true })}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* All resident vehicles registered to this unit */}
        {unitVehicles.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">
              All Resident Vehicles in This Unit
            </h3>
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              {unitVehicles.map((v, i) => {
                const thisVeh = isThisVehicle(v);
                const pendingOversized = v.is_oversized && v.approval_status === 'pending';
                const approvedOversized = v.is_oversized && v.approval_status === 'approved';
                return (
                  <div key={i} className={`flex items-center gap-3 px-4 py-3 text-sm${thisVeh ? ' bg-blue-50' : ''}`}>
                    <span className="text-lg">{v.is_oversized ? '🚛' : '🚗'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 flex items-center gap-1.5 flex-wrap">
                        {[v.year, v.color, v.make, v.model].filter(Boolean).join(' ')}
                        {thisVeh && (
                          <span className="bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded uppercase tracking-wide">
                            THIS VEHICLE
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 font-mono flex items-center gap-1.5 flex-wrap mt-0.5">
                        {v.plate}{v.state ? ` · ${v.state}` : ''}
                        {approvedOversized && (
                          <span className="bg-emerald-600 text-white text-xs font-bold px-1.5 py-0.5 rounded uppercase tracking-wide">
                            OVERSIZED ✓
                          </span>
                        )}
                        {pendingOversized && (
                          <span className="bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded uppercase tracking-wide">
                            OVERSIZED PENDING
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 shrink-0">{v.owner_name}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Visitor registrations for this unit — last month onwards */}
        {unitVisitors.length > 0 && (
          <div className="mt-4 mb-8">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">
              Unit Visitor Registrations — Last Month &amp; Upcoming
            </h3>
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              {unitVisitors.map((v, i) => {
                const expired = v.status === 'expired';
                const upcoming = v.status === 'upcoming';
                const dot = expired ? 'bg-red-400' : upcoming ? 'bg-yellow-400' : 'bg-green-400';
                const thisVeh = isThisVehicle(v);
                return (
                  <div key={i} className={`flex items-center gap-3 px-4 py-3 text-sm${thisVeh ? ' bg-green-50' : ''}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs font-semibold text-gray-900 flex items-center gap-1.5 flex-wrap">
                        {v.plate}{v.state ? ` · ${v.state}` : ''}
                        {thisVeh && (
                          <span className="bg-green-600 text-white text-xs font-bold px-1.5 py-0.5 rounded uppercase tracking-wide">
                            THIS VEHICLE
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {[v.make, v.model, v.color].filter(Boolean).join(' ')}
                        {v.guest_name ? ` · ${v.guest_name}` : ''}
                      </div>
                      {v.access_code && (
                        <div className="mt-1 inline-block bg-green-100 border border-green-200 rounded px-2 py-0.5">
                          <span className="text-xs font-bold text-green-600 uppercase">Code: </span>
                          <span className="font-mono font-bold text-green-900 tracking-widest text-xs">{v.access_code}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-right text-xs text-gray-400 shrink-0">
                      <div>{formatPDT(v.valid_from!, { short: true })}</div>
                      <div>→ {formatPDT(v.valid_until!, { short: true })}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
