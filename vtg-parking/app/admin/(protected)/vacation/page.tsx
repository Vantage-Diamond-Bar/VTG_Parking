'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'

interface UnitVehicle {
  id: string
  year: number
  make: string
  model: string
  color: string
  license_plate: string
  plate_state: string
  is_oversized: boolean
}

interface VacationRequest {
  id: string
  unit_id: string
  submitted_at: string
  status: 'pending' | 'approved' | 'rejected'
  registrant_type: string
  first_name: string
  last_name: string
  phone: string
  email: string | null
  reason: string | null
  emergency_first_name: string
  emergency_last_name: string
  emergency_phone: string
  start_datetime: string
  end_datetime: string
  year: number
  make: string
  model: string
  color: string
  license_plate: string
  plate_state: string
  is_registered_vehicle: boolean | null
  is_eligible: boolean | null
  access_code: string | null
  rejection_reason: string | null
  admin_notes: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  units?: { address: string }
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'

export default function AdminVacationPage() {
  const t = useTranslations('admin')
  const tv = useTranslations('vacation_admin')

  const [requests, setRequests] = useState<VacationRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [selected, setSelected] = useState<VacationRequest | null>(null)
  const [decisionStatus, setDecisionStatus] = useState<'approved' | 'rejected'>('approved')
  const [adminNotes, setAdminNotes] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [submittingDecision, setSubmittingDecision] = useState(false)
  const [decisionError, setDecisionError] = useState('')
  const [unitVehicles, setUnitVehicles] = useState<UnitVehicle[]>([])
  const [unitVehiclesLoading, setUnitVehiclesLoading] = useState(false)

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: '0', limit: '50' })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`/api/admin/vacation?${params}`)
      if (res.ok) {
        const json = await res.json()
        setRequests(Array.isArray(json) ? json : json.data ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  useEffect(() => {
    if (!selected?.unit_id) { setUnitVehicles([]); return }
    setUnitVehiclesLoading(true)
    fetch(`/api/residents?unit_id=${selected.unit_id}&limit=50`)
      .then(r => r.json())
      .then(d => setUnitVehicles(Array.isArray(d) ? d : d.data ?? []))
      .catch(() => {})
      .finally(() => setUnitVehiclesLoading(false))
  }, [selected])

  async function handleDecision() {
    if (!selected) return
    setSubmittingDecision(true)
    setDecisionError('')
    try {
      const res = await fetch(`/api/admin/vacation/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: decisionStatus,
          admin_notes: adminNotes,
          rejection_reason: decisionStatus === 'rejected' ? rejectionReason : undefined,
        }),
      })
      if (res.ok) {
        setSelected(null)
        setAdminNotes('')
        setRejectionReason('')
        fetchRequests()
      } else {
        const json = await res.json()
        setDecisionError(json.error ?? 'Failed')
      }
    } finally {
      setSubmittingDecision(false)
    }
  }

  const statusBadge = (s: string) => {
    if (s === 'approved') return 'bg-green-100 text-green-700'
    if (s === 'rejected') return 'bg-red-100 text-red-700'
    return 'bg-yellow-100 text-yellow-700'
  }

  const statusLabel = (s: string) => {
    if (s === 'approved') return tv('status_approved')
    if (s === 'rejected') return tv('status_rejected')
    return tv('status_pending')
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{tv('title')}</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {(['pending', 'approved', 'rejected', 'all'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {s === 'all' ? t('all') : statusLabel(s)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">{t('submitted')}</th>
                <th className="px-4 py-3 text-left">{t('unit')}</th>
                <th className="px-4 py-3 text-left">{tv('applicant')}</th>
                <th className="px-4 py-3 text-left">{t('vehicle')}</th>
                <th className="px-4 py-3 text-left">{tv('period')}</th>
                <th className="px-4 py-3 text-left">{tv('vehicle_check')}</th>
                <th className="px-4 py-3 text-left">{t('status')}</th>
                <th className="px-4 py-3 text-left">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">{t('loading')}</td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">{t('no_results')}</td></tr>
              ) : requests.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap text-xs">
                    {new Date(r.submitted_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium">{r.units?.address ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.first_name} {r.last_name}</div>
                    <div className="text-xs text-gray-700">{r.phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono font-semibold text-xs">{r.license_plate} / {r.plate_state}</div>
                    <div className="text-xs text-gray-600">{r.year} {r.make} {r.model} · {r.color}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">
                    <div>{new Date(r.start_datetime).toLocaleDateString()}</div>
                    <div className="text-gray-700">→ {new Date(r.end_datetime).toLocaleDateString()}</div>
                  </td>
                  <td className="px-4 py-3 text-xs space-y-1">
                    {/* Row 1: is_registered_vehicle */}
                    {r.is_registered_vehicle === null ? (
                      <div className="text-gray-500">— {tv('registered_vehicle')}</div>
                    ) : r.is_registered_vehicle ? (
                      <div className="text-green-600 font-semibold">✓ {tv('registered_vehicle')}</div>
                    ) : (
                      <div className="text-red-500 font-semibold">✗ {tv('registered_vehicle')}</div>
                    )}
                    {/* Row 2: is_eligible */}
                    {r.is_eligible === null ? (
                      <div className="text-gray-500">— {tv('eligible')}</div>
                    ) : r.is_eligible ? (
                      <div className="text-green-600 font-semibold">✓ {tv('eligible')}</div>
                    ) : (
                      <div className="text-red-500 font-semibold">✗ {tv('eligible')}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge(r.status)}`}>
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { setSelected(r); setDecisionStatus('approved'); setAdminNotes(r.admin_notes ?? ''); setRejectionReason(''); setDecisionError('') }}
                      className="text-xs text-blue-600 hover:underline"
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

      {/* Detail / Decision Modal */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{tv('request_detail')}</h2>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-700 text-xl">✕</button>
            </div>

            <div className="px-6 py-4 space-y-4 text-sm">
              {/* Status badge */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusBadge(selected.status)}`}>
                  {statusLabel(selected.status)}
                </span>
                {selected.is_registered_vehicle !== null && (
                  <span className={`text-xs font-medium px-3 py-1 rounded-full ${selected.is_registered_vehicle ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                    {selected.is_registered_vehicle ? `✓ ${tv('vehicle_registered')}` : `✗ ${tv('vehicle_not_registered')}`}
                  </span>
                )}
                {selected.is_eligible !== null ? (
                  <span className={`text-xs font-medium px-3 py-1 rounded-full ${selected.is_eligible ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                    {selected.is_eligible ? `✓ ${tv('eligible')}` : `✗ ${tv('not_eligible')}`}
                  </span>
                ) : (
                  <span className="text-xs font-medium px-3 py-1 rounded-full bg-gray-100 text-gray-500">
                    — {tv('eligible')}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div><p className="text-xs text-gray-500 uppercase">{tv('unit')}</p><p className="font-medium">{selected.units?.address}</p></div>
                <div><p className="text-xs text-gray-500 uppercase">{tv('registrant_type')}</p><p className="font-medium capitalize">{selected.registrant_type}</p></div>
                <div><p className="text-xs text-gray-500 uppercase">{tv('applicant')}</p><p className="font-medium">{selected.first_name} {selected.last_name}</p><p className="text-gray-700 text-xs">{selected.phone}</p></div>
                <div><p className="text-xs text-gray-500 uppercase">{tv('emergency_contact')}</p><p className="font-medium">{selected.emergency_first_name} {selected.emergency_last_name}</p><p className="text-gray-700 text-xs">{selected.emergency_phone}</p></div>
                <div><p className="text-xs text-gray-500 uppercase">{tv('period')}</p><p className="font-medium">{new Date(selected.start_datetime).toLocaleString()}</p><p className="text-gray-700 text-xs">→ {new Date(selected.end_datetime).toLocaleString()}</p></div>
                <div><p className="text-xs text-gray-500 uppercase">{t('vehicle')}</p><p className="font-mono font-semibold">{selected.license_plate} / {selected.plate_state}</p><p className="text-gray-700 text-xs">{selected.year} {selected.make} {selected.model} · {selected.color}</p></div>
                {selected.email && (
                  <div className="col-span-2"><p className="text-xs text-gray-500 uppercase">{tv('email')}</p><p className="text-gray-700">{selected.email}</p></div>
                )}
                {selected.reason && (
                  <div className="col-span-2"><p className="text-xs text-gray-500 uppercase">{tv('reason')}</p><p className="text-gray-700">{selected.reason}</p></div>
                )}
              </div>

              {selected.access_code && selected.status === 'approved' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-center">
                  <p className="text-xs text-blue-600 uppercase font-bold mb-1">{tv('access_code')}</p>
                  <p className="font-mono font-bold text-2xl text-blue-900 tracking-widest">{selected.access_code}</p>
                </div>
              )}

              {selected.admin_notes && selected.status !== 'pending' && (
                <div className="bg-gray-50 rounded-lg px-4 py-3">
                  <p className="text-xs text-gray-500 uppercase mb-1">{tv('admin_notes')}</p>
                  <p className="text-gray-700">{selected.admin_notes}</p>
                  {selected.reviewed_by && <p className="text-xs text-gray-500 mt-1">— {selected.reviewed_by}, {selected.reviewed_at ? new Date(selected.reviewed_at).toLocaleString() : ''}</p>}
                </div>
              )}

              {selected.rejection_reason && selected.status === 'rejected' && (
                <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                  <p className="text-xs text-red-600 uppercase mb-1">{tv('rejection_reason')}</p>
                  <p className="text-red-700">{selected.rejection_reason}</p>
                </div>
              )}

              {/* All registered vehicles for this unit */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs text-gray-500 uppercase mb-2">All Registered Vehicles for This Unit</p>
                {unitVehiclesLoading ? (
                  <p className="text-xs text-gray-500">Loading…</p>
                ) : unitVehicles.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No registered vehicles found.</p>
                ) : (
                  <div className="space-y-1.5">
                    {unitVehicles.map((v) => (
                      <div key={v.id} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${v.license_plate === selected?.license_plate ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${v.is_oversized ? 'bg-amber-500' : 'bg-gray-400'}`} />
                        <span className="font-mono font-semibold">{v.license_plate}{v.plate_state ? ` / ${v.plate_state}` : ''}</span>
                        <span className="text-gray-700">{v.year} {v.make} {v.model} · {v.color}</span>
                        {v.is_oversized && <span className="ml-auto text-amber-600 font-medium">Oversized</span>}
                        {v.license_plate === selected?.license_plate && <span className="ml-auto text-blue-600 font-medium">This vehicle</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Decision panel */}
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <p className="text-sm font-semibold text-gray-700">{tv('make_decision')}</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDecisionStatus('approved')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${decisionStatus === 'approved' ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                  >
                    ✓ {tv('approve')}
                  </button>
                  <button
                    onClick={() => setDecisionStatus('rejected')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${decisionStatus === 'rejected' ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                  >
                    ✗ {tv('reject')}
                  </button>
                </div>
                {decisionStatus === 'rejected' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{tv('rejection_reason')} *</label>
                    <select
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
                      <option value="">{tv('select_rejection_reason')}</option>
                      <option value={tv('rejection_not_registered')}>{tv('rejection_not_registered')}</option>
                      <option value={tv('rejection_not_qualifying')}>{tv('rejection_not_qualifying')}</option>
                      <option value={tv('rejection_duration_excessive')}>{tv('rejection_duration_excessive')}</option>
                      <option value={tv('rejection_insufficient_availability')}>{tv('rejection_insufficient_availability')}</option>
                      <option value={tv('rejection_other')}>{tv('rejection_other')}</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{tv('admin_notes')} ({tv('optional')})</label>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={3}
                    placeholder={tv('notes_placeholder')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                {decisionError && <p className="text-red-600 text-xs">{decisionError}</p>}
                <button
                  onClick={handleDecision}
                  disabled={submittingDecision}
                  className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {submittingDecision ? tv('submitting') : tv('confirm_decision')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
