'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import PhoneInput from '@/components/PhoneInput'
import { splitPhone, ptInputToISO } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Unit {
  id: string
  address: string
}

interface Vehicle {
  id: string
  year: number
  make: string
  model: string
  color: string
  license_plate: string
  plate_state: string
  is_oversized: boolean
  owner_name: string
  owner_phone: string
  owner_email: string
  registrant_type: string
}

interface Owner {
  name: string
  phone: string
  phone_country_code: string | null
  email: string
  registrant_type: string
}

type VacationFlowState =
  | 'idle'
  | 'checking'
  | 'no_vehicles'
  | 'overdue'
  | 'not_eligible'
  | 'awaiting_email'
  | 'otp_sending'
  | 'otp_sent'
  | 'otp_verifying'
  | 'otp_invalid'
  | 'email_mismatch'
  | 'loading_vehicles'
  | 'form'
  | 'submitting'
  | 'success'

// ─── Component ────────────────────────────────────────────────────────────────

export default function VacationPage() {
  const t = useTranslations('vacation')

  // ── Step 1: Unit list & selection ────────────────────────────────────────
  const [units, setUnits] = useState<Unit[]>([])
  const [unitId, setUnitId] = useState('')

  // ── Step 2: Unit check ───────────────────────────────────────────────────
  const [flowState, setFlowState] = useState<VacationFlowState>('idle')
  const [emailHints, setEmailHints] = useState<string[]>([])

  // ── Step 3: Email verification ───────────────────────────────────────────
  const [emailInput, setEmailInput] = useState('')
  const [verifiedEmail, setVerifiedEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [verificationToken, setVerificationToken] = useState('')

  // ── Step 4: Vehicles & owner info ────────────────────────────────────────
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [owner, setOwner] = useState<Owner | null>(null)
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([])

  // ── Form fields ──────────────────────────────────────────────────────────
  const [emergencyFirstName, setEmergencyFirstName] = useState('')
  const [emergencyLastName, setEmergencyLastName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  const [emergencyPhoneCC, setEmergencyPhoneCC] = useState('+1')
  const [emergencyPhoneLocal, setEmergencyPhoneLocal] = useState('')
  const [reason, setReason] = useState('')
  const [startDatetime, setStartDatetime] = useState('')
  const [endDatetime, setEndDatetime] = useState('')

  // ── UI state ─────────────────────────────────────────────────────────────
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // ── Styles ───────────────────────────────────────────────────────────────
  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const sectionCls = 'text-lg font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-200'

  // ── Load units ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/units')
      .then((r) => r.json())
      .then((data) => setUnits(Array.isArray(data) ? data : data.units ?? []))
      .catch(() => {})
  }, [])

  // ── Unit change → unit-check API call ────────────────────────────────────
  async function handleUnitChange(id: string) {
    setUnitId(id)
    setFlowState('idle')
    setEmailHints([])
    setEmailInput('')
    setVerifiedEmail('')
    setOtpCode('')
    setVerificationToken('')
    setVehicles([])
    setOwner(null)
    setSelectedVehicleIds([])
    setError('')
    setFieldErrors({})

    if (!id) return

    setFlowState('checking')
    try {
      const res = await fetch(`/api/vacation/unit-check?unit_id=${id}`)
      const data = await res.json()

      if (!data.has_vehicles) {
        setFlowState('no_vehicles')
      } else if (data.has_overdue) {
        setFlowState('overdue')
      } else if (!data.is_eligible) {
        setFlowState('not_eligible')
      } else {
        setEmailHints(data.email_hints ?? [])
        setFlowState('awaiting_email')
      }
    } catch {
      setFlowState('idle')
    }
  }

  // ── Step 1: Send OTP to email ─────────────────────────────────────────────
  async function handleSendOtp() {
    if (!emailInput.trim()) return
    setFlowState('otp_sending')
    setError('')
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit_id: unitId, email: emailInput.trim() }),
      })
      const data = await res.json()
      if (data.status === 'sent') {
        setFlowState('otp_sent')
      } else if (data.status === 'no_vehicles') {
        setFlowState('no_vehicles')
      } else {
        setFlowState('email_mismatch')
      }
    } catch {
      setFlowState('email_mismatch')
    }
  }

  // ── Step 2: Verify OTP code ───────────────────────────────────────────────
  async function handleVerifyOtp() {
    setFlowState('otp_verifying')
    try {
      const otpRes = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit_id: unitId, email: emailInput.trim(), otp: otpCode }),
      })
      const otpData = await otpRes.json()
      if (otpData.status !== 'ok') {
        setFlowState('otp_invalid')
        return
      }
      const token = otpData.verification_token
      setVerificationToken(token)
      setVerifiedEmail(emailInput.trim())
      setFlowState('loading_vehicles')
      await loadVehicles(unitId, token)
    } catch {
      setFlowState('otp_invalid')
    }
  }

  // ── Load vehicles after OTP verification ──────────────────────────────────
  async function loadVehicles(uid: string, token: string) {
    try {
      const res = await fetch(
        `/api/vacation/unit-vehicles?unit_id=${uid}&token=${encodeURIComponent(token)}`
      )
      const data = await res.json()

      if (!res.ok || data.error === 'no_vehicles') {
        setFlowState('email_mismatch')
        return
      }

      setVehicles(data.vehicles ?? [])
      setOwner(data.owner ?? null)
      setFlowState('form')
    } catch {
      setFlowState('email_mismatch')
    }
  }

  // ── Vehicle checkbox toggle ───────────────────────────────────────────────
  function toggleVehicle(vehicleId: string) {
    setSelectedVehicleIds((prev) => {
      if (prev.includes(vehicleId)) {
        return prev.filter((id) => id !== vehicleId)
      }
      if (prev.length >= 2) return prev
      return [...prev, vehicleId]
    })
  }

  // ── Validation ────────────────────────────────────────────────────────────
  function validatePhone(p: string) {
    const local = p.replace(/^\+\d+(-\w+)?\s/, '')
    return local.replace(/\D/g, '').length >= 7
  }

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!emergencyFirstName.trim()) errors.emergency_first_name = t('required')
    if (!emergencyLastName.trim()) errors.emergency_last_name = t('required')
    if (!emergencyPhone.trim()) errors.emergency_phone = t('required')
    else if (!validatePhone(emergencyPhone)) errors.emergency_phone = 'Please enter a valid phone number.'
    if (!startDatetime) errors.start_datetime = t('required')
    if (!endDatetime) errors.end_datetime = t('required')
    if (startDatetime && endDatetime && endDatetime <= startDatetime)
      errors.end_datetime = t('end_after_start')
    if (selectedVehicleIds.length === 0) errors.vehicles = 'Please select at least one vehicle.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!validate()) return
    if (!owner) return

    setFlowState('submitting')

    const selectedVehicles = vehicles.filter((v) => selectedVehicleIds.includes(v.id))

    try {
      for (const vehicle of selectedVehicles) {
        const res = await fetch('/api/vacation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: verificationToken,
            unit_id: unitId,
            registrant_type: vehicle.registrant_type,
            first_name: owner.name.split(' ')[0] ?? owner.name,
            last_name: owner.name.split(' ').slice(1).join(' ') || owner.name,
            phone: splitPhone(owner.phone).number,
            phone_country_code: splitPhone(owner.phone).countryCode,
            email: owner.email,
            reason: reason.trim() || null,
            emergency_first_name: emergencyFirstName.trim(),
            emergency_last_name: emergencyLastName.trim(),
            emergency_phone: emergencyPhoneLocal,
            emergency_phone_country_code: emergencyPhoneCC,
            start_datetime: ptInputToISO(startDatetime),
            end_datetime: ptInputToISO(endDatetime),
            year: vehicle.year,
            make: vehicle.make,
            model: vehicle.model,
            color: vehicle.color,
            license_plate: vehicle.license_plate,
            plate_state: vehicle.plate_state,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          if (data?.error === 'registration_overdue') {
            setError(t('error_registration_overdue'))
          } else {
            setError(data?.error ?? 'Submission failed. Please try again.')
          }
          setFlowState('form')
          return
        }
      }

      setFlowState('success')
    } catch {
      setError('Network error. Please try again.')
      setFlowState('form')
    }
  }

  // ── Full reset ────────────────────────────────────────────────────────────
  function resetAll() {
    setUnitId('')
    setFlowState('idle')
    setEmailHints([])
    setEmailInput('')
    setVerifiedEmail('')
    setOtpCode('')
    setVerificationToken('')
    setVehicles([])
    setOwner(null)
    setSelectedVehicleIds([])
    setEmergencyFirstName('')
    setEmergencyLastName('')
    setEmergencyPhone('')
    setEmergencyPhoneCC('+1')
    setEmergencyPhoneLocal('')
    setReason('')
    setStartDatetime('')
    setEndDatetime('')
    setError('')
    setFieldErrors({})
  }

  // ─── Success screen ───────────────────────────────────────────────────────

  if (flowState === 'success') {
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
            <p className="text-gray-500 mb-6">{t('success_desc')}</p>
            <button
              onClick={resetAll}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              {t('submit_another')}
            </button>
            <Link href="/" className="block mt-3 text-sm text-blue-600 hover:underline">
              ← {t('back_home')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ─── Main page ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
          ← Back
        </Link>

        {/* Eligibility Notice */}
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-5 mb-6">
          <h2 className="text-base font-bold text-amber-900 mb-2">⚠️ {t('eligibility_notice_title')}</h2>
          <ul className="text-sm text-amber-800 space-y-1.5 list-disc list-inside">
            <li>{t('eligibility_item_1')}</li>
            <li>{t('eligibility_item_2')}</li>
            <li>{t('eligibility_item_3')}</li>
            <li>{t('eligibility_item_4')}</li>
          </ul>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('title')}</h1>
          <p className="text-gray-500 text-sm mb-6">{t('subtitle')}</p>

          {/* ── Step 1: Unit selection ───────────────────────────────────── */}
          <div className="mb-6">
            <label className={labelCls}>{t('unit_number')} *</label>
            <select
              value={unitId}
              onChange={(e) => handleUnitChange(e.target.value)}
              className={inputCls}
            >
              <option value="">{t('unit_placeholder')}</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.address}
                </option>
              ))}
            </select>
          </div>

          {/* ── Step 2: Unit check feedback ──────────────────────────────── */}
          {unitId && flowState === 'checking' && (
            <p className="text-sm text-gray-500 text-center py-4">Checking unit eligibility…</p>
          )}

          {flowState === 'no_vehicles' && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 text-sm text-amber-800">
              🚫 This unit has no registered vehicles. Please register your vehicle(s) first before applying.
            </div>
          )}

          {flowState === 'overdue' && (
            <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-3 text-sm text-red-800">
              ⚠️ One or more vehicles registered to this unit have overdue registration. Please renew your vehicle registration before applying.
            </div>
          )}

          {flowState === 'not_eligible' && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 text-sm text-amber-800">
              ⚠️ Your unit does not meet the eligibility requirements. At least 3 registered vehicles or 1 oversized vehicle is required to apply for vacation extended parking.
            </div>
          )}

          {/* ── Step 3a: Email input & send OTP ─────────────────────────── */}
          {(flowState === 'awaiting_email' || flowState === 'otp_sending' || flowState === 'email_mismatch') && (
            <div className="border border-blue-200 bg-blue-50 rounded-lg px-4 py-4 space-y-3">
              <p className="text-sm font-semibold text-blue-900">{t('verify_email_title')}</p>
              <p className="text-xs text-blue-700">{t('verify_email_desc')}</p>
              {emailHints.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">{t('email_hint_prefix')}</p>
                  <div className="flex flex-wrap gap-2">
                    {emailHints.map((hint, i) => (
                      <span
                        key={i}
                        className="font-mono text-sm bg-white border border-blue-200 rounded px-2 py-0.5 text-blue-800"
                      >
                        {hint}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                  placeholder={t('host_email')}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={!emailInput.trim() || flowState === 'otp_sending'}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {flowState === 'otp_sending' ? t('sending') : t('send_code')}
                </button>
              </div>
              {flowState === 'email_mismatch' && (
                <p className="text-red-600 text-xs">{t('email_mismatch')}</p>
              )}
            </div>
          )}

          {/* ── Step 3b: OTP code entry ──────────────────────────────────── */}
          {(flowState === 'otp_sent' || flowState === 'otp_verifying' || flowState === 'otp_invalid') && (
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
                  onKeyDown={(e) => e.key === 'Enter' && otpCode.length === 6 && handleVerifyOtp()}
                  placeholder={t('otp_placeholder')}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleVerifyOtp}
                  disabled={otpCode.length < 6 || flowState === 'otp_verifying'}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {flowState === 'otp_verifying' ? t('otp_verifying') : t('otp_verify')}
                </button>
              </div>
              {flowState === 'otp_invalid' && (
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

          {flowState === 'loading_vehicles' && (
            <p className="text-sm text-gray-500 text-center py-4">Loading your registered vehicles…</p>
          )}

          {/* ── Steps 4–9: Full form (only when flow === 'form' or 'submitting') */}
          {(flowState === 'form' || flowState === 'submitting') && owner && (
            <form onSubmit={handleSubmit} className="space-y-8">

              {/* ── Owner info panel ───────────────────────────────────── */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-green-600 text-xs font-semibold">✓ {t('email_verified')}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wide">Name</span>
                    <p className="font-medium text-gray-900 mt-0.5">{owner.name}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wide">Phone</span>
                    <p className="font-medium text-gray-900 mt-0.5">{owner.phone_country_code && <span className="text-gray-500 mr-1">{owner.phone_country_code}</span>}{owner.phone}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-gray-500 text-xs uppercase tracking-wide">Email</span>
                    <p className="font-medium text-gray-900 mt-0.5">{owner.email}</p>
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mt-2">
                  <p className="text-sm font-bold text-blue-900">
                    📧 Please confirm this email is correct — your approval decision and parking access code will be sent to this address.
                  </p>
                </div>
              </div>

              {/* ── Emergency Contact ──────────────────────────────────── */}
              <div>
                <h2 className={sectionCls}>{t('section_emergency')}</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>{t('emergency_first_name')} *</label>
                      <input
                        type="text"
                        value={emergencyFirstName}
                        onChange={(e) => setEmergencyFirstName(e.target.value)}
                        className={inputCls}
                      />
                      {fieldErrors.emergency_first_name && (
                        <p className="text-red-500 text-xs mt-1">{fieldErrors.emergency_first_name}</p>
                      )}
                    </div>
                    <div>
                      <label className={labelCls}>{t('emergency_last_name')} *</label>
                      <input
                        type="text"
                        value={emergencyLastName}
                        onChange={(e) => setEmergencyLastName(e.target.value)}
                        className={inputCls}
                      />
                      {fieldErrors.emergency_last_name && (
                        <p className="text-red-500 text-xs mt-1">{fieldErrors.emergency_last_name}</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>{t('emergency_phone')} *</label>
                    <PhoneInput
                      value={emergencyPhone}
                      onChange={setEmergencyPhone}
                      onChangeSplit={({ countryCode, number }) => { setEmergencyPhoneCC(countryCode); setEmergencyPhoneLocal(number) }}
                    />
                    {fieldErrors.emergency_phone && (
                      <p className="text-red-500 text-xs mt-1">{fieldErrors.emergency_phone}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Reason ────────────────────────────────────────────── */}
              <div>
                <h2 className={sectionCls}>{t('section_applicant')}</h2>
                <div>
                  <label className={labelCls}>{t('reason')}</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder={t('reason_placeholder')}
                    className={`${inputCls} resize-none`}
                  />
                </div>
              </div>

              {/* ── Parking Period ────────────────────────────────────── */}
              <div>
                <h2 className={sectionCls}>{t('section_period')}</h2>
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
                      onChange={(e) => setEndDatetime(e.target.value)}
                      className={inputCls}
                    />
                    {fieldErrors.end_datetime && (
                      <p className="text-red-500 text-xs mt-1">{fieldErrors.end_datetime}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Vehicle Selection ─────────────────────────────────── */}
              <div>
                <h2 className={sectionCls}>{t('section_vehicle')}</h2>
                <p className="text-sm text-gray-500 mb-3">
                  Select vehicle(s) for this request (max 2).
                </p>
                <div className="space-y-3">
                  {vehicles.map((vehicle) => {
                    const isSelected = selectedVehicleIds.includes(vehicle.id)
                    const isDisabled = !isSelected && selectedVehicleIds.length >= 2
                    return (
                      <label
                        key={vehicle.id}
                        className={[
                          'flex items-start gap-3 border rounded-xl p-4 cursor-pointer transition-colors',
                          isSelected
                            ? 'border-blue-500 bg-blue-50'
                            : isDisabled
                            ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                            : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30',
                        ].join(' ')}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isDisabled}
                          onChange={() => !isDisabled && toggleVehicle(vehicle.id)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm">
                            {vehicle.year} {vehicle.color} {vehicle.make} {vehicle.model}
                          </p>
                          <p className="text-xs font-mono text-gray-500 mt-0.5">
                            {vehicle.license_plate} · {vehicle.plate_state}
                          </p>
                          {vehicle.is_oversized && (
                            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full mt-1 inline-block">
                              Oversized
                            </span>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
                {fieldErrors.vehicles && (
                  <p className="text-red-500 text-xs mt-2">{fieldErrors.vehicles}</p>
                )}
              </div>

              {/* ── Consent ───────────────────────────────────────────── */}
              <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                {t('contact_consent')}
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={flowState === 'submitting'}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {flowState === 'submitting' ? t('submitting') : t('submit')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
