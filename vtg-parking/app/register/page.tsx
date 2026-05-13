'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { US_STATES, CAR_COLORS, CAR_MAKES, VISITOR_QUOTA_LIMIT, getYearMonth, generateMonthOptions } from '@/lib/utils'
import PhoneInput from '@/components/PhoneInput'

// ─── Types ─────────────────────────────────────────────────────────────────

interface Unit { id: string; address: string }

interface VehicleForm {
  year: string; make: string; model: string; color: string
  license_plate: string; plate_state: string
  registration_doc_base64: string; registration_doc_filename: string
  is_oversized: boolean
}

interface ResidentVehicle {
  id: string; unit_id: string; year: number; make: string; model: string
  color: string; license_plate: string; plate_state: string
  is_oversized: boolean; registration_doc_url?: string
  owner_name: string; owner_email: string; owner_phone: string
  registrant_type: string; created_at: string
}

interface ViolationRecord {
  id: string; submitted_at: string; location: string; violation_type: string
  status: string; resolution_type?: string; final_violation_type?: string; final_location?: string
}

interface UnitData {
  vehicles: ResidentVehicle[]
  unit_address: string
  violations: ViolationRecord[]
  quota: { nights_used: number; quota_limit: number }
}

type PageState = 'idle' | 'checking' | 'new' | 'verify' | 'manage' | 'new_success'

// ─── Helpers ───────────────────────────────────────────────────────────────

