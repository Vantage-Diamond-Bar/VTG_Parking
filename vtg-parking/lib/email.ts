import { Resend } from 'resend'
import { supabaseAdmin } from './supabase'

const resend = new Resend(process.env.RESEND_API_KEY)
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'parking@vtgcommunity.com'

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
      <div style="background:#1e40af;color:white;padding:24px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:18px;">VTG Community Parking</h1>
        <p style="margin:6px 0 0;opacity:0.9;font-size:14px;">Email Verification Code</p>
      </div>
      <div style="background:white;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 20px;color:#374151;">Use the code below to verify your identity. It expires in <strong>10 minutes</strong> and can only be used once.</p>
        <div style="background:#eff6ff;border:2px solid #3b82f6;border-radius:8px;padding:24px;text-align:center;margin:0 0 20px;">
          <p style="margin:0 0 6px;font-size:12px;color:#1e40af;font-weight:bold;text-transform:uppercase;letter-spacing:0.08em;">Verification Code</p>
          <p style="margin:0;font-size:40px;font-family:monospace;font-weight:bold;color:#1e3a8a;letter-spacing:0.3em;">${otp}</p>
        </div>
        <p style="margin:0;font-size:12px;color:#9ca3af;">If you did not request this code, please ignore this email.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
        <p style="font-size:11px;color:#9ca3af;margin:0;">VTG Community Parking Management System</p>
      </div>
    </div>
  `
  await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: 'VTG Community Parking — Verification Code',
    html,
  })
}

export async function sendViolationReport(report: {
  location: string
  violation_type: string
  license_plate?: string
  description?: string
  photo_urls: string[]
  reporter_email?: string
  submitted_at: string
}) {
  const { data: emailRows } = await supabaseAdmin
    .from('notification_emails')
    .select('email')
    .eq('active', true)

  if (!emailRows || emailRows.length === 0) return

  const recipients = emailRows.map((r) => r.email)

  const photoLinks = report.photo_urls
    .map((url, i) => `<img src="${url}" alt="Photo ${i + 1}" style="max-width:100%;height:auto;display:block;margin:8px 0;border-radius:4px;border:1px solid #e5e7eb;" />`)
    .join('')

  const html = `
    <h2>🚨 Parking Violation Report</h2>
    <table style="border-collapse:collapse;width:100%;font-family:sans-serif;">
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Location</td><td style="padding:8px;">${report.location}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Violation Type</td><td style="padding:8px;">${report.violation_type}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">License Plate</td><td style="padding:8px;">${report.license_plate || 'N/A'}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Description</td><td style="padding:8px;">${report.description || 'N/A'}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Photos</td><td style="padding:8px;">${photoLinks || 'None'}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Reporter Email</td><td style="padding:8px;">${report.reporter_email || 'Anonymous'}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Submitted At</td><td style="padding:8px;">${new Date(report.submitted_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PT</td></tr>
    </table>
    <p style="color:#666;font-size:12px;margin-top:16px;">This report was submitted via the VTG Community Parking Management System.</p>
  `

  const subject = `[Parking Violation] ${report.violation_type} — ${report.location}`

  // Send individually so one rejected address doesn't block others
  await Promise.allSettled(
    recipients.map((to) =>
      resend.emails.send({ from: EMAIL_FROM, to, subject, html })
    )
  )
}

export async function sendViolationHearing({
  violation_id,
  location,
  violation_type,
  license_plate,
  unit_address,
  submitted_at,
  admin_notes,
}: {
  violation_id: string
  location: string
  violation_type: string
  license_plate?: string | null
  unit_address?: string | null
  submitted_at: string
  admin_notes?: string | null
}) {
  const { data: emailRows } = await supabaseAdmin
    .from('notification_emails')
    .select('email')
    .eq('active', true)

  if (!emailRows || emailRows.length === 0) return

  const recipients = emailRows.map((r) => r.email)

  const html = `
    <h2>📋 Parking Violation Hearing Request</h2>
    <table style="border-collapse:collapse;width:100%;font-family:sans-serif;">
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Violation ID</td><td style="padding:8px;">${violation_id}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Unit</td><td style="padding:8px;">${unit_address || 'Unknown'}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Location</td><td style="padding:8px;">${location}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Violation Type</td><td style="padding:8px;">${violation_type}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">License Plate</td><td style="padding:8px;">${license_plate || 'N/A'}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Originally Submitted</td><td style="padding:8px;">${new Date(submitted_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PT</td></tr>
      ${admin_notes ? `<tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Admin Notes</td><td style="padding:8px;">${admin_notes}</td></tr>` : ''}
    </table>
    <p style="color:#666;font-size:12px;margin-top:16px;">A hearing has been requested for this violation via the VTG Community Parking Management System.</p>
  `

  const subject = `[Hearing Arrangement Request] ${violation_type} — ${location}${unit_address ? ` (${unit_address})` : ''}`

  await Promise.allSettled(
    recipients.map((to) =>
      resend.emails.send({
        from: EMAIL_FROM,
        to,
        subject,
        html,
      })
    )
  )
}

export async function sendVacationDecision({
  applicantEmail,
  firstName,
  lastName,
  unitAddress,
  vehicle,
  startDatetime,
  endDatetime,
  status,
  access_code,
  rejection_reason,
  admin_notes,
}: {
  applicantEmail: string
  firstName: string
  lastName: string
  unitAddress: string
  vehicle: { year: number; make: string; model: string; color: string; license_plate: string }
  startDatetime: string
  endDatetime: string
  status: 'approved' | 'rejected'
  access_code?: string
  rejection_reason?: string
  admin_notes?: string
}) {
  if (!applicantEmail) return

  const isApproved = status === 'approved'
  const headerColor = isApproved ? '#15803d' : '#b91c1c'
  const statusText = isApproved ? 'APPROVED ✓' : 'REJECTED ✗'
  const start = new Date(startDatetime).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' })
  const end = new Date(endDatetime).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' })

  const accessCodeSection = isApproved && access_code ? `
    <div style="background:#eff6ff;border:2px solid #3b82f6;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">
      <p style="margin:0 0 8px;font-size:13px;color:#1e40af;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;">Your Parking Access Code</p>
      <p style="margin:0;font-size:36px;font-family:monospace;font-weight:bold;color:#1e3a8a;letter-spacing:0.2em;">${access_code}</p>
      <p style="margin:12px 0 0;font-size:12px;color:#3b82f6;">Place this code on your vehicle dashboard during the approved parking period.</p>
    </div>
  ` : ''

  const rejectionSection = !isApproved && rejection_reason ? `
    <div style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:4px;padding:12px 16px;margin:16px 0;">
      <p style="margin:0;font-size:13px;font-weight:bold;color:#991b1b;">Reason for Rejection:</p>
      <p style="margin:4px 0 0;color:#7f1d1d;">${rejection_reason}</p>
    </div>
  ` : ''

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:${headerColor};color:white;padding:24px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:18px;">VTG Community Parking</h1>
        <p style="margin:6px 0 0;opacity:0.9;font-size:14px;">Vacation Extended Parking — ${statusText}</p>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <p>Dear <strong>${firstName} ${lastName}</strong>,</p>
        <p>Your Vacation Extended Parking request for <strong>${unitAddress}</strong> has been <strong>${isApproved ? 'approved' : 'rejected'}</strong>.</p>
        ${accessCodeSection}
        <table style="border-collapse:collapse;width:100%;margin:16px 0;">
          <tr><td style="padding:8px;background:#f9fafb;font-weight:bold;font-size:13px;">Vehicle</td><td style="padding:8px;">${vehicle.year} ${vehicle.color} ${vehicle.make} ${vehicle.model} — <span style="font-family:monospace;font-weight:bold;">${vehicle.license_plate}</span></td></tr>
          <tr><td style="padding:8px;background:#f9fafb;font-weight:bold;font-size:13px;">Parking Period</td><td style="padding:8px;">${start} → ${end}</td></tr>
          ${admin_notes ? `<tr><td style="padding:8px;background:#f9fafb;font-weight:bold;font-size:13px;">Admin Notes</td><td style="padding:8px;">${admin_notes}</td></tr>` : ''}
        </table>
        ${rejectionSection}
        ${isApproved
          ? '<p style="color:#15803d;">Your vehicle is authorized to remain parked in the same location for the approved period without risk of citation.</p>'
          : '<p style="color:#b91c1c;">Your request was not approved. Please contact the VTG management office if you have questions.</p>'
        }
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
        <p style="font-size:11px;color:#9ca3af;margin:0;">VTG Community Parking Management System</p>
      </div>
    </div>
  `

  await resend.emails.send({
    from: EMAIL_FROM,
    to: applicantEmail,
    subject: `[Vacation Parking] ${statusText} — ${firstName} ${lastName} (${unitAddress})`,
    html,
  })
}

