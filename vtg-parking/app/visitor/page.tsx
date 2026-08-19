'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { US_STATES, CAR_COLORS, CAR_MAKES, VEHICLE_TYPES, VISITOR_QUOTA_LIMIT, getYearMonth, ptInputToISO } from '@/lib/utils'
import PhoneInput from '@/components/PhoneInput'
import UnitSearchInput from '@/components/UnitSearchInput'

type VerifyState = 'idle' | 'loading' | 'no_vehicles' | 'awaiting_email' | 'otp_sending' | 'otp_sent' | 'otp_verifying' | 'otp_invalid' | 'mismatch' | 'overdue' | 'verified'

interface Unit {
  id: string
  address: string
}

interface QuotaData {
  used: number
  limit: number
}

export default function VisitorPage() {
  const t = useTranslations('visitor')

  const [units, setUnits] = useState<Unit[]>([])
  const [unitId, setUnitId] = useState('')

  // Verification flow
  const [verifyState, setVerifyState] = useState<VerifyState>('idle')
  const [emailHints, setEmailHints] = useState<string[]>([])
  const [hostEmail, setHostEmail] = useState('')
  const [quota, setQuota] = useState<QuotaData | null>(null)
  const [verificationToken, setVerificationToken] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const currentYear = new Date().getFullYear()
  const [selectedMonth, setSelectedMonth] = useState(getYearMonth())
  const [displayQuota, setDisplayQuota] = useState<QuotaData | null>(null)

  const [visitorName, setVisitorName] = useState('')
  const [visitorPhone, setVisitorPhone] = useState('')
  const [visitorPhoneCC, setVisitorPhoneCC] = useState('+1')
  const [visitorPhoneLocal, setVisitorPhoneLocal] = useState('')
  const [licensePlate, setLicensePlate] = useState('')
  const [plateState, setPlateState] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [color, setColor] = useState('')
  const [vehicleType, setVehicleType] = useState('')
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
      setVerifyState('idle')
      setEmailHints([])
      setHostEmail('')
      setQuota(null)
      return
    }
    setVerifyState('loading')
    fetch(`/api/visitors/unit-status?unit_id=${unitId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.has_vehicles) {
          setVerifyState('no_vehicles')
        } else {
          setEmailHints(data.email_hints ?? [])
          setVerifyState('awaiting_email')
        }
      })
      .catch(() => setVerifyState('idle'))
  }, [unitId])

  useEffect(() => {
    if (!unitId || verifyState !== 'verified') return
    fetch(`/api/visitors/quota?unit_id=${unitId}&year_month=${selectedMonth}`)
      .then(r => r.json())
      .then(d => {
        if (d.nights_used !== undefined) {
          setDisplayQuota({ used: d.nights_used, limit: d.quota_limit ?? VISITOR_QUOTA_LIMIT })
        }
      })
      .catch(() => {})
  }, [unitId, selectedMonth, verifyState])

  async function handleSendOtp() {
    setVerifyState('otp_sending')
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit_id: unitId, email: hostEmail }),
      })
      const data = await res.json()
      if (data.status === 'sent') {
        setVerifyState('otp_sent')
      } else if (data.status === 'no_vehicles') {
        setVerifyState('no_vehicles')
      } else {
        setVerifyState('mismatch')
      }
    } catch {
      setVerifyState('mismatch')
    }
  }

  async function handleVerifyOtp() {
    setVerifyState('otp_verifying')
    try {
      const otpRes = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit_id: unitId, email: hostEmail, otp: otpCode }),
      })
      const otpData = await otpRes.json()
      if (otpData.status !== 'ok') {
        setVerifyState('otp_invalid')
        return
      }
      const token = otpData.verification_token
      const hostRes = await fetch('/api/visitors/verify-host', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verification_token: token }),
      })
      const hostData = await hostRes.json()
      if (hostData.status === 'ok') {
        setQuota(hostData.quota)
        setVerificationToken(token)
        setVerifyState('verified')
      } else if (hostData.status === 'overdue') {
        setVerifyState('overdue')
      } else {
        setVerifyState('otp_invalid')
      }
    } catch {
      setVerifyState('otp_invalid')
    }
  }

  const effectiveQuota = displayQuota ?? quota
  const quotaExceeded = effectiveQuota !== null && effectiveQuota.used >= effectiveQuota.limit

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!unitId) errors.unit_id = t('required')
    if (!visitorPhone.trim()) errors.visitor_phone = t('required')
    else if (visitorPhone.replace(/\D/g, '').length < 10) errors.visitor_phone = 'Enter a valid 10-digit phone number.'
    if (!licensePlate.trim()) errors.license_plate = t('required')
    if (!plateState) errors.plate_state = t('required')
    if (!make) errors.make = t('required')
    if (!model.trim()) errors.model = t('required')
    if (!color) errors.color = t('required')
    if (!startDatetime) errors.start_datetime = t('required')
    if (!endDatetime) errors.end_datetime = t('required')
    if (startDatetime && endDatetime && endDatetime.slice(0, 10) <= startDatetime.slice(0, 10)) {
      errors.end_datetime = t('end_after_start_date')
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
        visitor_phone: visitorPhoneLocal,
        visitor_phone_country_code: visitorPhoneCC,
        license_plate: licensePlate.toUpperCase(),
        plate_state: plateState,
        make,
        model,
        color,
        vehicle_type: vehicleType || null,
        start_datetime: ptInputToISO(startDatetime),
        end_datetime: ptInputToISO(endDatetime),
        verification_token: verificationToken,
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
        } else if (data?.error === 'quota_exceeded') {
          setError(t('error_quota_exceeded'))
        } else if (data?.error === 'registration_overdue') {
          // The unit fell out of good standing between passing verify-host and
          // submitting; the API is the one that decides, so surface its reason.
          setError(t('overdue_message'))
        } else if (data?.error === 'no_resident_vehicles') {
          setError(t('no_vehicles_message'))
        } else {
          setError(t('error_submission_failed'))
        }
        return
      }
      setSuccessData({
        access_code: data.access_code,
        valid_until: data.valid_until ?? endDatetime,
      })
    } catch {
      setError(t('error_network'))
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
    setVerifyState('idle')
    setEmailHints([])
    setHostEmail('')
    setQuota(null)
    setVerificationToken('')
    setOtpCode('')
    setVisitorName('')
    setVisitorPhone('')
    setVisitorPhoneCC('+1')
    setVisitorPhoneLocal('')
    setLicensePlate('')
    setPlateState('')
    setMake('')
    setModel('')
    setColor('')
    setVehicleType('')
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

            <div className="bg-teal-50 border-2 border-teal-600 rounded-xl p-6 mb-4 relative">
              <p className="text-teal-700 text-xs uppercase tracking-widest mb-2">{t('access_code_label')}</p>
              <p className="font-mono text-4xl font-bold text-teal-950 tracking-[0.3em] select-all">
                {successData.access_code}
              </p>
              <button
                onClick={copyCode}
                className="absolute top-4 right-4 text-xs text-teal-700 hover:text-teal-900 border border-teal-500 hover:border-teal-700 hover:bg-teal-100 rounded px-2 py-1 transition-colors"
              >
                {copied ? t('copied') : t('copy')}
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-6">
              {t('valid_until')}: <span className="font-semibold text-gray-800">{validStr}</span>
            </p>

            <div className="bg-amber-50 border-2 border-amber-400 rounded-xl px-5 py-4 mb-6 text-center">
              <p className="text-amber-900 font-bold text-base leading-snug">
                📋 {t('dashboard_instruction')}
              </p>
            </div>

            <div className="flex gap-3 mb-3">
              <button
                onClick={() => window.print()}
                className="flex-1 bg-gray-800 text-white py-3 rounded-lg font-semibold hover:bg-gray-900 transition-colors flex items-center justify-center gap-2"
              >
                🖨️ {t('print')}
              </button>
              <button
                onClick={resetForm}
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                {t('register_another')}
              </button>
            </div>
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
                <UnitSearchInput
                  units={units}
                  value={unitId}
                  onChange={setUnitId}
                  placeholder={t('unit_placeholder')}
                  className={inputCls}
                />
                {fieldErrors.unit_id && (
                  <p className="text-red-500 text-xs mt-1">{fieldErrors.unit_id}</p>
                )}
              </div>

              {/* Verification area */}
              {unitId && (
                <div className="mt-4">
                  {verifyState === 'loading' && (
                    <p className="text-sm text-gray-500">{t('loading_quota')}</p>
                  )}

                  {verifyState === 'no_vehicles' && (
                    <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 text-sm text-amber-800">
                      🚫 {t('no_vehicles_message')}
                    </div>
                  )}

                  {verifyState === 'overdue' && (
                    <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-3 text-sm text-red-800">
                      ⚠️ {t('overdue_message')}
                    </div>
                  )}

                  {(verifyState === 'awaiting_email' || verifyState === 'otp_sending' || verifyState === 'mismatch') && (
                    <div className="border border-blue-200 bg-blue-50 rounded-lg px-4 py-4 space-y-3">
                      <p className="text-sm font-semibold text-blue-900">{t('verify_email_title')}</p>
                      <p className="text-xs text-blue-700">{t('verify_email_desc')}</p>
                      {emailHints.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">{t('email_hint_prefix')}</p>
                          <div className="flex flex-wrap gap-2">
                            {emailHints.map((hint, i) => (
                              <span key={i} className="font-mono text-sm bg-white border border-blue-200 rounded px-2 py-0.5 text-blue-800">
                                {hint}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input
                          type="email"
                          value={hostEmail}
                          onChange={(e) => setHostEmail(e.target.value)}
                          placeholder={t('host_email')}
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={handleSendOtp}
                          disabled={!hostEmail.trim() || verifyState === 'otp_sending'}
                          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          {verifyState === 'otp_sending' ? t('sending') : t('send_code')}
                        </button>
                      </div>
                      {verifyState === 'mismatch' && (
                        <p className="text-red-600 text-xs">{t('email_mismatch')}</p>
                      )}
                    </div>
                  )}

                  {(verifyState === 'otp_sent' || verifyState === 'otp_verifying' || verifyState === 'otp_invalid') && (
                    <div className="border border-blue-200 bg-blue-50 rounded-lg px-4 py-4 space-y-3">
                      <p className="text-sm font-semibold text-blue-900">{t('otp_label')}</p>
                      <p className="text-xs text-blue-700">{t('otp_sent_desc')}</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                          placeholder={t('otp_placeholder')}
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={handleVerifyOtp}
                          disabled={otpCode.length < 6 || verifyState === 'otp_verifying'}
                          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          {verifyState === 'otp_verifying' ? t('otp_verifying') : t('otp_verify')}
                        </button>
                      </div>
                      {verifyState === 'otp_invalid' && (
                        <p className="text-red-600 text-xs">{t('otp_invalid')}</p>
                      )}
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {t('otp_resend')}
                      </button>
                    </div>
                  )}

                  {verifyState === 'verified' && quota && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-green-600 text-xs font-semibold">✓ {t('email_verified')}</span>
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-gray-700">
                          {t('quota_remaining_label')}
                          {effectiveQuota && (
                            <span className={`ml-1 font-bold ${quotaExceeded ? 'text-red-600' : 'text-green-600'}`}>
                              {effectiveQuota.limit - effectiveQuota.used}/{effectiveQuota.limit}
                            </span>
                          )}
                        </p>
                        <div className="flex gap-1.5 items-center">
                          <select
                            value={selectedMonth.slice(0, 4)}
                            onChange={e => setSelectedMonth(`${e.target.value}-${selectedMonth.slice(5, 7)}`)}
                            className="text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-600"
                          >
                            {[currentYear - 1, currentYear, currentYear + 1].map(yr => (
                              <option key={yr} value={String(yr)}>{yr}</option>
                            ))}
                          </select>
                          <select
                            value={selectedMonth.slice(5, 7)}
                            onChange={e => setSelectedMonth(`${selectedMonth.slice(0, 4)}-${e.target.value}`)}
                            className="text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-600"
                          >
                            {['January','February','March','April','May','June','July','August','September','October','November','December'].map((name, i) => (
                              <option key={i} value={String(i + 1).padStart(2, '0')}>{name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {(() => {
                        const dq = displayQuota ?? quota
                        const dUsed = dq.used
                        const dLimit = dq.limit
                        const dRemaining = Math.max(0, dLimit - dUsed)
                        const dPct = Math.min((dUsed / dLimit) * 100, 100)
                        return (
                          <>
                            <div className="w-full flex rounded-full h-5 overflow-hidden">
                              {dUsed > 0 && <div className="bg-red-400 transition-all" style={{ width: `${dPct}%` }} />}
                              {dRemaining > 0 && <div className="bg-green-400 flex-1 transition-all" />}
                              {dRemaining === 0 && dUsed > 0 && <div className="bg-red-400 flex-1" />}
                            </div>
                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                              <span className="text-red-500">{dUsed} {t('nights_used')}</span>
                              <span className="text-green-600">{dRemaining} {t('nights_remaining')}</span>
                            </div>
                          </>
                        )
                      })()}
                      {quotaExceeded && (
                        <p className="text-red-600 text-sm mt-2 font-medium">{t('quota_exceeded')}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Vehicle Info — shown after verified */}
            {verifyState === 'verified' && (
              <fieldset>
                <div className="space-y-8">
                  <div>
                    <h2 className={sectionCls}>{t('section_vehicle')}</h2>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className={labelCls}>{t('visitor_name')}</label>
                          <input
                            type="text"
                            value={visitorName}
                            onChange={(e) => setVisitorName(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>{t('visitor_phone')} *</label>
                          <PhoneInput
                            value={visitorPhone}
                            onChange={setVisitorPhone}
                            onChangeSplit={({ countryCode, number }) => { setVisitorPhoneCC(countryCode); setVisitorPhoneLocal(number) }}
                          />
                          {fieldErrors.visitor_phone && (
                            <p className="text-red-500 text-xs mt-1">{fieldErrors.visitor_phone}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className={labelCls}>{t('license_plate')} *</label>
                          <input
                            type="text"
                            value={licensePlate}
                            title={t('plate_hint')}
                            placeholder="ABC1234"
                            onChange={(e) => setLicensePlate(e.target.value.replace(/\s/g, '').toUpperCase())}
                            className={inputCls}
                          />
                          <p className="text-xs text-gray-500 mt-1">{t('plate_hint')}</p>
                          {fieldErrors.license_plate && (
                            <p className="text-red-500 text-xs mt-1">{fieldErrors.license_plate}</p>
                          )}
                        </div>
                        <div>
                          <label className={labelCls}>{t('plate_state')} *</label>
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
                          {fieldErrors.plate_state && (
                            <p className="text-red-500 text-xs mt-1">{fieldErrors.plate_state}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className={labelCls}>{t('make')} *</label>
                          <select
                            value={make}
                            onChange={(e) => setMake(e.target.value)}
                            className={inputCls}
                          >
                            <option value=""></option>
                            {CAR_MAKES.map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                          {fieldErrors.make && (
                            <p className="text-red-500 text-xs mt-1">{fieldErrors.make}</p>
                          )}
                        </div>
                        <div>
                          <label className={labelCls}>{t('model')} *</label>
                          <input
                            type="text"
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            className={inputCls}
                          />
                          {fieldErrors.model && (
                            <p className="text-red-500 text-xs mt-1">{fieldErrors.model}</p>
                          )}
                        </div>
                        <div>
                          <label className={labelCls}>{t('color')} *</label>
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
                          {fieldErrors.color && (
                            <p className="text-red-500 text-xs mt-1">{fieldErrors.color}</p>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className={labelCls}>{t('vehicle_type')}</label>
                        <select
                          value={vehicleType}
                          onChange={(e) => setVehicleType(e.target.value)}
                          className={inputCls}
                        >
                          <option value=""></option>
                          {VEHICLE_TYPES.map((vt) => (
                            <option key={vt} value={vt}>{vt}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Dates */}
                  <div>
                    <h2 className={sectionCls}>{t('section_dates')}</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                          min={(() => {
                            if (!startDatetime) return undefined
                            const d = new Date(startDatetime)
                            d.setDate(d.getDate() + 1)
                            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T00:00`
                          })()}
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
                  disabled={submitting}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 mt-6"
                >
                  {submitting ? t('submitting') : t('submit')}
                </button>
              </fieldset>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
