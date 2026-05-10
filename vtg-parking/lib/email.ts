import { Resend } from 'resend'
import { supabaseAdmin } from './supabase'

const resend = new Resend(process.env.RESEND_API_KEY)

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
    .map((url, i) => `<a href="${url}" target="_blank">Photo ${i + 1}</a>`)
    .join(' | ')

  const html = `
    <h2>🚨 Parking Violation Report</h2>
    <table style="border-collapse:collapse;width:100%;font-family:sans-serif;">
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Location</td><td style="padding:8px;">${report.location}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Violation Type</td><td style="padding:8px;">${report.violation_type}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">License Plate</td><td style="padding:8px;">${report.license_plate || 'N/A'}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Description</td><td style="padding:8px;">${report.description || 'N/A'}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Photos</td><td style="padding:8px;">${photoLinks || 'None'}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Reporter Email</td><td style="padding:8px;">${report.reporter_email || 'Anonymous'}</td></tr>
      <tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Submitted At</td><td style="padding:8px;">${new Date(report.submitted_at).toLocaleString()}</td></tr>
    </table>
    <p style="color:#666;font-size:12px;margin-top:16px;">This report was submitted via the VTG Community Parking Management System.</p>
  `

  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'parking@vtgcommunity.com',
    to: recipients,
    subject: `[Parking Violation] ${report.violation_type} — ${report.location}`,
    html,
  })
}
