'use client'

import { useState, useEffect, useCallback } from 'react'
import { VISITOR_QUOTA_LIMIT } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MonthEntry {
  year_month: string
  nights_used: number
  count: number
  limit: number
}

interface Registration {
  id: string
  start_datetime: string
  end_datetime: string
  license_plate: string
  plate_state: string
  visitor_name: string
  make: string
  model: string
  color: string
  visitor_phone: string
  access_code: string
  nights: number
}

interface UnitSummary {
  unit_id: string
  address: string
  total_nights: number
  months: MonthEntry[]
  registrations: Registration[]
}

interface VehicleMonthEntry {
  year_month: string
  nights_used: number
  count: number
}

interface VehicleReg {
  unit_id: string
  address: string
  start_datetime: string
  end_datetime: string
  nights: number
  visitor_name: string
}

interface VehicleSummary {
  license_plate: string
  plate_state: string
  make: string
  model: string
  color: string
  total_nights: number
  months: VehicleMonthEntry[]
  registrations: VehicleReg[]
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MonthBar({ month }: { month: MonthEntry }) {
  const pct = Math.min(100, month.limit > 0 ? (month.nights_used / month.limit) * 100 : 0)
  const remaining = Math.max(0, month.limit - month.nights_used)
  const color = pct >= 100 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-gray-400 w-16 shrink-0">{month.year_month}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`w-20 text-right shrink-0 ${pct >= 100 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
        {month.nights_used}/{month.limit} nights
      </span>
      {remaining > 0 && <span className="text-green-600 w-16 shrink-0">{remaining} left</span>}
      {remaining === 0 && <span className="text-red-500 w-16 shrink-0 font-semibold">Maxed</span>}
    </div>
  )
}

