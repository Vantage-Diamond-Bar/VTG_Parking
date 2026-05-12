'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { US_STATES, CAR_COLORS, CAR_MAKES } from '@/lib/utils'
import PhoneInput from '@/components/PhoneInput'

interface Unit {
  id: string
  address: string
}

export default function VacationPage() {
  const t = useTranslations('vacation')

  const [units, setUnits] = useState<Unit[]>([])
  const [unitId, setUnitId] = useState('')
  const [registrantType, setRegistrantType] = useState<'owner' | 'tenant'>('owner')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [emergencyFirstName, setEmergencyFirstName] = useState('')
  const [emergencyLastName, setEmergencyLastName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')
  const [startDatetime, setStartDatetime] = useState('')
  const [endDatetime, setEndDatetime] = useState('')
  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [color, setColor] = useState('')
  const [licensePlate, setLicensePlate] = useState('')
  const [plateState, setPlateState] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/api/units')
      .then((r) => r.json())
      .then((data) => setUnits(Array.isArray(data) ? data : data.units ?? []))
      .catch(() => {})
  }, [])

  function validatePhone(p: string) {
    const local = p.replace(/^\+\d+(-\w+)?\s/, '')
    return local.replace(/\D/g, '').length >= 7
  }

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!unitId) errors.unit_id = t('required')
    if (!firstName.trim()) errors.first_name = t('required')
    if (!lastName.trim()) errors.last_name = t('required')
    if (!phone.trim()) errors.phone = t('required')
    else if (!validatePhone(phone)) errors.phone = 'Please enter a valid phone number.'
    if (!email.trim()) errors.email = t('required')
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Please enter a valid email address.'
    if (!emergencyFirstName.trim()) errors.emergency_first_name = t('required')
    if (!emergencyLastName.trim()) errors.emergency_last_name = t('required')
    if (!emergencyPhone.trim()) errors.emergency_phone = t('required')
    else if (!validatePhone(emergencyPhone)) errors.emergency_phone = 'Please enter a valid phone number.'
    if (!startDatetime) errors.start_datetime = t('required')
    if (!endDatetime) errors.end_datetime = t('required')
    if (startDatetime && endDatetime && endDatetime <= startDatetime)
      errors.end_datetime = t('end_after_start')
    if (!year) errors.year = t('required')
    if (!make) errors.make = t('required')
    if (!model.trim()) errors.model = t('required')
    if (!color) errors.color = t('required')
    if (!licensePlate.trim()) errors.license_plate = t('required')
    if (!plateState) errors.plate_state = t('required')
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!validate()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/vacation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit_id: unitId,
          registrant_type: registrantType,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone,
          email: email.trim(),
          reason: reason.trim() || null,
          emergency_first_name: emergencyFirstName.trim(),
          emergency_last_name: emergencyLastName.trim(),
          emergency_phone: emergencyPhone,
          start_datetime: startDatetime,
          end_datetime: endDatetime,
          year: Number(year),
          make,
          model: model.trim(),
          color,
          license_plate: licensePlate.replace(/\s/g, '').toUpperCase(),
          plate_state: plateState,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data?.error === 'registration_overdue') {
          setError(t('error_registration_overdue'))
        } else {
          setError(data?.error ?? 'Submission failed. Please try again.')
        }
        return
      }
      setSuccess(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function resetForm() {
    setUnitId(''); setRegistrantType('owner'); setFirstName(''); setLastName('')
    setPhone(''); setEmail(''); setReason('');
    setEmergencyFirstName(''); setEmergencyLastName(''); setEmergencyPhone('')
    setStartDatetime(''); setEndDatetime(''); setYear(''); setMake(''); setModel('')
    setColor(''); setLicensePlate(''); setPlateState('')
    setSuccess(false); setError(''); setFieldErrors({})
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const sectionCls = 'text-lg font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-200'

  if (success) {
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
              onClick={resetForm}
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

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Unit & Registrant */}
            <div>
              <h2 className={sectionCls}>{t('section_unit')}</h2>
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>{t('unit_number')} *</label>
                  <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className={inputCls}>
                    <option value="">{t('unit_placeholder')}</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>{u.address}</option>
                    ))}
                  </select>
                  {fieldErrors.unit_id && <p className="text-red-500 text-xs mt-1">{fieldErrors.unit_id}</p>}
                </div>
                <div>
                  <label className={labelCls}>{t('registrant_type')} *</label>
                  <select value={registrantType} onChange={(e) => setRegistrantType(e.target.value as 'owner' | 'tenant')} className={inputCls}>
                    <option value="owner">{t('registrant_type_owner')}</option>
                    <option value="tenant">{t('registrant_type_tenant')}</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Applicant Info */}
            <div>
              <h2 className={sectionCls}>{t('section_applicant')}</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>{t('first_name')} *</label>
                    <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} />
                    {fieldErrors.first_name && <p className="text-red-500 text-xs mt-1">{fieldErrors.first_name}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>{t('last_name')} *</label>
                    <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} />
                    {fieldErrors.last_name && <p className="text-red-500 text-xs mt-1">{fieldErrors.last_name}</p>}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>{t('phone')} *</label>
                  <PhoneInput value={phone} onChange={setPhone} />
                  {fieldErrors.phone && <p className="text-red-500 text-xs mt-1">{fieldErrors.phone}</p>}
                </div>
                <div>
                  <label className={labelCls}>{t('email')} *</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
                  <p className="text-xs text-gray-400 mt-1">{t('email_hint')}</p>
                  {fieldErrors.email && <p className="text-red-500 text-xs mt-1">{fieldErrors.email}</p>}
                </div>
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
            </div>

            {/* Emergency Contact */}
            <div>
              <h2 className={sectionCls}>{t('section_emergency')}</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>{t('emergency_first_name')} *</label>
                    <input type="text" value={emergencyFirstName} onChange={(e) => setEmergencyFirstName(e.target.value)} className={inputCls} />
                    {fieldErrors.emergency_first_name && <p className="text-red-500 text-xs mt-1">{fieldErrors.emergency_first_name}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>{t('emergency_last_name')} *</label>
                    <input type="text" value={emergencyLastName} onChange={(e) => setEmergencyLastName(e.target.value)} className={inputCls} />
                    {fieldErrors.emergency_last_name && <p className="text-red-500 text-xs mt-1">{fieldErrors.emergency_last_name}</p>}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>{t('emergency_phone')} *</label>
                  <PhoneInput value={emergencyPhone} onChange={setEmergencyPhone} />
                  {fieldErrors.emergency_phone && <p className="text-red-500 text-xs mt-1">{fieldErrors.emergency_phone}</p>}
                </div>
              </div>
            </div>

            {/* Parking Period */}
            <div>
              <h2 className={sectionCls}>{t('section_period')}</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>{t('start_datetime')} *</label>
                  <input type="datetime-local" value={startDatetime} onChange={(e) => setStartDatetime(e.target.value)} className={inputCls} />
                  {fieldErrors.start_datetime && <p className="text-red-500 text-xs mt-1">{fieldErrors.start_datetime}</p>}
                </div>
                <div>
                  <label className={labelCls}>{t('end_datetime')} *</label>
                  <input type="datetime-local" value={endDatetime} onChange={(e) => setEndDatetime(e.target.value)} className={inputCls} />
                  {fieldErrors.end_datetime && <p className="text-red-500 text-xs mt-1">{fieldErrors.end_datetime}</p>}
                </div>
              </div>
            </div>

            {/* Vehicle Info */}
            <div>
              <h2 className={sectionCls}>{t('section_vehicle')}</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>{t('year')} *</label>
                    <input type="number" min={1990} max={2030} value={year} onChange={(e) => setYear(e.target.value)} className={inputCls} />
                    {fieldErrors.year && <p className="text-red-500 text-xs mt-1">{fieldErrors.year}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>{t('color')} *</label>
                    <select value={color} onChange={(e) => setColor(e.target.value)} className={inputCls}>
                      <option value=""></option>
                      {CAR_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {fieldErrors.color && <p className="text-red-500 text-xs mt-1">{fieldErrors.color}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>{t('make')} *</label>
                    <select value={make} onChange={(e) => setMake(e.target.value)} className={inputCls}>
                      <option value=""></option>
                      {CAR_MAKES.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    {fieldErrors.make && <p className="text-red-500 text-xs mt-1">{fieldErrors.make}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>{t('model')} *</label>
                    <input type="text" value={model} onChange={(e) => setModel(e.target.value)} className={inputCls} />
                    {fieldErrors.model && <p className="text-red-500 text-xs mt-1">{fieldErrors.model}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>{t('license_plate')} *</label>
                    <input
                      type="text"
                      value={licensePlate}
                      onChange={(e) => setLicensePlate(e.target.value.replace(/\s/g, '').toUpperCase())}
                      placeholder="ABC1234"
                      className={inputCls}
                    />
                    {fieldErrors.license_plate && <p className="text-red-500 text-xs mt-1">{fieldErrors.license_plate}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>{t('plate_state')} *</label>
                    <select value={plateState} onChange={(e) => setPlateState(e.target.value)} className={inputCls}>
                      <option value=""></option>
                      {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {fieldErrors.plate_state && <p className="text-red-500 text-xs mt-1">{fieldErrors.plate_state}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* Consent notice */}
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
              disabled={submitting}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? t('submitting') : t('submit')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