export async function sendOversizedDecision({
  applicantEmail,
  ownerName,
  unitAddress,
  vehicle,
  status,
  admin_notes,
}: {
  applicantEmail: string
  ownerName: string
  unitAddress: string
  vehicle: { year?: number | null; make: string; model: string; color: string; license_plate: string; plate_state?: string | null }
  status: 'approved' | 'rejected'
  admin_notes?: string | null
}) {
  if (!applicantEmail) return

  const isApproved = status === 'approved'
  const headerColor = isApproved ? '#15803d' : '#b91c1c'
  const statusText = isApproved ? 'APPROVED ✓' : 'REJECTED ✗'
  const plateDisplay = vehicle.plate_state ? `${vehicle.license_plate} / ${vehicle.plate_state}` : vehicle.license_plate

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:${headerColor};color:white;padding:24px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:18px;">VTG Community Parking</h1>
        <p style="margin:6px 0 0;opacity:0.9;font-size:14px;">Oversized Vehicle Application — ${statusText}</p>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <p>Dear <strong>${ownerName}</strong>,</p>
        <p>Your Oversized Vehicle Permit application for <strong>${unitAddress}</strong> has been <strong>${isApproved ? 'approved' : 'rejected'}</strong>.</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0;">
          <tr><td style="padding:8px;background:#f9fafb;font-weight:bold;font-size:13px;">Vehicle</td><td style="padding:8px;">${vehicle.year ? vehicle.year + ' ' : ''}${vehicle.color} ${vehicle.make} ${vehicle.model} — <span style="font-family:monospace;font-weight:bold;">${plateDisplay}</span></td></tr>
          ${admin_notes ? `<tr><td style="padding:8px;background:#f9fafb;font-weight:bold;font-size:13px;">Admin Notes</td><td style="padding:8px;">${admin_notes}</td></tr>` : ''}
        </table>
        ${isApproved
          ? '<p style="color:#15803d;">Your vehicle has been added to the community parking registry as an oversized vehicle. You may park in a designated outdoor community space. Please ensure you comply with all community parking rules.</p>'
          : '<p style="color:#b91c1c;">Your oversized vehicle permit application was not approved. However, your vehicle has been retained in the community parking registry as a <strong>standard (non-oversized) vehicle</strong>. Patrol officers will be able to locate your vehicle registration as normal. If you have questions about this decision, please contact the VTG management office.</p>'
        }
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
        <p style="font-size:11px;color:#9ca3af;margin:0;">VTG Community Parking Management System</p>
      </div>
    </div>
  `

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: applicantEmail,
      subject: `[Oversized Vehicle] ${statusText} — ${ownerName} (${unitAddress})`,
      html,
    })
  } catch {}
}

export async function sendVisitorBookingEmail({
  hostEmail,
  hostName,
  unitAddress,
  accessCode,
  visitorName,
  licensePlate,
  make,
  model,
  color,
  startDatetime,
  endDatetime,
}: {
  hostEmail: string
  hostName: string
  unitAddress: string
  accessCode: string
  visitorName?: string | null
  licensePlate: string
  make?: string | null
  model?: string | null
  color?: string | null
  startDatetime: string
  endDatetime: string
}) {
  if (!hostEmail) return

  const start = new Date(startDatetime).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' })
  const end = new Date(endDatetime).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' })
  const vehicleDesc = [color, make, model].filter(Boolean).join(' ') || 'Unknown vehicle'

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#059669;color:white;padding:24px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:18px;">Vantage Community Parking</h1>
        <p style="margin:6px 0 0;opacity:0.9;font-size:14px;">Visitor Parking Registration Confirmation</p>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <p>Dear <strong>${hostName}</strong>,</p>
        <p>A visitor parking registration has been submitted for your unit at <strong>${unitAddress}</strong>.</p>

        <div style="background:#eff6ff;border:2px solid #3b82f6;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">
          <p style="margin:0 0 8px;font-size:13px;color:#1e40af;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;">Parking Access Code</p>
          <p style="margin:0;font-size:40px;font-family:monospace;font-weight:bold;color:#1e3a8a;letter-spacing:0.25em;">${accessCode}</p>
          <p style="margin:12px 0 0;font-size:12px;color:#3b82f6;">Place this code visibly on the guest vehicle's dashboard.</p>
        </div>

        <table style="border-collapse:collapse;width:100%;margin:16px 0;">
          ${visitorName ? `<tr><td style="padding:8px;background:#f9fafb;font-weight:bold;font-size:13px;width:140px;">Guest Name</td><td style="padding:8px;">${visitorName}</td></tr>` : ''}
          <tr><td style="padding:8px;background:#f9fafb;font-weight:bold;font-size:13px;">Vehicle</td><td style="padding:8px;">${vehicleDesc} — <span style="font-family:monospace;font-weight:bold;">${licensePlate}</span></td></tr>
          <tr><td style="padding:8px;background:#f9fafb;font-weight:bold;font-size:13px;">Check-in</td><td style="padding:8px;">${start}</td></tr>
          <tr><td style="padding:8px;background:#f9fafb;font-weight:bold;font-size:13px;">Check-out</td><td style="padding:8px;">${end}</td></tr>
        </table>

        <p style="font-size:13px;color:#6b7280;">If you did not submit this registration, please contact the management office.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
        <p style="font-size:11px;color:#9ca3af;margin:0;">Vantage Community Parking Management System</p>
      </div>
    </div>
  `

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: hostEmail,
      subject: `[Visitor Parking] Access Code ${accessCode} — ${unitAddress}`,
      html,
    })
  } catch {}
}