function MonthlyBarChart({ months, globalMax }: { months: VehicleMonthEntry[]; globalMax: number }) {
  const now = new Date()
  const toYm = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

  const currentYm = toYm(now)
  const twelveMonthsAgo = toYm(new Date(now.getFullYear(), now.getMonth() - 11, 1))

  // Window start: earliest data or 12 months ago, whichever is earlier
  const sorted = [...months].sort((a, b) => a.year_month.localeCompare(b.year_month))
  const earliestData = sorted.length > 0 ? sorted[0].year_month : twelveMonthsAgo
  const latestData = sorted.length > 0 ? sorted[sorted.length - 1].year_month : currentYm
  const startYm = earliestData < twelveMonthsAgo ? earliestData : twelveMonthsAgo
  // Window end: extend to cover future data (e.g. registrations beyond current month)
  const endYm = latestData > currentYm ? latestData : currentYm

  // Build ordered month slots
  const slots: string[] = []
  const cursor = new Date(+startYm.slice(0, 4), +startYm.slice(5, 7) - 1, 1)
  const end = new Date(+endYm.slice(0, 4), +endYm.slice(5, 7) - 1, 1)
  while (cursor <= end) {
    slots.push(toYm(cursor))
    cursor.setMonth(cursor.getMonth() + 1)
  }

  const monthMap = Object.fromEntries(months.map((m) => [m.year_month, m]))
  // Use global max so bars are comparable across all vehicle charts
  const max = globalMax

  const CHART_H = 96
  const BAR_W = 20
  const GAP = 6

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'inline-flex', alignItems: 'flex-end', gap: GAP, minWidth: slots.length * (BAR_W + GAP) }}>
        {slots.map((ym, i) => {
          const entry = monthMap[ym]
          const nights = entry?.nights_used ?? 0
          const barH = nights === 0 ? 4 : Math.max(10, Math.round((nights / max) * CHART_H))
          const barColor = nights === 0 ? '#e5e7eb' : '#60a5fa'
          const showYear = i === 0 || ym.slice(0, 4) !== slots[i - 1].slice(0, 4)
          return (
            <div
              key={ym}
              style={{
                width: BAR_W,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                height: CHART_H + 28,
              }}
            >
              <span style={{ fontSize: 9, color: nights > 0 ? '#6b7280' : 'transparent', marginBottom: 2, lineHeight: 1 }}>
                {nights}
              </span>
              <div style={{ width: BAR_W, height: barH, backgroundColor: barColor, borderRadius: '2px 2px 0 0' }} />
              <span style={{ fontSize: 9, color: '#9ca3af', marginTop: 3, lineHeight: 1 }}>{ym.slice(5)}</span>
              <span style={{ fontSize: 8, color: showYear ? '#c4b5c8' : 'transparent', lineHeight: 1 }}>
                {ym.slice(0, 4)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function VehicleRow({ vehicle, globalMax }: { vehicle: VehicleSummary; globalMax: number }) {
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<'chart' | 'history'>('chart')

  const plateLabel = vehicle.plate_state
    ? `${vehicle.license_plate} · ${vehicle.plate_state}`
    : vehicle.license_plate
  const vehicleDesc = [vehicle.make, vehicle.model, vehicle.color].filter(Boolean).join(' ')
  const visitCount = vehicle.registrations.length

  // Unique units this vehicle has visited
  const uniqueAddresses = [...new Set(vehicle.registrations.map((r) => r.address))]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="w-5 text-gray-400 shrink-0 text-sm">{expanded ? '▾' : '▸'}</div>

        {/* Plate + vehicle info */}
        <div className="flex-1 min-w-0">
          <div className="font-mono font-bold text-gray-900 text-sm">{vehicle.license_plate}</div>
          <div className="text-xs text-gray-400 mt-0.5">
            {vehicleDesc || '—'}
            {vehicle.plate_state && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 rounded text-gray-500 text-[10px]">
                {vehicle.plate_state}
              </span>
            )}
          </div>
        </div>

        {/* Visit stats */}
        <div className="text-xs text-gray-500 text-right shrink-0 hidden sm:block">
          <div>{visitCount} stays</div>
          <div className="text-gray-400">{uniqueAddresses.length} unit{uniqueAddresses.length !== 1 ? 's' : ''}</div>
        </div>

        {/* Total nights badge */}
        <div className="shrink-0 w-24 text-right">
          <span
            className={`text-sm font-bold ${
              vehicle.total_nights > 30
                ? 'text-red-600'
                : vehicle.total_nights > 14
                ? 'text-amber-600'
                : 'text-gray-700'
            }`}
          >
            {vehicle.total_nights}
          </span>
          <span className="text-xs text-gray-400 ml-1">nights</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-5 pb-5">
          {/* Tab switcher */}
          <div className="flex gap-1 mt-4 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => setTab('chart')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === 'chart' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              📊 Monthly Chart
            </button>
            <button
              onClick={() => setTab('history')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === 'history' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              📋 Stay History ({visitCount})
            </button>
          </div>

          {tab === 'chart' && (
            <div>
              {/* Visited units summary */}
              <div className="mb-4 flex flex-wrap gap-1.5">
                {uniqueAddresses.map((addr) => {
                  const count = vehicle.registrations.filter((r) => r.address === addr).length
                  return (
                    <span
                      key={addr}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-[11px]"
                    >
                      🏠 {addr}
                      <span className="bg-blue-200 text-blue-800 rounded-full px-1 text-[10px]">{count}</span>
                    </span>
                  )
                })}
              </div>
              <MonthlyBarChart months={vehicle.months} globalMax={globalMax} />
            </div>
          )}

          {tab === 'history' && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-500 uppercase text-xs border-b border-gray-100">
                  <tr>
                    <th className="py-2 text-left pr-4">Unit</th>
                    <th className="py-2 text-left pr-4">Visitor</th>
                    <th className="py-2 text-left pr-4">Check-in</th>
                    <th className="py-2 text-left pr-4">Check-out</th>
                    <th className="py-2 text-right">Nights</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {vehicle.registrations.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="py-2 pr-4 text-gray-700 font-medium">{r.address}</td>
                      <td className="py-2 pr-4 text-gray-600">{r.visitor_name || '—'}</td>
                      <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">
                        {new Date(r.start_datetime).toLocaleDateString()}
                        <span className="text-gray-400 ml-1">
                          {new Date(r.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">
                        {new Date(r.end_datetime).toLocaleDateString()}
                        <span className="text-gray-400 ml-1">
                          {new Date(r.end_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className={`py-2 text-right font-semibold ${r.nights > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                        {r.nights > 0 ? r.nights : '<1'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function QuotaSummaryPage() {
  const [data, setData] = useState<UnitSummary[]>([])
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'units' | 'vehicles'>('units')
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'months' | 'registrations'>('months')

  const fetchData = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('search', q)
      const res = await fetch(`/api/admin/quota-summary?${params}`)
      if (res.ok) {
        const json = await res.json()
        setData(json.data ?? [])
        setVehicles(json.vehicles ?? [])
        setTotal(json.total ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => fetchData(search), 300)
    return () => clearTimeout(timer)
  }, [search, fetchData])

  function toggleExpand(unit_id: string) {
    setExpandedUnit((prev) => (prev === unit_id ? null : unit_id))
    setActiveTab('months')
  }

  const currentYearMonth = new Date().toISOString().slice(0, 7)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visitor Quota Summary</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {viewMode === 'units'
              ? `${total} units · Monthly limit: ${VISITOR_QUOTA_LIMIT} nights/unit`
              : `${vehicles.length} unique vehicles`}
          </p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search address, plate, visitor…"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* View mode tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setViewMode('units')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            viewMode === 'units' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🏠 By Unit
        </button>
        <button
          onClick={() => setViewMode('vehicles')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            viewMode === 'vehicles' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🚗 By Vehicle
        </button>
      </div>

      {loading && data.length === 0 ? (
        <div className="text-center text-gray-400 py-16">Loading…</div>
      ) : (
        <>
          {/* ── Unit view ─────────────────────────────────────────────────── */}
          {viewMode === 'units' && (
            <div className="space-y-3">
              {data.length === 0 ? (
                <div className="text-center text-gray-400 py-16">No data found.</div>
              ) : (
                data.map((unit) => {
                  const isExpanded = expandedUnit === unit.unit_id
                  const currentMonth = unit.months.find((m) => m.year_month === currentYearMonth)
                  const currentUsed = currentMonth?.nights_used ?? 0
                  const currentPct = Math.min(100, (currentUsed / VISITOR_QUOTA_LIMIT) * 100)
                  const currentColor =
                    currentPct >= 100 ? 'bg-red-500' : currentPct >= 70 ? 'bg-amber-500' : 'bg-green-500'

                  return (
                    <div
                      key={unit.unit_id}
                      className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
                    >
                      <button
                        onClick={() => toggleExpand(unit.unit_id)}
                        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="w-5 text-gray-400 shrink-0 text-sm">{isExpanded ? '▾' : '▸'}</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-900 text-sm truncate">{unit.address}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {unit.registrations.length} registrations · {unit.total_nights} total nights
                          </div>
                        </div>
                        <div className="flex items-center gap-2 w-52 shrink-0">
                          <span className="text-xs text-gray-400 w-16 shrink-0 text-right">This month</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div className={`h-full ${currentColor} transition-all`} style={{ width: `${currentPct}%` }} />
                          </div>
                          <span className="text-xs text-gray-600 w-12 text-right shrink-0">
                            {currentUsed}/{VISITOR_QUOTA_LIMIT}
                          </span>
                        </div>
                        <div className="shrink-0 w-24 text-right">
                          <span className={`text-sm font-bold ${unit.total_nights > 50 ? 'text-red-600' : unit.total_nights > 20 ? 'text-amber-600' : 'text-gray-700'}`}>
                            {unit.total_nights}
                          </span>
                          <span className="text-xs text-gray-400 ml-1">total</span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-100 px-5 pb-5">
                          <div className="flex gap-1 mt-4 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
                            <button
                              onClick={() => setActiveTab('months')}
                              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'months' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                              📅 Monthly Breakdown
                            </button>
                            <button
                              onClick={() => setActiveTab('registrations')}
                              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'registrations' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                              🚗 All Registrations ({unit.registrations.length})
                            </button>
                          </div>

                          {activeTab === 'months' && (
                            <div className="space-y-2">
                              {unit.months.length === 0 ? (
                                <p className="text-xs text-gray-400 italic">No visitor registrations recorded.</p>
                              ) : (
                                unit.months.map((m) => <MonthBar key={m.year_month} month={m} />)
                              )}
                            </div>
                          )}

                          {activeTab === 'registrations' && (
                            <div className="overflow-x-auto">
                              {unit.registrations.length === 0 ? (
                                <p className="text-xs text-gray-400 italic">No registrations found.</p>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead className="text-gray-500 uppercase text-xs border-b border-gray-100">
                                    <tr>
                                      <th className="py-2 text-left pr-4">Visitor</th>
                                      <th className="py-2 text-left pr-4">Plate</th>
                                      <th className="py-2 text-left pr-4">Vehicle</th>
                                      <th className="py-2 text-left pr-4">Check-in</th>
                                      <th className="py-2 text-left pr-4">Check-out</th>
                                      <th className="py-2 text-right">Nights</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-50">
                                    {unit.registrations.map((r) => (
                                      <tr key={r.id} className="hover:bg-gray-50">
                                        <td className="py-2 pr-4 text-gray-800">{r.visitor_name || '—'}</td>
                                        <td className="py-2 pr-4 font-mono text-gray-700">
                                          {r.license_plate}{r.plate_state ? ` / ${r.plate_state}` : ''}
                                        </td>
                                        <td className="py-2 pr-4 text-gray-600">
                                          {[r.make, r.model, r.color].filter(Boolean).join(' ') || '—'}
                                        </td>
                                        <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">
                                          {new Date(r.start_datetime).toLocaleDateString()}
                                          <span className="text-gray-400 ml-1">
                                            {new Date(r.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                          </span>
                                        </td>
                                        <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">
                                          {new Date(r.end_datetime).toLocaleDateString()}
                                          <span className="text-gray-400 ml-1">
                                            {new Date(r.end_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                          </span>
                                        </td>
                                        <td className={`py-2 text-right font-semibold ${r.nights > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                          {r.nights > 0 ? r.nights : '<1'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* ── Vehicle view ───────────────────────────────────────────────── */}
          {viewMode === 'vehicles' && (
            <div className="space-y-3">
              {vehicles.length === 0 ? (
                <div className="text-center text-gray-400 py-16">No vehicles found.</div>
              ) : (() => {
                const globalMax = Math.max(...vehicles.flatMap(v => v.months.map(m => m.nights_used)), 1)
                return vehicles.map((v) => (
                  <VehicleRow
                    key={`${v.license_plate}|${v.plate_state}`}
                    vehicle={v}
                    globalMax={globalMax}
                  />
                ))
              })()}
            </div>
          )}
        </>
      )}
    </div>
  )
}
