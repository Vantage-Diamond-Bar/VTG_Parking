'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { VIOLATION_LOCATIONS, VIOLATION_TYPES } from '@/lib/utils'

const MAX_PHOTOS = 5
const MAX_PHOTO_SIZE = 5 * 1024 * 1024 // 5MB

interface PhotoPreview {
  file: File
  url: string
}

export default function ReportPage() {
  const t = useTranslations('report')

  const [location, setLocation] = useState('')
  const [violationType, setViolationType] = useState('')
  const [photos, setPhotos] = useState<PhotoPreview[]>([])
  const [licensePlate, setLicensePlate] = useState('')
  const [description, setDescription] = useState('')
  const [reporterEmail, setReporterEmail] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [photoError, setPhotoError] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPhotoError('')
    const files = Array.from(e.target.files ?? [])
    const remaining = MAX_PHOTOS - photos.length

    if (files.length > remaining) {
      setPhotoError(t('max_photos_error', { max: MAX_PHOTOS }))
    }

    const toAdd = files.slice(0, remaining)
    const oversized = toAdd.filter((f) => f.size > MAX_PHOTO_SIZE)
    if (oversized.length > 0) {
      setPhotoError(t('photo_size_error'))
      return
    }

    const newPreviews: PhotoPreview[] = toAdd.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }))
    setPhotos((prev) => [...prev, ...newPreviews])

    // Reset input so same file can be re-added after removal
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      const next = [...prev]
      URL.revokeObjectURL(next[index].url)
      next.splice(index, 1)
      return next
    })
    setPhotoError('')
  }

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!location) errors.location = t('required')
    if (!violationType) errors.violation_type = t('required')
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!validate()) return
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('location', location)
      formData.append('violation_type', violationType)
      if (licensePlate.trim()) formData.append('license_plate', licensePlate.toUpperCase())
      if (description.trim()) formData.append('description', description)
      if (reporterEmail.trim()) formData.append('reporter_email', reporterEmail)
      photos.forEach((p) => formData.append('photos', p.file))

      const res = await fetch('/api/violations', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? data?.message ?? 'Submission failed. Please try again.')
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
    photos.forEach((p) => URL.revokeObjectURL(p.url))
    setLocation('')
    setViolationType('')
    setPhotos([])
    setLicensePlate('')
    setDescription('')
    setReporterEmail('')
    setError('')
    setFieldErrors({})
    setPhotoError('')
    setSuccess(false)
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
              {t('report_another')}
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
            {/* Violation Details */}
            <div>
              <h2 className={sectionCls}>{t('section_violation')}</h2>
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>{t('location')} *</label>
                  <select
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">{t('select_location')}</option>
                    {VIOLATION_LOCATIONS.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.location && (
                    <p className="text-red-500 text-xs mt-1">{fieldErrors.location}</p>
                  )}
                </div>

                <div>
                  <label className={labelCls}>{t('violation_type')} *</label>
                  <select
                    value={violationType}
                    onChange={(e) => setViolationType(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">{t('select_violation_type')}</option>
                    {VIOLATION_TYPES.map((vt) => (
                      <option key={vt} value={vt}>
                        {vt}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.violation_type && (
                    <p className="text-red-500 text-xs mt-1">{fieldErrors.violation_type}</p>
                  )}
                </div>

                <div>
                  <label className={labelCls}>{t('license_plate')}</label>
                  <input
                    type="text"
                    value={licensePlate}
                    onChange={(e) => setLicensePlate(e.target.value.toUpperCase())}
                    className={inputCls}
                    placeholder={t('plate_optional')}
                  />
                </div>

                <div>
                  <label className={labelCls}>{t('description')}</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className={inputCls}
                    placeholder={t('description_placeholder')}
                  />
                </div>
              </div>
            </div>

            {/* Photo Upload */}
            <div>
              <h2 className={sectionCls}>{t('section_photos')}</h2>

              {photos.length < MAX_PHOTOS && (
                <div className="mb-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoChange}
                    className="hidden"
                    id="photo-upload"
                  />
                  <label
                    htmlFor="photo-upload"
                    className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-sm text-gray-500">{t('upload_photos')}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {t('photos_hint', { remaining: MAX_PHOTOS - photos.length, max: MAX_PHOTOS })}
                    </p>
                  </label>
                </div>
              )}

              {photoError && (
                <p className="text-red-500 text-xs mb-3">{photoError}</p>
              )}

              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {photos.map((photo, index) => (
                    <div key={index} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                        aria-label="Remove photo"
                      >
                        ×
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-40 text-white text-xs px-1 py-0.5 truncate">
                        {photo.file.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-gray-400 mt-2">{t('photos_count', { count: photos.length, max: MAX_PHOTOS })}</p>
            </div>

            {/* Reporter Info */}
            <div>
              <h2 className={sectionCls}>{t('section_reporter')}</h2>
              <div>
                <label className={labelCls}>{t('reporter_email')}</label>
                <input
                  type="email"
                  value={reporterEmail}
                  onChange={(e) => setReporterEmail(e.target.value)}
                  className={inputCls}
                  placeholder={t('email_optional')}
                />
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
