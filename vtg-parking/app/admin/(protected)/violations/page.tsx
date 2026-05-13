'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { VIOLATION_TYPES, VIOLATION_LOCATIONS } from '@/lib/utils';

interface HistoryItem {
  id: string;
  submitted_at: string;
  violation_type: string;
  status: string;
  resolution_type?: string;
  final_license_plate?: string;
  license_plate?: string;
}

interface Violation {
  id: string;
  submitted_at: string;
  location: string;
  violation_type: string;
  license_plate?: string;
  description?: string;
  photo_urls?: string[];
  reporter_email?: string;
  unit_address?: string;
  status: string;
  resolution_type?: string;
  admin_notes?: string;
  call_hearing?: boolean;
  processed_at?: string;
  final_license_plate?: string;
  final_violation_type?: string;
  final_location?: string;
  violation_history?: HistoryItem[];
}

type Tab = 'pending' | 'no_action' | 'resolved' | 'all';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  no_action: 'bg-gray-100 text-gray-600',
  resolved: 'bg-green-100 text-green-800',
};

const NO_ACTION_OPTIONS = [
  'no_action_unknown_gone',
  'no_action_verified_ok',
  'no_action_other',
];

const RESOLVED_OPTIONS = [
  'res_courtesy_notice',
  'res_citation_warning',
  'res_tow_3rd_offense',
  'res_immediate_tow',
  'res_other',
];

