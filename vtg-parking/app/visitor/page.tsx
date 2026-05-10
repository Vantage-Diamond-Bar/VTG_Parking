'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { US_STATES, CAR_COLORS, VISITOR_QUOTA_LIMIT } from '@/lib/utils'

interface Unit {
  id: string
  unit_number: string
}

interface QuotaData {
  used: number
  limit: number
}

export default function VisitorPage() {
  const t = useTranslations('visitor')

  const [units, setUnits] = useState<Unit[]>([])
  const [unitId, setUnitId] = useState('')
  const [quota, setQuota] = useState<QuotaData | null>(null)
  const [quotaLoading, setQuotaLoading] = useState(false)

  const [visitorName, setVisitorName] = useState('')
  const [licensePlate, setLicensePlate] = useState('')
  const [plateState, setPlateState] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [color, setColor] = useState('')
  const [startDatetime, setStartDatetime] = useState('')
  const [endDatetime, setEndDatetime] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [successData, setSuccessData] = useState<{ access_code: string; valid_until: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/units')
      .then((r) => r.json())
      .then((data) => setUnits(Array.isArray(data) ? data : data.units ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!unitId) {
      setQuota(null)
      return
    }
    setQuotaLoading(true)
    const yearMonth = new Date().toISOString().slice(0, 7)
    fetch(`/api/visitors/quota?unit_id=${unitId}&year_month=${yearMonth}`)
      .then((r) => r.json())
      .then((data) => {
        setQuota({
          used: data.used ?? 0,
          limit: data.limit ?? VISITOR_QUOTA_LIMIT,
        })
      })
      .catch(() => setQuota(null))
      .finally(() => setQuotaLoading(false))
  }, [unitId])

  const quotaExceeded = quota !== null && quota.used >= quota.limit

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!unitId) errors.unit_id = t('required')
    if (!licensePlate.trim()) errors.license_plate = t('required')
    if (!startDatetime) errors.start_datetime = t('required')
    if (!endDatetime) errors.end_datetime = t('required')
    if (startDatetime && endDatetime && endDatetime <= startDatetime) {
      errors.end_datetime = t('end_after_start')
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!validate()) return
    setSubmitting(true)
    try {
      const body = {
        unit_id: unitId,
        visitor_name: visitorName,
        license_plate: licensePlate.toUpperCase(),
        plate_state: plateState,
        make,
        model,
        color,
        start_datetime: startDatetime,
        end_datetime: endDatetime,
      }
      const res = await fetch('/api/visitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data?.error === 'plate_conflict') {
          setError(t('error_plate_conflict'))
        } else {
          setError(data?.message ?? 'Submission failed')
        }
        return
      }
      setSuccessData({
        access_code: data.access_code,
        valid_until: data.valid_until ?? endDatetime,
      })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function copyCode() {
    if (!successData) return
    await navigator.clipboard.writeText(successData.access_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function resetForm() {
    setUnitId('')
    setQuota(null)
    setVisitorName('')
    setLicensePlate('')
    setPlateState('')
    setMake('')
    setModel('')
    setColor('')
    setStartDatetime('')
    setEndDatetime('')
    setError('')
    setFieldErrors({})
    setSuccessData(null)
    setCopied(false)
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const sectionCls = 'text-lg font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-200'

  if (successData) {
    const validDate = new Date(successData.valid_until)
    const validStr = isNaN(validDate.getTime())
      ? successData.valid_until
      : validDate.toLocaleString()

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl shadow-md p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('success_title')}</h2>
            <p className="text-gray-500 text-sm mb-6">{t('success_desc')}</p>

            <div className="bg-gray-900 rounded-xl p-6 mb-4 relative">
              <p className="text-gray-400 text-xs uppercase tracking-widest mb-2">{t('access_code_label')}</p>
              <p className="font-mono text-4xl font-bold text-white tracking-[0.3em] select-all">
                {successData.access_code}
              </p>
              <button
                onClick={copyCode}
                className="absolute top-4 right-4 text-xs text-gray-400 hover:text-white border border-gray-600 rounded px-2 py-1 transition-colors"
              >
                {copied ? t('copied') : t('copy')}
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-2">
              {t('valid_until')}: <span className="font-medium text-gray-800">{validStr}</span>
            </p>
            <p className="text-sm text-gray-400 mb-6">{t('dashboard_instruction')}</p>

            <button
              onClick={resetForm}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              {t('register_another')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
          ← Back
        </Link>
        <div className="bg-white rounded-2xl shadow-md p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('title')}</h1>
          <p className="text-gray-500 text-sm mb-6">{t('subtitle')}</p>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Unit Selection */}
            <div>
              <h2 className={sectionCls}>{t('section_unit')}</h2>
              <div>
                <label className={labelCls}>{t('unit_number')}</label>
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">{t('unit_placeholder')}</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unit_number}
                    </option>
                  ))}
                </select>
                {fieldErrors.unit_id && (
                  <p className="text-red-500 text-xs mt-1">{fieldErrors.unit_id}</p>
                )}
              </div>

              {/* Quota Bar */}
              {unitId && (
                <div className="mt-4">
                  {quotaLoading ? (
                    <p className="text-sm text-gray-400">{t('loading_quota')}</p>
                  ) : quota ? (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">{t('quota_label')}</span>
                        <span className={`font-semibold ${quotaExceeded ? 'text-red-600' : 'text-gray-800'}`}>
                          {quota.used} / {quota.limit} {t('nights')}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${quotaExceeded ? 'bg-red-500' : 'bg-blue-500'}`}
                          style={{ width: `${Math.min((quota.used / quota.limit) * 100, 100)}%` }}
                        />
                      </div>
                      {quotaExceeded && (
                        <p className="text-red-600 text-sm mt-2 font-medium">{t('quota_exceeded')}</p>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Vehicle Info */}
            <fieldset disabled={quotaExceeded}>
              <div className="space-y-8">
                <div>
                  <h2 className={sectionCls}>{t('section_vehicle')}</h2>
                  <div className="space-y-4">
                    <div>
                      <label className={labelCls}>{t('visitor_name')}</label>
                      <input
                        type="text"
                        value={visitorName}
                        onChange={(e) => setVisitorName(e.target.value)}
                        className={inputCls}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls}>{t('license_plate')} *</label>
                        <input
                          type="text"
                          value={licensePlate}
                          onChange={(e) => setLicensePlate(e.target.value.toUpperCase())}
                          className={inputCls}
                        />
                        {fieldErrors.license_plate && (
                          <p className="text-red-500 text-xs mt-1">{fieldErrors.license_plate}</p>
                        )}
                      </div>
                      <div>
                        <label className={labelCls}>{t('plate_state')}</label>
                        <select
                          value={plateState}
                          onChange={(e) => setPlateState(e.target.value)}
                          className={inputCls}
                        >
                          <option value=""></option>
                          {US_STATES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className={labelCls}>{t('make')}</label>
                        <input
                          type="text"
                          value={make}
                          onChange={(e) => setMake(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>{t('model')}</label>
                        <input
                          type="text"
                          value={model}
                          onChange={(e) => setModel(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>{t('color')}</label>
                        <select
                          value={color}
                          onChange={(e) => setColor(e.target.value)}
                          className={inputCls}
                        >
                          <option value=""></option>
                          {CAR_COLORS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dates */}
                <div>
                  <h2 className={sectionCls}>{t('section_dates')}</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>{t('start_datetime')} *</label>
                      <input
                        type="datetime-local"
                        value={startDatetime}
                        onChange={(e) => setStartDatetime(e.target.value)}
                        className={inputCls}
                      />
                      {fieldErrors.start_datetime && (
                        <p className="text-red-500 text-xs mt-1">{fieldErrors.start_datetime}</p>
                      )}
                    </div>
                    <div>
                      <label className={labelCls}>{t('end_datetime')} *</label>
                      <input
                        type="datetime-local"
                        value={endDatetime}
                        onChange={(e) => setEndDatetime(e.target.value)}
                        className={inputCls}
                      />
                      {fieldErrors.end_datetime && (
                        <p className="text-red-500 text-xs mt-1">{fieldErrors.end_datetime}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mt-6">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || quotaExceeded}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 mt-6"
              >
                {submitting ? t('submitting') : t('submit')}
              </button>
            </fieldset>
          </form>
        </div>
      </div>
    </div>
  )
}
