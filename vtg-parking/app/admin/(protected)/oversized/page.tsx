'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { formatPDT } from '@/lib/utils';

interface OversizedApplication {
  id: string;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
  unit_id: string;
  owner_name: string;
  owner_phone: string | null;
  owner_phone_country_code: string | null;
  owner_email: string | null;
  registrant_type: string;
  year: number | null;
  make: string;
  model: string;
  color: string;
  license_plate: string;
  plate_state: string | null;
  registration_doc_url: string | null;
  admin_notes: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  units?: { address: string };
}

interface ResidentVehicle {
  id: string;
  make: string;
  model: string;
  color: string;
  license_plate: string;
  plate_state: string | null;
  year: number | null;
  is_oversized: boolean;
}

type TabStatus = 'pending' | 'approved' | 'rejected' | 'all';

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

export default function AdminOversizedPage() {
  const [tab, setTab] = useState<TabStatus>('pending');
  const [applications, setApplications] = useState<OversizedApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Modal state
  const [selected, setSelected] = useState<OversizedApplication | null>(null);
  const [unitVehicles, setUnitVehicles] = useState<ResidentVehicle[]>([]);
  const [unitVehiclesLoading, setUnitVehiclesLoading] = useState(false);
  const [decisionStatus, setDecisionStatus] = useState<'approved' | 'rejected'>('approved');
  const [adminNotes, setAdminNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [toast, setToast] = useState('');

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: '0', limit: '100' });
      if (tab !== 'all') params.set('status', tab);
      const res = await fetch(`/api/admin/oversized?${params}`);
      if (res.ok) {
        const json = await res.json();
        setApplications(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  const filteredApplications = useMemo(() => {
    if (!search.trim()) return applications;
    const q = search.trim().toLowerCase();
    return applications.filter((a) =>
      (a.units?.address ?? '').toLowerCase().includes(q) ||
      (a.owner_name ?? '').toLowerCase().includes(q) ||
      (a.license_plate ?? '').toLowerCase().includes(q) ||
      (a.make ?? '').toLowerCase().includes(q) ||
      (a.model ?? '').toLowerCase().includes(q)
    );
  }, [applications, search]);

  async function fetchUnitVehicles(unitId: string) {
    setUnitVehiclesLoading(true);
    try {
      const res = await fetch(`/api/residents?unit_id=${unitId}&limit=50`);
      if (res.ok) {
        const json = await res.json();
        setUnitVehicles(json.data ?? []);
      } else {
        setUnitVehicles([]);
      }
    } finally {
      setUnitVehiclesLoading(false);
    }
  }

  function openModal(app: OversizedApplication) {
    setSelected(app);
    setDecisionStatus('approved');
    setAdminNotes(app.admin_notes ?? '');
    setSubmitError('');
    fetchUnitVehicles(app.unit_id);
  }

  async function handleDecision() {
    if (!selected) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(`/api/admin/oversized/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: decisionStatus, admin_notes: adminNotes }),
      });
      if (res.ok) {
        setSelected(null);
        setToast(decisionStatus === 'approved' ? 'Application approved and vehicle added to registry.' : 'Application rejected.');
        setTimeout(() => setToast(''), 4000);
        fetchApplications();
      } else {
        const json = await res.json();
        setSubmitError(json.error ?? 'An error occurred. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const tabs: { key: TabStatus; label: string }[] = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Oversized Vehicle Applications</h1>

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
            placeholder="Search by address, owner, plate..."
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              Reset
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
                <th className="px-4 py-3 text-left">Unit Address</th>
                <th className="px-4 py-3 text-left">Owner</th>
                <th className="px-4 py-3 text-left">Vehicle</th>
                <th className="px-4 py-3 text-left">Plate / State</th>
                <th className="px-4 py-3 text-left">Submitted</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
              ) : filteredApplications.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No records found.</td></tr>
              ) : filteredApplications.map((app) => (
                <tr key={app.id} className="hover:bg-gray-50 align-top">
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">
                    {app.units?.address ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{app.owner_name}</div>
                    {app.owner_phone && <div className="text-xs text-gray-600">{app.owner_phone_country_code && <span className="text-gray-500 mr-1">{app.owner_phone_country_code}</span>}{app.owner_phone}</div>}
                    {app.owner_email && <div className="text-xs text-gray-600">{app.owner_email}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    <div>{app.year ?? ''} {app.make} {app.model}</div>
                    <div className="text-gray-500">{app.color}</div>
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-xs">
                    {app.license_plate}
                    {app.plate_state && <span className="text-gray-500 font-normal ml-1">/ {app.plate_state}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {formatPDT(app.created_at, { dateOnly: true })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[app.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {app.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openModal(app)}
                      className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1 rounded transition-colors"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg text-sm z-50">
          {toast}
        </div>
      )}

      {/* Detail / Decision Modal */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Oversized Vehicle Application</h2>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-700 text-xl">✕</button>
            </div>

            <div className="px-6 py-5 space-y-5 text-sm">
              {/* Status badge */}
              <div>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[selected.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {selected.status}
                </span>
              </div>

              {/* Application details */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-3">Application Details</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Unit</p>
                    <p className="font-medium">{selected.units?.address ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Submitted</p>
                    <p className="font-medium">{formatPDT(selected.created_at, { short: true })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Owner</p>
                    <p className="font-medium">{selected.owner_name}</p>
                    {selected.owner_phone && <p className="text-gray-500 text-xs">{selected.owner_phone_country_code && <span className="mr-1">{selected.owner_phone_country_code}</span>}{selected.owner_phone}</p>}
                    {selected.owner_email && <p className="text-gray-500 text-xs">{selected.owner_email}</p>}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Registrant Type</p>
                    <p className="font-medium capitalize">{selected.registrant_type}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500 uppercase">Vehicle</p>
                    <p className="font-mono font-semibold">{selected.license_plate}{selected.plate_state ? ` / ${selected.plate_state}` : ''}</p>
                    <p className="text-gray-500 text-xs">{selected.year ?? ''} {selected.make} {selected.model} · {selected.color}</p>
                  </div>
                  {selected.registration_doc_url && (
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500 uppercase">Registration Document</p>
                      <a
                        href={selected.registration_doc_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline text-xs"
                      >
                        View Document
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Other vehicles in this unit */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                  Other Vehicles Registered to This Unit
                </div>
                {unitVehiclesLoading ? (
                  <p className="text-xs text-gray-500">Loading...</p>
                ) : unitVehicles.length === 0 ? (
                  <p className="text-xs text-gray-500">No other vehicles registered to this unit.</p>
                ) : (
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 text-xs">
                    {unitVehicles.map((v) => (
                      <div key={v.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                        <div>
                          <span className="font-mono font-semibold">{v.license_plate}</span>
                          {v.plate_state && <span className="text-gray-500 ml-1">/ {v.plate_state}</span>}
                          <span className="text-gray-500 ml-2">{v.year ?? ''} {v.make} {v.model} · {v.color}</span>
                        </div>
                        {v.is_oversized && (
                          <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs font-medium">
                            Oversized
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Prior admin notes if already reviewed */}
              {selected.admin_notes && selected.status !== 'pending' && (
                <div className="bg-gray-50 rounded-lg px-4 py-3">
                  <p className="text-xs text-gray-500 uppercase mb-1">Admin Notes</p>
                  <p className="text-gray-700">{selected.admin_notes}</p>
                  {selected.reviewed_by && (
                    <p className="text-xs text-gray-500 mt-1">
                      — {selected.reviewed_by}, {selected.reviewed_at ? formatPDT(selected.reviewed_at, { short: true }) : ''}
                    </p>
                  )}
                </div>
              )}

              {/* Decision panel */}
              <div className="border-t border-gray-100 pt-4 space-y-4">
                <p className="text-sm font-semibold text-gray-700">Make a Decision</p>

                <div className="flex gap-3">
                  <button
                    onClick={() => setDecisionStatus('approved')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      decisionStatus === 'approved'
                        ? 'bg-green-600 text-white border-green-600'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    ✓ Approve
                  </button>
                  <button
                    onClick={() => setDecisionStatus('rejected')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      decisionStatus === 'rejected'
                        ? 'bg-red-600 text-white border-red-600'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    ✗ Reject
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Admin Notes (optional)</label>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={3}
                    placeholder="Add notes or reason for decision..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                {submitError && <p className="text-red-600 text-xs">{submitError}</p>}

                <button
                  onClick={handleDecision}
                  disabled={submitting}
                  className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Submitting...' : 'Confirm Decision'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