export default function AdminViolationsPage() {
  const t = useTranslations('admin');
  const [tab, setTab] = useState<Tab>('pending');
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [photoModal, setPhotoModal] = useState<string[] | null>(null);
  const [viewViolation, setViewViolation] = useState<Violation | null>(null);

  // Modal edit state
  const [editPlate, setEditPlate] = useState('');
  const [editType, setEditType] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [plateLoading, setPlateLoading] = useState(false);
  const [plateResult, setPlateResult] = useState<{ unit_address: string | null; source?: string } | null>(null);
  const [resolution, setResolution] = useState<'no_action' | 'resolved' | ''>('');
  const [resolutionType, setResolutionType] = useState('');
  const [callHearing, setCallHearing] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchViolations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab !== 'all') params.set('status', tab);
      params.set('limit', '100');
      const res = await fetch(`/api/admin/violations?${params}`);
      const json = await res.json();
      if (res.ok) setViolations(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { fetchViolations(); }, [fetchViolations]);

  // Client-side search filtering
  const filteredViolations = useMemo(() => {
    if (!search.trim()) return violations;
    const q = search.trim().toLowerCase();
    return violations.filter((v) => {
      return (
        (v.unit_address ?? '').toLowerCase().includes(q) ||
        (v.license_plate ?? '').toLowerCase().includes(q) ||
        (v.final_license_plate ?? '').toLowerCase().includes(q) ||
        (v.location ?? '').toLowerCase().includes(q) ||
        (v.final_location ?? '').toLowerCase().includes(q) ||
        (v.violation_type ?? '').toLowerCase().includes(q) ||
        (v.final_violation_type ?? '').toLowerCase().includes(q)
      );
    });
  }, [violations, search]);

  function openModal(v: Violation) {
    setViewViolation(v);
    setEditPlate(v.final_license_plate ?? v.license_plate ?? '');
    setEditType(v.final_violation_type ?? v.violation_type ?? '');
    setEditLocation(v.final_location ?? v.location ?? '');
    setResolution(v.status === 'pending' ? '' : v.status as any);
    setResolutionType(v.resolution_type ?? '');
    setCallHearing(v.call_hearing ?? false);
    setAdminNotes(v.admin_notes ?? '');
    setPlateResult(null);
  }

  async function lookupPlate() {
    if (!editPlate.trim()) return;
    setPlateLoading(true);
    try {
      const res = await fetch('/api/admin/violations/lookup-plate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate: editPlate }),
      });
      const json = await res.json();
      setPlateResult(json);
    } finally {
      setPlateLoading(false);
    }
  }

  async function handleSave() {
    if (!viewViolation) return;
    if (!resolution) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/violations/${viewViolation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: resolution,
          resolution_type: resolutionType || null,
          admin_notes: adminNotes || null,
          call_hearing: callHearing,
          final_license_plate: editPlate || null,
          final_violation_type: editType || null,
          final_location: editLocation || null,
        }),
      });
      if (res.ok) {
        setViewViolation(null);
        fetchViolations();
      }
    } finally {
      setSaving(false);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'pending', label: t('vio_tab_pending') },
    { key: 'no_action', label: t('vio_tab_no_action') },
    { key: 'resolved', label: t('vio_tab_resolved') },
    { key: 'all', label: t('vio_tab_all') },
  ];

  const resolutionOptions = resolution === 'no_action' ? NO_ACTION_OPTIONS : RESOLVED_OPTIONS;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('violations')}</h1>

      {/* Tabs + Search */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === tb.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('vio_search_placeholder')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              {t('vio_reset_search')}
            </button>
          )}
        </div>
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
                <th className="px-4 py-3 text-left">{t('photos')}</th>
                <th className="px-4 py-3 text-left">{t('reporter_email')}</th>
                <th className="px-4 py-3 text-left">{t('vio_unit_owner')}</th>
                <th className="px-4 py-3 text-left" style={{ minWidth: 220 }}>{t('vio_history')}</th>
                <th className="px-4 py-3 text-left">{t('status')}</th>
                <th className="px-4 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">{t('loading')}</td></tr>
              ) : filteredViolations.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">{t('no_results')}</td></tr>
              ) : filteredViolations.map((v) => (
                <tr key={v.id} className="hover:bg-gray-50 align-top">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                    {new Date(v.submitted_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[140px] truncate" title={v.final_location ?? v.location}>
                    {v.final_location ?? v.location}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
                      {v.final_violation_type ?? v.violation_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-xs">
                    {v.final_license_plate ?? v.license_plate ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    {v.photo_urls && v.photo_urls.length > 0 ? (
                      <button
                        onClick={() => setPhotoModal(v.photo_urls!)}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        {v.photo_urls.length} {t('photos_count')}
                      </button>
                    ) : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{v.reporter_email || '—'}</td>
                  <td className="px-4 py-3 text-xs font-medium text-gray-700">
                    {v.unit_address ? (
                      <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{v.unit_address}</span>
                    ) : '—'}
                  </td>
                  {/* Violation History — inline detail list */}
                  <td className="px-4 py-3 text-xs">
                    {v.violation_history && v.violation_history.length > 0 ? (
                      <div className="space-y-2">
                        {v.violation_history.slice(0, 4).map((h) => (
                          <div key={h.id} className="flex flex-col gap-0.5 border-l-2 border-gray-200 pl-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-gray-400 whitespace-nowrap font-mono">
                                {new Date(h.submitted_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[h.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                {h.status}
                              </span>
                            </div>
                            <span className="text-gray-700 leading-snug" style={{ maxWidth: 200 }}>{h.violation_type}</span>
                            {h.resolution_type && (
                              <span className="text-gray-400 italic leading-snug">{t(`vio_res_${h.resolution_type}`)}</span>
                            )}
                          </div>
                        ))}
                        {v.violation_history.length > 4 && (
                          <div className="text-gray-400 italic">+{v.violation_history.length - 4} more</div>
                        )}
                      </div>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[v.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {v.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openModal(v)}
                      className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1 rounded transition-colors"
                    >
                      {t('view')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Photo Viewer Modal */}
      {photoModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setPhotoModal(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">{t('violation_photos')}</h2>
              <button onClick={() => setPhotoModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {photoModal.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Photo ${i + 1}`} className="w-full rounded-lg object-cover border border-gray-100 hover:opacity-90 transition-opacity" />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Process Modal */}
      {viewViolation && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{t('vio_process_title')}</h2>
              <button onClick={() => setViewViolation(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="p-6 space-y-5">
              {/* Original info */}
              <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
                <div className="text-xs text-gray-500 mb-2">{t('vio_original_info')}</div>
                <div><span className="font-medium">{t('submitted')}:</span> {new Date(viewViolation.submitted_at).toLocaleString()}</div>
                <div><span className="font-medium">{t('location')}:</span> {viewViolation.location}</div>
                <div><span className="font-medium">{t('type')}:</span> {viewViolation.violation_type}</div>
                <div><span className="font-medium">{t('plate')}:</span> {viewViolation.license_plate || '—'}</div>
                {viewViolation.description && <div><span className="font-medium">{t('description')}:</span> {viewViolation.description}</div>}
                {viewViolation.reporter_email && <div><span className="font-medium">{t('reporter_email')}:</span> {viewViolation.reporter_email}</div>}
              </div>

              {/* Photos */}
              {viewViolation.photo_urls && viewViolation.photo_urls.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">{t('photos')}</div>
                  <div className="flex gap-2 flex-wrap">
                    {viewViolation.photo_urls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-20 w-20 object-cover rounded-lg border border-gray-200 hover:opacity-80" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Violation History in modal — full detail */}
              {viewViolation.violation_history && viewViolation.violation_history.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">
                    {t('vio_history')}
                    {viewViolation.unit_address && <span className="text-gray-400 font-normal ml-2">— {viewViolation.unit_address}</span>}
                    <span className="ml-2 text-xs text-gray-400">({viewViolation.violation_history.length} {t('vio_history_count')})</span>
                  </div>
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 text-xs max-h-48 overflow-y-auto">
                    {viewViolation.violation_history.map((h) => (
                      <div key={h.id} className="px-3 py-2.5 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-gray-700 leading-snug">{h.violation_type}</div>
                          {h.resolution_type && (
                            <div className="text-green-700 mt-0.5 italic">{t(`vio_res_${h.resolution_type}`)}</div>
                          )}
                          {(h.final_license_plate || h.license_plate) && (
                            <div className="text-gray-400 font-mono mt-0.5">{h.final_license_plate ?? h.license_plate}</div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[h.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {h.status}
                          </span>
                          <span className="text-gray-400 whitespace-nowrap">
                            {new Date(h.submitted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Editable fields */}
              <div className="space-y-3">
                <div className="text-sm font-semibold text-gray-800 border-t pt-4">{t('vio_edit_fields')}</div>

                {/* Plate + Verify */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">{t('plate')}</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editPlate}
                      onChange={(e) => { setEditPlate(e.target.value); setPlateResult(null); }}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                      placeholder="ABC1234"
                    />
                    <button
                      onClick={lookupPlate}
                      disabled={plateLoading}
                      className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {plateLoading ? '...' : t('vio_verify_plate')}
                    </button>
                  </div>
                  {plateResult !== null && (
                    <div className={`mt-1.5 text-xs px-3 py-1.5 rounded-lg ${plateResult.unit_address ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                      {plateResult.unit_address
                        ? `✓ ${plateResult.source === 'resident' ? t('vio_resident_vehicle') : t('vio_visitor_vehicle')}: ${plateResult.unit_address}`
                        : t('vio_plate_not_found')}
                    </div>
                  )}
                </div>

                {/* Violation Type */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">{t('type')}</label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">—</option>
                    {VIOLATION_TYPES.map((vt) => (
                      <option key={vt} value={vt}>{vt}</option>
                    ))}
                  </select>
                </div>

                {/* Location */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">{t('location')}</label>
                  <select
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">—</option>
                    {VIOLATION_LOCATIONS.map((loc) => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Resolution */}
              <div className="space-y-3 border-t pt-4">
                <div className="text-sm font-semibold text-gray-800">{t('vio_resolution')}</div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="resolution"
                      value="no_action"
                      checked={resolution === 'no_action'}
                      onChange={() => { setResolution('no_action'); setResolutionType(''); }}
                      className="text-blue-600"
                    />
                    <span className="text-sm">{t('vio_tab_no_action')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="resolution"
                      value="resolved"
                      checked={resolution === 'resolved'}
                      onChange={() => { setResolution('resolved'); setResolutionType(''); }}
                      className="text-blue-600"
                    />
                    <span className="text-sm">{t('vio_tab_resolved')}</span>
                  </label>
                </div>

                {/* Resolution sub-type dropdown — shown for both no_action and resolved */}
                {resolution !== '' && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">{t('vio_resolution_type')}</label>
                    <select
                      value={resolutionType}
                      onChange={(e) => setResolutionType(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— {t('vio_select_resolution')} —</option>
                      {resolutionOptions.map((r) => (
                        <option key={r} value={r}>{t(`vio_res_${r}`)}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Hearing checkbox */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={callHearing}
                    onChange={(e) => setCallHearing(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">{t('vio_call_hearing')}</span>
                </label>

                {/* Admin Notes */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">{t('vio_admin_notes')}</label>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={3}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder={t('vio_notes_placeholder')}
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setViewViolation(null)}
                className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !resolution}
                className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? t('vio_saving') : t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
