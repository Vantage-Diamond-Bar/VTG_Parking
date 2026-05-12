'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { US_STATES, CAR_COLORS, CAR_MAKES } from '@/lib/utils'
import PhoneInput, { dialCode } from '@/components/PhoneInput'

interface Vehicle {
  year: string
  make: string
  model: string
  color: string
  license_plate: string
  plate_state: string
  registration_doc_base64: string
  registration_doc_filename: string
  is_oversized: boolean
}

interface Unit {
  id: string
  address: string
}

function emptyVehicle(): Vehicle {
  return {
    year: '',
    make: '',
    model: '',
    color: '',
    license_plate: '',
    plate_state: '',
    registration_doc_base64: '',
    registration_doc_filename: '',
    is_oversized: false,
  }
}

export default function RegisterPage() {
  const t = useTranslations('register')

  const [units, setUnits] = useState<Unit[]>([])
  const [unitId, setUnitId] = useState('')
  const [registrantType, setRegistrantType] = useState<'owner' | 'tenant'>('owner')
  const [ownerFirstName, setOwnerFirstName] = useState('')
  const [ownerLastName, setOwnerLastName] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [vehicles, setVehicles] = useState<Vehicle[]>([emptyVehicle()])
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

  function updateVehicle(index: number, field: keyof Vehicle, value: string) {
    setVehicles((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  async function handleFileChange(index: number, file: File | null) {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setFieldErrors((prev) => ({ ...prev, [`doc_${index}`]: 'File exceeds 5MB limit' }))
      return
    }
    setFieldErrors((prev) => {
      const next = { ...prev }
      delete next[`doc_${index}`]
      return next
    })
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(',')[1] ?? '')
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    updateVehicle(index, 'registration_doc_base64', base64)
    updateVehicle(index, 'registration_doc_filename', file.name)
  }

  function addVehicle() {
    setVehicles((prev) => [...prev, emptyVehicle()])
  }

  function removeVehicle(index: number) {
    setVehicles((prev) => prev.filter((_, i) => i !== index))
  }

  function validatePhone(phone: string): boolean {
    // Strip country code prefix (e.g. "+1 ") and check remaining digits
    const local = phone.replace(/^\+\d+(-\w+)?\s/, '')
    return local.replace(/\D/g, '').length >= 7
  }

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!unitId) errors.unit_id = t('required')
    if (!registrantType) errors.registrant_type = t('required')
    if (!ownerFirstName.trim()) errors.owner_first_name = t('required')
    if (!ownerLastName.trim()) errors.owner_last_name = t('required')
    if (!ownerPhone.trim()) errors.owner_phone = t('required')
    else if (!validatePhone(ownerPhone)) errors.owner_phone = 'Please enter a valid phone number.'
    if (!ownerEmail.trim()) errors.owner_email = t('required')
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim())) {
      errors.owner_email = 'Please enter a valid email address.'
    }

    vehicles.forEach((v, i) => {
      if (!v.year) errors[`year_${i}`] = t('required')
      if (!v.make) errors[`make_${i}`] = t('required')
      if (!v.model.trim()) errors[`model_${i}`] = t('required')
      if (!v.color) errors[`color_${i}`] = t('required')
      if (!v.license_plate.trim()) errors[`plate_${i}`] = t('required')
      if (!v.plate_state) errors[`state_${i}`] = t('required')
      if (!v.registration_doc_base64) errors[`doc_${i}`] = t('required')
    })

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
        registrant_type: registrantType,
        owner_name: `${ownerFirstName.trim()} ${ownerLastName.trim()}`,
        owner_phone: ownerPhone,
        owner_email: ownerEmail,
        opt_in_sms: true,
        opt_in_email: true,
        vehicles: vehicles.map((v) => ({
          year: Number(v.year),
          make: v.make,
          model: v.model,
          color: v.color,
          license_plate: v.license_plate.replace(/\s/g, '').toUpperCase(),
          plate_state: v.plate_state,
          registration_doc_base64: v.registration_doc_base64,
          registration_doc_filename: v.registration_doc_filename,
          is_oversized: v.is_oversized,
        })),
      }
      const res = await fetch('/api/residents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data?.error === 'plate_conflict') {
          setError(t('error_plate_conflict'))
        } else {
          setError(data?.error ?? data?.message ?? 'Submission failed')
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
    setUnitId('')
    setRegistrantType('owner')
    setOwnerFirstName('')
    setOwnerLastName('')
    setOwnerPhone('')
    setOwnerEmail('')
    setVehicles([emptyVehicle()])
    setSuccess(false)
    setError('')
    setFieldErrors({})
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
            {/* Unit Section */}
            <div>
              <h2 className={sectionCls}>{t('section_unit')}</h2>
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>{t('unit_number')} *</label>
                  <select
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">{t('unit_placeholder')}</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.address}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.unit_id && (
                    <p className="text-red-500 text-xs mt-1">{fieldErrors.unit_id}</p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>{t('registrant_type')} *</label>
                  <select
                    value={registrantType}
                    onChange={(e) => setRegistrantType(e.target.value as 'owner' | 'tenant')}
                    className={inputCls}
                  >
                    <option value="owner">{t('registrant_type_owner')}</option>
                    <option value="tenant">{t('registrant_type_tenant')}</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Contact Section */}
            <div>
              <h2 className={sectionCls}>{t('section_contact')}</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>{t('first_name')} *</label>
                    <input
                      type="text"
                      value={ownerFirstName}
                      onChange={(e) => setOwnerFirstName(e.target.value)}
                      className={inputCls}
                    />
                    {fieldErrors.owner_first_name && (
                      <p className="text-red-500 text-xs mt-1">{fieldErrors.owner_first_name}</p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>{t('last_name')} *</label>
                    <input
                      type="text"
                      value={ownerLastName}
                      onChange={(e) => setOwnerLastName(e.target.value)}
                      className={inputCls}
                    />
                    {fieldErrors.owner_last_name && (
                      <p className="text-red-500 text-xs mt-1">{fieldErrors.owner_last_name}</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>{t('phone')} *</label>
                  <PhoneInput
                    value={ownerPhone}
                    onChange={setOwnerPhone}
                  />
                  {fieldErrors.owner_phone && (
                    <p className="text-red-500 text-xs mt-1">{fieldErrors.owner_phone}</p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>{t('email')} *</label>
                  <input
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    className={inputCls}
                  />
                  {fieldErrors.owner_email && (
                    <p className="text-red-500 text-xs mt-1">{fieldErrors.owner_email}</p>
                  )}
                </div>
                {/* Combined consent notice */}
                <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  {t('contact_consent')}
                </p>
              </div>
            </div>

            {/* Vehicle Section */}
            <div>
              <h2 className={sectionCls}>{t('section_vehicle')}</h2>

              <div className="space-y-6">
                {vehicles.map((vehicle, index) => (
                  <div key={index} className="border border-gray-200 rounded-xl p-4 space-y-4">
                    {vehicles.length > 1 && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600">
                          Vehicle {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeVehicle(index)}
                          className="text-red-500 text-sm hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls}>{t('year')} *</label>
                        <input
                          type="number"
                          min={1990}
                          max={2030}
                          value={vehicle.year}
                          onChange={(e) => updateVehicle(index, 'year', e.target.value)}
                          className={inputCls}
                        />
                        {fieldErrors[`year_${index}`] && (
                          <p className="text-red-500 text-xs mt-1">{fieldErrors[`year_${index}`]}</p>
                        )}
                      </div>
                      <div>
                        <label className={labelCls}>{t('color')} *</label>
                        <select
                          value={vehicle.color}
                          onChange={(e) => updateVehicle(index, 'color', e.target.value)}
                          className={inputCls}
                        >
                          <option value=""></option>
                          {CAR_COLORS.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        {fieldErrors[`color_${index}`] && (
                          <p className="text-red-500 text-xs mt-1">{fieldErrors[`color_${index}`]}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls}>{t('make')} *</label>
                        <select
                          value={vehicle.make}
                          onChange={(e) => updateVehicle(index, 'make', e.target.value)}
                          className={inputCls}
                        >
                          <option value=""></option>
                          {CAR_MAKES.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        {fieldErrors[`make_${index}`] && (
                          <p className="text-red-500 text-xs mt-1">{fieldErrors[`make_${index}`]}</p>
                        )}
                      </div>
                      <div>
                        <label className={labelCls}>{t('model')} *</label>
                        <input
                          type="text"
                          value={vehicle.model}
                          onChange={(e) => updateVehicle(index, 'model', e.target.value)}
                          className={inputCls}
                        />
                        {fieldErrors[`model_${index}`] && (
                          <p className="text-red-500 text-xs mt-1">{fieldErrors[`model_${index}`]}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls}>{t('license_plate')} *</label>
                        <input
                          type="text"
                          value={vehicle.license_plate}
                          title={t('plate_hint')}
                          onChange={(e) =>
                            updateVehicle(index, 'license_plate', e.target.value.replace(/\s/g, '').toUpperCase())
                          }
                          className={inputCls}
                          placeholder="ABC1234"
                        />
                        <p className="text-xs text-gray-400 mt-1">{t('plate_hint')}</p>
                        {fieldErrors[`plate_${index}`] && (
                          <p className="text-red-500 text-xs mt-1">{fieldErrors[`plate_${index}`]}</p>
                        )}
                      </div>
                      <div>
                        <label className={labelCls}>{t('plate_state')} *</label>
                        <select
                          value={vehicle.plate_state}
                          onChange={(e) => updateVehicle(index, 'plate_state', e.target.value)}
                          className={inputCls}
                        >
                          <option value=""></option>
                          {US_STATES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        {fieldErrors[`state_${index}`] && (
                          <p className="text-red-500 text-xs mt-1">{fieldErrors[`state_${index}`]}</p>
                        )}
                      </div>
                    </div>

                    {/* Oversized Vehicle */}
                    <div className="space-y-2">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={vehicle.is_oversized}
                          onChange={(e) => {
                            setVehicles((prev) => {
                              const next = [...prev]
                              next[index] = { ...next[index], is_oversized: e.target.checked }
                              return next
                            })
                          }}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                        />
                        <span className="text-sm font-medium text-gray-700">{t('is_oversized_label')}</span>
                      </label>
                      {vehicle.is_oversized && (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 ml-7">
                          {t('oversized_notice')}
                        </p>
                      )}
                    </div>

                    {/* Document Upload — always required */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('section_docs')}</h3>
                      <label className={labelCls}>
                        {t('upload_doc')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.pdf"
                        onChange={(e) => handleFileChange(index, e.target.files?.[0] ?? null)}
                        className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      <p className="text-xs text-gray-400 mt-1">{t('upload_hint')}</p>
                      {vehicle.registration_doc_filename && (
                        <p className="text-xs text-green-600 mt-1">
                          Selected: {vehicle.registration_doc_filename}
                        </p>
                      )}
                      {fieldErrors[`doc_${index}`] && (
                        <p className="text-red-500 text-xs mt-1">{fieldErrors[`doc_${index}`]}</p>
                      )}
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addVehicle}
                  className="w-full border-2 border-dashed border-blue-300 text-blue-600 py-3 rounded-lg text-sm font-semibold hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  + {t('add_vehicle')}
                </button>
              </div>
            </div>

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
