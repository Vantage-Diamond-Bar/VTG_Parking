'use client'

import { useState, useEffect, useCallback } from 'react'
import { VISITOR_QUOTA_LIMIT } from '@/lib/utils'

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

export default function QuotaSummaryPage() {
  const [data, setData] = useState<UnitSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visitor Quota Summary</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} units · Monthly limit: {VISITOR_QUOTA_LIMIT} nights/unit
          </p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by address, plate, visitor name…"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading && data.length === 0 ? (
        <div className="text-center text-gray-400 py-16">Loading…</div>
      ) : data.length === 0 ? (
        <div className="text-center text-gray-400 py-16">No data found.</div>
      ) : (
        <div className="space-y-3">
          {data.map((unit) => {
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
                {/* Row header — always visible */}
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

                  {/* Current month mini-bar */}
                  <div className="flex items-center gap-2 w-52 shrink-0">
                    <span className="text-xs text-gray-400 w-16 shrink-0 text-right">This month</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className={`h-full ${currentColor} transition-all`} style={{ width: `${currentPct}%` }} />
                    </div>
                    <span className="text-xs text-gray-600 w-12 text-right shrink-0">
                      {currentUsed}/{VISITOR_QUOTA_LIMIT}
                    </span>
                  </div>

                  {/* Total nights badge */}
                  <div className="shrink-0 w-24 text-right">
                    <span className={`text-sm font-bold ${unit.total_nights > 50 ? 'text-red-600' : unit.total_nights > 20 ? 'text-amber-600' : 'text-gray-700'}`}>
                      {unit.total_nights}
                    </span>
                    <span className="text-xs text-gray-400 ml-1">total</span>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-5 pb-5">
                    {/* Tabs */}
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
          })}
        </div>
      )}
    </div>
  )
}