function emptyVehicle(): VehicleForm {
  return { year: '', make: '', model: '', color: '', license_plate: '', plate_state: '', registration_doc_base64: '', registration_doc_filename: '', is_oversized: false }
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  no_action: 'bg-gray-100 text-gray-700',
  resolved: 'bg-green-100 text-green-800',
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function RegisterPage() {
  const t = useTranslations('register')

  const [units, setUnits] = useState<Unit[]>([])
  const [unitId, setUnitId] = useState('')
  const [pageState, setPageState] = useState<PageState>('idle')

  // Verify state
  const [emailHints, setEmailHints] = useState<string[]>([])
  const [verifyEmail, setVerifyEmail] = useState('')
  const [verifyError, setVerifyError] = useState('')
  const [verifying, setVerifying] = useState(false)

  // Manage state
  const [unitData, setUnitData] = useState<UnitData | null>(null)
  const [confirmedEmail, setConfirmedEmail] = useState('')
  const [toast, setToast] = useState('')

  // New registration form state
  const [registrantType, setRegistrantType] = useState<'owner' | 'tenant'>('owner')
  const [ownerFirstName, setOwnerFirstName] = useState('')
  const [ownerLastName, setOwnerLastName] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [newVehicles, setNewVehicles] = useState<VehicleForm[]>([emptyVehicle()])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/api/units').then(r => r.json()).then(d => setUnits(Array.isArray(d) ? d : d.units ?? [])).catch(() => {})
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  // ── Unit selection ─────────────────────────────────────────────────────

  async function handleUnitChange(id: string) {
    setUnitId(id)
    setPageState('idle')
    setVerifyEmail('')
    setVerifyError('')
    setUnitData(null)
    if (!id) return
    setPageState('checking')
    try {
      const res = await fetch(`/api/residents/unit-status?unit_id=${id}`)
      const json = await res.json()
      if (json.has_vehicles) {
        setEmailHints(json.email_hints ?? [])
        setPageState('verify')
      } else {
        setPageState('new')
      }
    } catch {
      setPageState('new')
    }
  }

  // ── Verify existing owner ──────────────────────────────────────────────

  async function handleVerify() {
    const emailVal = verifyEmail.trim()
    if (!emailVal) return
    setVerifying(true)
    setVerifyError('')
    try {
      const res = await fetch(`/api/residents/unit-data?unit_id=${unitId}&email=${encodeURIComponent(emailVal)}`)
      const json = await res.json()
      if (!res.ok) {
        if (json?.error === 'no_vehicles') {
          setVerifyError('No registrations found for this unit. Please register your vehicle.')
        } else if (json?.error === 'email_mismatch') {
          setVerifyError(t('email_mismatch'))
        } else {
          setVerifyError(`Server error${json?.detail ? ': ' + json.detail : ''}. Please try again.`)
        }
        return
      }
      setUnitData(json)
      setConfirmedEmail(emailVal)
      setPageState('manage')
    } catch {
      setVerifyError('Network error. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  // ── Reload unit data ───────────────────────────────────────────────────

  const reloadUnitData = useCallback(async () => {
    if (!unitId || !confirmedEmail) return
    const res = await fetch(`/api/residents/unit-data?unit_id=${unitId}&email=${encodeURIComponent(confirmedEmail)}`)
    if (res.ok) setUnitData(await res.json())
  }, [unitId, confirmedEmail])

  // ── New registration submit ────────────────────────────────────────────

  function validatePhone(phone: string): boolean {
    const local = phone.replace(/^\+\d+(-\w+)?\s/, '')
    return local.replace(/\D/g, '').length >= 7
  }

  function validateNew(): boolean {
    const errors: Record<string, string> = {}
    if (!unitId) errors.unit_id = t('required')
    if (!ownerFirstName.trim()) errors.owner_first_name = t('required')
    if (!ownerLastName.trim()) errors.owner_last_name = t('required')
    if (!ownerPhone.trim()) errors.owner_phone = t('required')
    else if (!validatePhone(ownerPhone)) errors.owner_phone = 'Please enter a valid phone number.'
    if (!ownerEmail.trim()) errors.owner_email = t('required')
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim())) errors.owner_email = 'Please enter a valid email address.'
    newVehicles.forEach((v, i) => {
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

  async function handleNewSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError('')
    if (!validateNew()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/residents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit_id: unitId,
          registrant_type: registrantType,
          owner_name: `${ownerFirstName.trim()} ${ownerLastName.trim()}`,
          owner_phone: ownerPhone,
          owner_email: ownerEmail,
          opt_in_sms: true,
          opt_in_email: true,
          vehicles: newVehicles.map(v => ({
            year: Number(v.year), make: v.make, model: v.model, color: v.color,
            license_plate: v.license_plate.replace(/\s/g, '').toUpperCase(),
            plate_state: v.plate_state,
            registration_doc_base64: v.registration_doc_base64,
            registration_doc_filename: v.registration_doc_filename,
            is_oversized: v.is_oversized,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSubmitError(data?.error === 'plate_conflict' ? t('error_plate_conflict') : (data?.error ?? 'Submission failed'))
        return
      }
      setPageState('new_success')
    } catch {
      setSubmitError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Styles ──────────────────────────────────────────────────────────────
  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const sectionCls = 'text-lg font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-200'

  // ─── Render ───────────────────────────────────────────────────────────────

  if (pageState === 'new_success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('success_title')}</h2>
          <p className="text-gray-500 mb-6">{t('success_desc')}</p>
          <button
            onClick={() => { setPageState('idle'); setUnitId(''); setOwnerFirstName(''); setOwnerLastName(''); setOwnerPhone(''); setOwnerEmail(''); setNewVehicles([emptyVehicle()]); }}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            {t('register_another')}
          </button>
        </div>
      </div>
    )
  }

  if (pageState === 'manage' && unitData) {
    return (
      <ManageView
        t={t}
        unitId={unitId}
        confirmedEmail={confirmedEmail}
        unitData={unitData}
        units={units}
        toast={toast}
        showToast={showToast}
        onReload={reloadUnitData}
        inputCls={inputCls}
        labelCls={labelCls}
        sectionCls={sectionCls}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-blue-600 hover:underline mb-6 inline-block">← Back</Link>
        <div className="bg-white rounded-2xl shadow-md p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('title_manage')}</h1>
          <p className="text-gray-500 text-sm mb-6">{t('subtitle_manage')}</p>

          {/* Unit selector — always shown */}
          <div className="mb-6">
            <label className={labelCls}>{t('unit_number')} *</label>
            <select value={unitId} onChange={(e) => handleUnitChange(e.target.value)} className={inputCls}>
              <option value="">{t('unit_placeholder')}</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.address}</option>)}
            </select>
          </div>

          {pageState === 'checking' && (
            <p className="text-sm text-gray-400 text-center py-4">{t('checking')}</p>
          )}

          {/* Verify existing owner */}
          {pageState === 'verify' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-blue-900 mb-1">{t('verify_identity_title')}</h2>
                <p className="text-sm text-blue-700">{t('verify_identity_desc')}</p>
              </div>
              {emailHints.length > 0 && (
                <p className="text-xs text-blue-600">
                  {t('email_hint_prefix')} <span className="font-mono">{emailHints.join(', ')}</span>
                </p>
              )}
              <div>
                <label className={labelCls}>{t('your_email')}</label>
                <input
                  type="email"
                  value={verifyEmail}
                  onChange={e => { setVerifyEmail(e.target.value); setVerifyError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleVerify()}
                  className={inputCls}
                  placeholder="your@email.com"
                  autoFocus
                />
                {verifyError && <p className="text-red-500 text-xs mt-1">{verifyError}</p>}
              </div>
              <button
                onClick={handleVerify}
                disabled={verifying || !verifyEmail.trim()}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {verifying ? t('verifying') : t('verify')}
              </button>
            </div>
          )}

          {/* New registration form */}
          {pageState === 'new' && (
            <form onSubmit={handleNewSubmit} className="space-y-8">
              {/* Registrant type */}
              <div>
                <h2 className={sectionCls}>{t('section_unit')}</h2>
                <div>
                  <label className={labelCls}>{t('registrant_type')} *</label>
                  <select value={registrantType} onChange={e => setRegistrantType(e.target.value as any)} className={inputCls}>
                    <option value="owner">{t('registrant_type_owner')}</option>
                    <option value="tenant">{t('registrant_type_tenant')}</option>
                  </select>
                </div>
              </div>

              {/* Contact */}
              <div>
                <h2 className={sectionCls}>{t('section_contact')}</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>{t('first_name')} *</label>
                      <input type="text" value={ownerFirstName} onChange={e => setOwnerFirstName(e.target.value)} className={inputCls} />
                      {fieldErrors.owner_first_name && <p className="text-red-500 text-xs mt-1">{fieldErrors.owner_first_name}</p>}
                    </div>
                    <div>
                      <label className={labelCls}>{t('last_name')} *</label>
                      <input type="text" value={ownerLastName} onChange={e => setOwnerLastName(e.target.value)} className={inputCls} />
                      {fieldErrors.owner_last_name && <p className="text-red-500 text-xs mt-1">{fieldErrors.owner_last_name}</p>}
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>{t('phone')} *</label>
                    <PhoneInput value={ownerPhone} onChange={setOwnerPhone} />
                    {fieldErrors.owner_phone && <p className="text-red-500 text-xs mt-1">{fieldErrors.owner_phone}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>{t('email')} *</label>
                    <input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} className={inputCls} />
                    {fieldErrors.owner_email && <p className="text-red-500 text-xs mt-1">{fieldErrors.owner_email}</p>}
                  </div>
                  <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">{t('contact_consent')}</p>
                </div>
              </div>

              {/* Vehicles */}
              <div>
                <h2 className={sectionCls}>{t('section_vehicle')}</h2>
                <div className="space-y-6">
                  {newVehicles.map((vehicle, index) => (
                    <VehicleFormCard
                      key={index}
                      vehicle={vehicle}
                      index={index}
                      showRemove={newVehicles.length > 1}
                      fieldErrors={fieldErrors}
                      t={t}
                      inputCls={inputCls}
                      labelCls={labelCls}
                      onChange={(field, val) => {
                        setNewVehicles(prev => { const n = [...prev]; n[index] = { ...n[index], [field]: val }; return n })
                      }}
                      onRemove={() => setNewVehicles(prev => prev.filter((_, i) => i !== index))}
                      onFileChange={async (file) => {
                        if (!file) return
                        if (file.size > 5 * 1024 * 1024) { setFieldErrors(p => ({ ...p, [`doc_${index}`]: 'File exceeds 5MB' })); return }
                        setFieldErrors(p => { const n = { ...p }; delete n[`doc_${index}`]; return n })
                        const b64 = await fileToBase64(file)
                        setNewVehicles(prev => { const n = [...prev]; n[index] = { ...n[index], registration_doc_base64: b64, registration_doc_filename: file.name }; return n })
                      }}
                    />
                  ))}
                  <button type="button" onClick={() => setNewVehicles(p => [...p, emptyVehicle()])}
                    className="w-full border-2 border-dashed border-blue-300 text-blue-600 py-3 rounded-lg text-sm font-semibold hover:border-blue-400 hover:bg-blue-50 transition-colors">
                    + {t('add_vehicle')}
                  </button>
                </div>
              </div>

              {submitError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{submitError}</div>}
              <button type="submit" disabled={submitting} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
                {submitting ? t('submitting') : t('submit')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Vehicle Form Card (shared between new + add) ─────────────────────────

function VehicleFormCard({ vehicle, index, showRemove, fieldErrors, t, inputCls, labelCls, onChange, onRemove, onFileChange }: {
  vehicle: VehicleForm; index: number; showRemove: boolean
  fieldErrors: Record<string, string>; t: any; inputCls: string; labelCls: string
  onChange: (field: keyof VehicleForm, value: any) => void
  onRemove: () => void; onFileChange: (file: File | null) => void
}) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-4">
      {showRemove && (
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-600">Vehicle {index + 1}</span>
          <button type="button" onClick={onRemove} className="text-red-500 text-sm hover:text-red-700">Remove</button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>{t('year')} *</label>
          <input type="number" min={1990} max={2030} value={vehicle.year} onChange={e => onChange('year', e.target.value)} className={inputCls} />
          {fieldErrors[`year_${index}`] && <p className="text-red-500 text-xs mt-1">{fieldErrors[`year_${index}`]}</p>}
        </div>
        <div>
          <label className={labelCls}>{t('color')} *</label>
          <select value={vehicle.color} onChange={e => onChange('color', e.target.value)} className={inputCls}>
            <option value=""></option>
            {CAR_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {fieldErrors[`color_${index}`] && <p className="text-red-500 text-xs mt-1">{fieldErrors[`color_${index}`]}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>{t('make')} *</label>
          <select value={vehicle.make} onChange={e => onChange('make', e.target.value)} className={inputCls}>
            <option value=""></option>
            {CAR_MAKES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {fieldErrors[`make_${index}`] && <p className="text-red-500 text-xs mt-1">{fieldErrors[`make_${index}`]}</p>}
        </div>
        <div>
          <label className={labelCls}>{t('model')} *</label>
          <input type="text" value={vehicle.model} onChange={e => onChange('model', e.target.value)} className={inputCls} />
          {fieldErrors[`model_${index}`] && <p className="text-red-500 text-xs mt-1">{fieldErrors[`model_${index}`]}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>{t('license_plate')} *</label>
          <input type="text" value={vehicle.license_plate} onChange={e => onChange('license_plate', e.target.value.replace(/\s/g, '').toUpperCase())} className={inputCls} placeholder="ABC1234" />
          <p className="text-xs text-gray-400 mt-1">{t('plate_hint')}</p>
          {fieldErrors[`plate_${index}`] && <p className="text-red-500 text-xs mt-1">{fieldErrors[`plate_${index}`]}</p>}
        </div>
        <div>
          <label className={labelCls}>{t('plate_state')} *</label>
          <select value={vehicle.plate_state} onChange={e => onChange('plate_state', e.target.value)} className={inputCls}>
            <option value=""></option>
            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {fieldErrors[`state_${index}`] && <p className="text-red-500 text-xs mt-1">{fieldErrors[`state_${index}`]}</p>}
        </div>
      </div>
      <div className="space-y-2">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={vehicle.is_oversized} onChange={e => onChange('is_oversized', e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-700">{t('is_oversized_label')}</span>
        </label>
        {vehicle.is_oversized && (
          <div className="ml-7 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 text-sm text-amber-900 space-y-2">
            <p className="font-semibold">{t('oversized_notice_title')}</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>{t('oversized_notice_item1')}</li>
              <li>{t('oversized_notice_item2')}</li>
              <li>{t('oversized_notice_item3')}</li>
            </ul>
            <p className="text-xs text-amber-700 pt-1">{t('oversized_notice_footer')}</p>
          </div>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('section_docs')}</h3>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('upload_doc')} <span className="text-red-500">*</span></label>
        <input type="file" accept=".jpg,.jpeg,.png,.pdf"
          onChange={e => onFileChange(e.target.files?.[0] ?? null)}
          className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
        <p className="text-xs text-gray-400 mt-1">{t('upload_hint')}</p>
        {vehicle.registration_doc_filename && <p className="text-xs text-green-600 mt-1">Selected: {vehicle.registration_doc_filename}</p>}
        {fieldErrors[`doc_${index}`] && <p className="text-red-500 text-xs mt-1">{fieldErrors[`doc_${index}`]}</p>}
      </div>
    </div>
  )
}

// ─── Management View ──────────────────────────────────────────────────────

function ManageView({ t, unitId, confirmedEmail, unitData, units, toast, showToast, onReload, inputCls, labelCls, sectionCls }: {
  t: any; unitId: string; confirmedEmail: string; unitData: UnitData
  units: Unit[]; toast: string; showToast: (m: string) => void; onReload: () => void
  inputCls: string; labelCls: string; sectionCls: string
}) {
  const tAdmin = useTranslations('admin')
  const unitAddress = unitData.unit_address
  const vehicles = unitData.vehicles
  const firstVehicle = vehicles[0]

  // Owner edit state
  const [editingOwner, setEditingOwner] = useState(false)
  const [ownerFirstName, setOwnerFirstName] = useState('')
  const [ownerLastName, setOwnerLastName] = useState('')
  const [ownerPhone, setOwnerPhone] = useState(firstVehicle?.owner_phone ?? '')
  const [ownerEmail, setOwnerEmail] = useState(firstVehicle?.owner_email ?? '')
  const [ownerType, setOwnerType] = useState(firstVehicle?.registrant_type ?? 'owner')
  const [ownerSaving, setOwnerSaving] = useState(false)

  // Vehicle edit state (per vehicle id)
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null)
  const [vehicleEdits, setVehicleEdits] = useState<Record<string, any>>({})
  const [vehicleSaving, setVehicleSaving] = useState(false)

  // Doc upload state
  const [docUploading, setDocUploading] = useState<string | null>(null)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Add vehicle
  const [showAddVehicle, setShowAddVehicle] = useState(false)
  const [addVehicle, setAddVehicle] = useState<VehicleForm>(emptyVehicle())
  const [addVehicleErrors, setAddVehicleErrors] = useState<Record<string, string>>({})
  const [addingVehicle, setAddingVehicle] = useState(false)

  // Quota by selected month
  const MONTH_OPTIONS = generateMonthOptions()
  const [selectedMonth, setSelectedMonth] = useState(MONTH_OPTIONS[0].value)
  const [displayQuota, setDisplayQuota] = useState({ nights_used: unitData.quota.nights_used ?? 0, quota_limit: unitData.quota.quota_limit ?? VISITOR_QUOTA_LIMIT })
  const [quotaLoading, setQuotaLoading] = useState(false)

  useEffect(() => {
    setQuotaLoading(true)
    fetch(`/api/visitors/quota?unit_id=${unitId}&year_month=${selectedMonth}`)
      .then(r => r.json())
      .then(d => { if (d.nights_used !== undefined) setDisplayQuota({ nights_used: d.nights_used, quota_limit: d.quota_limit ?? VISITOR_QUOTA_LIMIT }) })
      .catch(() => {})
      .finally(() => setQuotaLoading(false))
  }, [unitId, selectedMonth])

  async function saveOwner() {
    setOwnerSaving(true)
    try {
      const fullName = `${ownerFirstName} ${ownerLastName}`.trim()
      const res = await fetch('/api/residents/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_owner', unit_id: unitId, email: confirmedEmail, owner_name: fullName, owner_phone: ownerPhone, new_email: ownerEmail, registrant_type: ownerType }),
      })
      if (res.ok) { setEditingOwner(false); showToast(t('owner_updated')); await onReload() }
    } finally { setOwnerSaving(false) }
  }

  function startEditVehicle(v: ResidentVehicle) {
    setEditingVehicleId(v.id)
    setVehicleEdits({ year: String(v.year), make: v.make, model: v.model, color: v.color, license_plate: v.license_plate, plate_state: v.plate_state, is_oversized: v.is_oversized })
  }

  async function saveVehicle(vehicleId: string) {
    setVehicleSaving(true)
    try {
      const res = await fetch('/api/residents/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_vehicle', unit_id: unitId, email: confirmedEmail, vehicle_id: vehicleId, ...vehicleEdits }),
      })
      if (res.ok) { setEditingVehicleId(null); showToast(t('vehicle_updated')); await onReload() }
    } finally { setVehicleSaving(false) }
  }

  async function handleDocUpload(vehicleId: string, file: File) {
    if (file.size > 5 * 1024 * 1024) { showToast('File exceeds 5MB limit.'); return }
    setDocUploading(vehicleId)
    try {
      const b64 = await fileToBase64(file)
      const res = await fetch('/api/residents/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_doc', unit_id: unitId, email: confirmedEmail, vehicle_id: vehicleId, registration_doc_base64: b64, registration_doc_filename: file.name }),
      })
      if (res.ok) { showToast(t('doc_renewed_success')); await onReload() }
    } finally { setDocUploading(null) }
  }

  async function handleDelete(vehicleId: string) {
    setDeleting(true)
    try {
      const res = await fetch('/api/residents/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_vehicle', unit_id: unitId, email: confirmedEmail, vehicle_id: vehicleId }),
      })
      if (res.ok) { setDeleteTarget(null); showToast(t('vehicle_deleted')); await onReload() }
    } finally { setDeleting(false) }
  }

  function validateAddVehicle(): boolean {
    const errors: Record<string, string> = {}
    if (!addVehicle.year) errors.year_0 = t('required')
    if (!addVehicle.make) errors.make_0 = t('required')
    if (!addVehicle.model.trim()) errors.model_0 = t('required')
    if (!addVehicle.color) errors.color_0 = t('required')
    if (!addVehicle.license_plate.trim()) errors.plate_0 = t('required')
    if (!addVehicle.plate_state) errors.state_0 = t('required')
    if (!addVehicle.registration_doc_base64) errors.doc_0 = t('required')
    setAddVehicleErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleAddVehicle() {
    if (!validateAddVehicle()) return
    setAddingVehicle(true)
    try {
      const res = await fetch('/api/residents/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_vehicle', unit_id: unitId, email: confirmedEmail,
          year: Number(addVehicle.year), make: addVehicle.make, model: addVehicle.model, color: addVehicle.color,
          license_plate: addVehicle.license_plate.replace(/\s/g, '').toUpperCase(), plate_state: addVehicle.plate_state,
          is_oversized: addVehicle.is_oversized, registration_doc_base64: addVehicle.registration_doc_base64,
          registration_doc_filename: addVehicle.registration_doc_filename,
        }),
      })
      const json = await res.json()
      if (res.ok) { setShowAddVehicle(false); setAddVehicle(emptyVehicle()); showToast(t('vehicle_added')); await onReload() }
      else showToast(json.error === 'plate_conflict' ? t('error_plate_conflict') : (json.error ?? 'Error'))
    } finally { setAddingVehicle(false) }
  }

  const quotaLimit = displayQuota.quota_limit ?? VISITOR_QUOTA_LIMIT
  const nightsUsed = displayQuota.nights_used ?? 0
  const nightsRemaining = Math.max(0, quotaLimit - nightsUsed)
  const usedPct = Math.min(100, (nightsUsed / quotaLimit) * 100)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg z-50 text-sm font-medium transition-all">
          {toast}
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-blue-600 hover:underline mb-6 inline-block">← Back</Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{t('title_manage')}</h1>
          <p className="text-gray-500 text-sm mt-0.5">{t('subtitle_manage')}</p>
          <p className="text-gray-400 text-xs mt-1">{unitAddress}</p>
        </div>

        {/* ── Contact Info ──────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className={sectionCls.replace('mb-4', 'mb-0')}>{t('section_owner')}</h2>
            {!editingOwner && (
              <button onClick={() => {
                const parts = (firstVehicle?.owner_name ?? '').split(' ')
                setOwnerFirstName(parts[0] ?? '')
                setOwnerLastName(parts.slice(1).join(' '))
                setOwnerPhone(firstVehicle?.owner_phone ?? '')
                setOwnerEmail(firstVehicle?.owner_email ?? '')
                setOwnerType(firstVehicle?.registrant_type ?? 'owner')
                setEditingOwner(true)
              }}
                className="text-sm text-blue-600 hover:underline">{t('edit')}</button>
            )}
          </div>
          {!editingOwner ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">{t('owner_name')}:</span> <span className="font-medium">{firstVehicle?.owner_name}</span></div>
              <div><span className="text-gray-500">{t('registrant_type')}:</span> <span className="font-medium">{firstVehicle?.registrant_type}</span></div>
              <div><span className="text-gray-500">{t('phone')}:</span> <span className="font-medium">{firstVehicle?.owner_phone}</span></div>
              <div><span className="text-gray-500">{t('email')}:</span> <span className="font-medium">{firstVehicle?.owner_email}</span></div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{t('first_name')}</label>
                  <input type="text" value={ownerFirstName} onChange={e => setOwnerFirstName(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{t('last_name')}</label>
                  <input type="text" value={ownerLastName} onChange={e => setOwnerLastName(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>{t('registrant_type')}</label>
                <select value={ownerType} onChange={e => setOwnerType(e.target.value)} className={inputCls}>
                  <option value="owner">{t('registrant_type_owner')}</option>
                  <option value="tenant">{t('registrant_type_tenant')}</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{t('phone')}</label>
                <PhoneInput value={ownerPhone} onChange={setOwnerPhone} />
              </div>
              <div>
                <label className={labelCls}>{t('email')}</label>
                <input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} className={inputCls} />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={saveOwner} disabled={ownerSaving}
                  className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">{ownerSaving ? '...' : t('save')}</button>
                <button onClick={() => setEditingOwner(false)} className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50">{t('cancel_edit')}</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Registered Vehicles ───────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-5">
          <h2 className={sectionCls}>{t('section_vehicles')}</h2>
          <div className="space-y-5">
            {vehicles.map((v) => (
              <div key={v.id} className="border border-gray-200 rounded-xl p-4">
                {editingVehicleId === v.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>{t('year')}</label>
                        <input type="number" value={vehicleEdits.year ?? ''} onChange={e => setVehicleEdits(p => ({ ...p, year: e.target.value }))} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{t('color')}</label>
                        <select value={vehicleEdits.color ?? ''} onChange={e => setVehicleEdits(p => ({ ...p, color: e.target.value }))} className={inputCls}>
                          {CAR_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>{t('make')}</label>
                        <select value={vehicleEdits.make ?? ''} onChange={e => setVehicleEdits(p => ({ ...p, make: e.target.value }))} className={inputCls}>
                          {CAR_MAKES.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>{t('model')}</label>
                        <input type="text" value={vehicleEdits.model ?? ''} onChange={e => setVehicleEdits(p => ({ ...p, model: e.target.value }))} className={inputCls} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>{t('license_plate')}</label>
                        <input type="text" value={vehicleEdits.license_plate ?? ''} onChange={e => setVehicleEdits(p => ({ ...p, license_plate: e.target.value.toUpperCase().replace(/\s/g, '') }))} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{t('plate_state')}</label>
                        <select value={vehicleEdits.plate_state ?? ''} onChange={e => setVehicleEdits(p => ({ ...p, plate_state: e.target.value }))} className={inputCls}>
                          {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" checked={vehicleEdits.is_oversized ?? false} onChange={e => setVehicleEdits(p => ({ ...p, is_oversized: e.target.checked }))}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-700">{t('is_oversized_label')}</span>
                      </label>
                      {vehicleEdits.is_oversized && (
                        <div className="ml-7 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 text-sm text-amber-900 space-y-2">
                          <p className="font-semibold">{t('oversized_notice_title')}</p>
                          <ul className="list-disc list-inside space-y-1 text-sm">
                            <li>{t('oversized_notice_item1')}</li>
                            <li>{t('oversized_notice_item2')}</li>
                            <li>{t('oversized_notice_item3')}</li>
                          </ul>
                          <p className="text-xs text-amber-700 pt-1">{t('oversized_notice_footer')}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => saveVehicle(v.id)} disabled={vehicleSaving}
                        className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">{vehicleSaving ? '...' : t('save')}</button>
                      <button onClick={() => setEditingVehicleId(null)} className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50">{t('cancel_edit')}</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-semibold text-gray-900">{v.year} {v.color} {v.make} {v.model}</div>
                        <div className="text-sm font-mono text-gray-600">{v.license_plate} · {v.plate_state}</div>
                        {v.is_oversized && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full mt-1 inline-block">Oversized</span>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => startEditVehicle(v)} className="text-xs border border-gray-300 text-gray-600 px-3 py-1 rounded-lg hover:bg-gray-50">{t('edit')}</button>
                        <button onClick={() => setDeleteTarget(v.id)} className="text-xs border border-red-200 text-red-600 px-3 py-1 rounded-lg hover:bg-red-50">{t('delete_vehicle')}</button>
                      </div>
                    </div>
                    {/* Doc section */}
                    <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
                      <div className="flex items-center justify-between mb-2">
                        <span>{t('doc_last_renewed')} <strong>{new Date(v.created_at).toLocaleDateString()}</strong></span>
                        {v.registration_doc_url && (
                          <a href={v.registration_doc_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">View doc</a>
                        )}
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer text-blue-700 hover:text-blue-900">
                        <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
                          onChange={async e => { const file = e.target.files?.[0]; if (file) await handleDocUpload(v.id, file) }} />
                        {docUploading === v.id ? '...' : `↑ ${t('renew_doc')}`}
                      </label>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Add vehicle */}
            {!showAddVehicle ? (
              <button onClick={() => setShowAddVehicle(true)}
                className="w-full border-2 border-dashed border-blue-300 text-blue-600 py-3 rounded-xl text-sm font-semibold hover:border-blue-400 hover:bg-blue-50 transition-colors">
                {t('add_vehicle_btn')}
              </button>
            ) : (
              <div className="border border-blue-200 rounded-xl p-5 bg-blue-50/30">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">{t('new_vehicle_section')}</h3>
                <VehicleFormCard
                  vehicle={addVehicle} index={0} showRemove={false}
                  fieldErrors={addVehicleErrors} t={t} inputCls={inputCls} labelCls={labelCls}
                  onChange={(field, val) => setAddVehicle(p => ({ ...p, [field]: val }))}
                  onRemove={() => {}}
                  onFileChange={async (file) => {
                    if (!file) return
                    if (file.size > 5 * 1024 * 1024) { setAddVehicleErrors(p => ({ ...p, doc_0: 'File exceeds 5MB' })); return }
                    setAddVehicleErrors(p => { const n = { ...p }; delete n.doc_0; return n })
                    const b64 = await fileToBase64(file)
                    setAddVehicle(p => ({ ...p, registration_doc_base64: b64, registration_doc_filename: file.name }))
                  }}
                />
                <div className="flex gap-3 mt-4">
                  <button onClick={handleAddVehicle} disabled={addingVehicle}
                    className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">{addingVehicle ? '...' : t('add_vehicle')}</button>
                  <button onClick={() => { setShowAddVehicle(false); setAddVehicle(emptyVehicle()) }}
                    className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50">{t('cancel_edit')}</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Visitor Quota ──────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-5">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">{t('section_quota')}</h2>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
            >
              {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm font-medium">
              <span className="text-red-600">{nightsUsed} {t('nights_used')}</span>
              <span className="text-green-600">{nightsRemaining} {t('nights_remaining')}</span>
            </div>
            <div className="h-5 rounded-full overflow-hidden flex">
              {nightsUsed > 0 && <div className="h-full bg-red-400 transition-all" style={{ width: `${usedPct}%` }} />}
              <div className="h-full bg-green-400 flex-1" />
            </div>
            <p className="text-xs text-gray-400 text-center">
              {quotaLoading ? '…' : `${nightsUsed} / ${quotaLimit} nights used (${selectedMonth})`}
            </p>
          </div>
        </div>

        {/* ── Violation History ──────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-5">
          <h2 className={sectionCls}>{t('section_violations')}</h2>
          {unitData.violations.length === 0 ? (
            <p className="text-sm text-gray-500">{t('no_violations_history')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="text-left py-2 pr-4">{t('vio_date')}</th>
                    <th className="text-left py-2 pr-4">{t('vio_type')}</th>
                    <th className="text-left py-2 pr-4">{t('vio_status')}</th>
                    <th className="text-left py-2">{t('vio_resolution')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {unitData.violations.map(vio => (
                    <tr key={vio.id}>
                      <td className="py-2 pr-4 text-gray-500 whitespace-nowrap text-xs">
                        {new Date(vio.submitted_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4">
                        <span className="inline-block bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full">
                          {vio.final_violation_type ?? vio.violation_type}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[vio.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {vio.status}
                        </span>
                      </td>
                      <td className="py-2 text-gray-500 text-xs">
                        {vio.resolution_type ? (() => { const r = tAdmin(`vio_res_${vio.resolution_type}` as any); return String(r).includes('.vio_res_') ? vio.resolution_type.replace(/_/g, ' ') : String(r) })() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Consent notice ─────────────────────────────── */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 mb-5">
          <p className="text-xs text-gray-500 leading-relaxed">{t('contact_consent')}</p>
        </div>
      </div>

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('delete_vehicle')}</h2>
            <p className="text-sm text-gray-600 mb-6">{t('confirm_delete_vehicle')}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50">{t('cancel_edit')}</button>
              <button onClick={() => handleDelete(deleteTarget)} disabled={deleting}
                className="text-sm bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50">{deleting ? '...' : t('delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