export async function sendRegistrationReminder({
  ownerName,
  ownerEmail,
  address,
  vehicles,
  registeredAt,
}: {
  ownerName: string
  ownerEmail: string
  address: string
  vehicles: { make: string; model: string; color: string; license_plate: string }[]
  registeredAt: Date
}): Promise<boolean> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const vehicleList = vehicles
    .map(
      (v, i) =>
        `<li style="padding:4px 0;">${i + 1}. ${v.color} ${v.make} ${v.model} — <strong style="font-family:monospace;">${v.license_plate}</strong></li>`
    )
    .join('')

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1e40af;color:white;padding:28px 24px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:20px;">VTG Community Parking</h1>
        <p style="margin:6px 0 0;opacity:0.85;font-size:14px;">Annual Vehicle Registration Renewal Reminder</p>
      </div>
      <div style="background:white;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <p>Dear <strong>${ownerName}</strong>,</p>
        <p>Your vehicle registration at <strong>${address}</strong> was submitted on
        <strong>${registeredAt.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'long', day: 'numeric' })}</strong>.
        It has now been over one year since your last registration update.</p>
        <p>As required by VTG community parking policy, all residents must renew their vehicle registration information annually to keep records current.</p>
        <p><strong>Vehicles currently on file for your unit:</strong></p>
        <ul style="padding-left:20px;line-height:1.8;">${vehicleList}</ul>
        <p>Please visit the VTG Parking portal to submit your updated registration:</p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${appUrl}/register"
             style="background:#2563eb;color:white;padding:13px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">
            Update My Registration
          </a>
        </div>
        <p style="font-size:13px;color:#6b7280;">
          If your vehicle information has not changed, please re-submit the form to reset your annual renewal date.
          If you have questions, contact the VTG management office.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
        <p style="font-size:11px;color:#9ca3af;margin:0;">
          This is an automated annual reminder from the VTG Community Parking Management System.
        </p>
      </div>
    </div>
  `

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: ownerEmail,
      subject: 'VTG Community Parking — Annual Registration Renewal Reminder',
      html,
    })
    return true
  } catch {
    return false
  }
}
