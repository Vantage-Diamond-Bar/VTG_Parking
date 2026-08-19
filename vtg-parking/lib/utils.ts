import { format } from 'date-fns'

export function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // removed ambiguous chars: 0,O,1,I
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export function getYearMonth(date: Date = new Date()): string {
  return format(date, 'yyyy-MM')
}

export function normalizedPlate(plate: string): string {
  return plate.toUpperCase().replace(/\s+/g, '')
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  'DC',
]

export const CAR_COLORS = [
  'Black','White','Silver','Gray','Red','Blue','Green',
  'Yellow','Orange','Brown','Gold','Beige','Purple','Other',
]

export const CAR_MAKES = [
  'Acura','Alfa Romeo','Aston Martin','Audi','Bentley','BMW','Buick',
  'Cadillac','Chevrolet','Chrysler','Dodge','Ferrari','Fiat','Ford',
  'Genesis','GMC','Honda','Hyundai','Infiniti','Jaguar','Jeep','Kia',
  'Lamborghini','Land Rover','Lexus','Lincoln','Maserati','Mazda',
  'Mercedes-Benz','MINI','Mitsubishi','Nissan','Porsche','Ram',
  'Rivian','Rolls-Royce','Subaru','Tesla','Toyota','Volkswagen','Volvo',
  'Other',
]

export const VIOLATION_LOCATIONS = [
  'Terrace Ln E',
  'Terrace Ln W',
  'Sunset Pl',
  'Main Gate / Fountain Roundabout / Clubhouse / Vantage Dr',
  'Other',
] as const

export const VIOLATION_TYPES = [
  'Parking in Yellow-Curb Trash Bin Area on Sundays',
  'Vehicle Parked for Over 72 Hours Without Movement',
  'Opposite Direction of Traffic',
  'Parking Outside Designated Spaces',
  'Parking in Red-Curb Zone',
  'Unauthorized Commercial Vehicle',
  'Parking in Handicap Space Without Permit',
  'Safety Concern (Suspicious Person/Vehicle)',
  'Other',
] as const

export const VEHICLE_TYPES = [
  'Sedan', 'SUV', 'Truck', 'Minivan', 'Station Wagon', 'Full Size Van', 'Motorcycle', 'Boat', 'Other',
] as const

export const VISITOR_QUOTA_LIMIT = 10

// Max vehicles a single unit may self-register. A 5th requires HOA approval,
// after which the management company adds it directly (bypassing this limit).
export const RESIDENT_VEHICLE_LIMIT = 4

// ─── Pacific Time helpers ────────────────────────────────────────────────────
// All date/time display and calculations use America/Los_Angeles (PDT/PST).
export const PT_ZONE = 'America/Los_Angeles'

/**
 * Get the calendar date (YYYY-MM-DD) of a Date object in Pacific Time.
 * Works on both server (UTC) and browser (any locale).
 */
function ptDateParts(d: Date): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PT_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  return {
    y:   parseInt(parts.find(p => p.type === 'year')!.value),
    m:   parseInt(parts.find(p => p.type === 'month')!.value),
    day: parseInt(parts.find(p => p.type === 'day')!.value),
  }
}

/**
 * Format a datetime string in Pacific Time for display.
 * Returns e.g. "5/20/2026, 6:00 PM" or date-only if opts.dateOnly.
 */
export function formatPDT(
  dateStr: string | null | undefined,
  opts?: { dateOnly?: boolean; short?: boolean }
): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  if (opts?.dateOnly) {
    return d.toLocaleDateString('en-US', { timeZone: PT_ZONE, year: 'numeric', month: 'numeric', day: 'numeric' })
  }
  if (opts?.short) {
    return d.toLocaleString('en-US', {
      timeZone: PT_ZONE,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }
  return d.toLocaleString('en-US', { timeZone: PT_ZONE })
}

/**
 * Return the current year-month string in Pacific Time (e.g. "2026-05").
 */
export function getPTYearMonth(): string {
  const { y, m } = ptDateParts(new Date())
  return `${y}-${String(m).padStart(2, '0')}`
}

/**
 * Returns UTC ISO-string boundaries [start, end) for a given "YYYY-MM" month,
 * where the boundaries represent Pacific Time midnight (not UTC midnight).
 *
 * e.g. monthBounds("2026-05"):
 *   start → "2026-05-01T07:00:00.000Z"  (May 1  00:00 PDT = UTC 07:00)
 *   end   → "2026-06-01T07:00:00.000Z"  (Jun 1  00:00 PDT = UTC 07:00)
 *
 * Using bare "YYYY-MM-DDTHH:mm" strings (no timezone) caused a UTC-server bug:
 * new Date("2026-06-01T00:00") on Vercel (UTC) = UTC midnight = PDT May 31 17:00,
 * which made countNights() clamp cross-month stays one calendar day too early.
 */
export function monthBounds(yearMonth: string): { start: string; end: string } {
  const [y, mo] = yearMonth.split('-').map(Number)
  const nextMo = mo === 12 ? 1 : mo + 1
  const nextY  = mo === 12 ? y + 1 : y
  const nextYM = `${String(nextY)}-${String(nextMo).padStart(2, '0')}`
  return {
    start: ptInputToISO(`${yearMonth}-01T00:00`),
    end:   ptInputToISO(`${nextYM}-01T00:00`),
  }
}

/**
 * Count overnight stays between two datetime strings, using Pacific Time calendar dates.
 * e.g. May 20 18:00 PDT → May 21 10:00 PDT = 1 night (correct even when stored as UTC).
 */
export function countNights(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0
  const s = new Date(startStr)
  const e = new Date(endStr)
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0
  // Use Pacific Time calendar dates so UTC-stored times near midnight are handled correctly
  const { y: sy, m: sm, day: sd } = ptDateParts(s)
  const { y: ey, m: em, day: ed } = ptDateParts(e)
  const startMs = Date.UTC(sy, sm - 1, sd)
  const endMs   = Date.UTC(ey, em - 1, ed)
  return Math.max(0, Math.round((endMs - startMs) / 86_400_000))
}

/**
 * Convert a datetime-local string (treated as Pacific Time) to a UTC ISO string.
 * e.g. "2026-05-20T23:30" entered in LA → "2026-05-21T06:30:00.000Z" (during PDT, UTC-7)
 * Uses Intl to correctly probe the DST offset on that calendar date.
 */
export function ptInputToISO(localStr: string): string {
  if (!localStr) return localStr
  const [datePart, timePart] = localStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  // Probe PT offset near noon on that day to avoid the ambiguous DST hour (2 AM)
  const refUTC = Date.UTC(year, month - 1, day, 20, 0) // ~noon PT
  const tzParts = new Intl.DateTimeFormat('en-US', {
    timeZone: PT_ZONE,
    timeZoneName: 'shortOffset',
  }).formatToParts(new Date(refUTC))
  const tzName = tzParts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-7'
  const offsetHours = -parseInt(tzName.replace('GMT', '')) // 7 (PDT) or 8 (PST)
  return new Date(Date.UTC(year, month - 1, day, hour + offsetHours, minute)).toISOString()
}

export function splitPhone(combined: string): { countryCode: string; number: string } {
  if (!combined) return { countryCode: '', number: '' }
  const space = combined.indexOf(' ')
  if (space === -1) return { countryCode: '', number: combined }
  return { countryCode: combined.slice(0, space), number: combined.slice(space + 1) }
}

export function maskPhone(phone: string): string {
  if (!phone) return ''
  const m = phone.match(/^(\+\d{1,3})\s*(.+)$/)
  if (!m) {
    const digits = phone.replace(/\D/g, '')
    if (digits.length <= 4) return phone
    return digits.slice(0, 2) + '*'.repeat(digits.length - 4) + digits.slice(-2)
  }
  const cc = m[1]
  const local = m[2].replace(/\D/g, '')
  if (local.length <= 4) return `${cc} ${local}`
  const showStart = Math.min(3, Math.floor(local.length / 3))
  const showEnd = 2
  const maskLen = local.length - showStart - showEnd
  if (maskLen <= 0) return `${cc} ${local}`
  return `${cc} ${local.slice(0, showStart)}${'*'.repeat(maskLen)}${local.slice(-showEnd)}`
}

export function maskEmail(email: string): string {
  const atIdx = email.indexOf('@')
  if (atIdx < 0) return email
  const local = email.slice(0, atIdx)
  const domain = email.slice(atIdx + 1)
  function maskPart(s: string): string {
    if (s.length <= 2) return s
    return s[0] + '*'.repeat(s.length - 2) + s[s.length - 1]
  }
  const dotIdx = domain.lastIndexOf('.')
  const domainName = dotIdx > 0 ? domain.slice(0, dotIdx) : domain
  const domainSuffix = dotIdx > 0 ? domain.slice(dotIdx) : ''
  return `${maskPart(local)}@${maskPart(domainName)}${domainSuffix}`
}

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length < 4) return digits
  if (digits.length < 7) return `(${digits.slice(0, 3)})${digits.slice(3)}`
  return `(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6)}`
}

function parseAddr(addr: string): { street: string; num: number; unit: number } {
  const m = addr.match(/^(\d+)\s+(.+?)(?:\s+Unit\s+(\d+))?$/i)
  if (!m) return { street: addr, num: 0, unit: 0 }
  return { street: m[2]!, num: parseInt(m[1]!), unit: m[3] ? parseInt(m[3]) : 0 }
}

export function sortAddresses<T extends { address: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const pa = parseAddr(a.address)
    const pb = parseAddr(b.address)
    if (pa.street !== pb.street) return pa.street.localeCompare(pb.street)
    if (pa.num !== pb.num) return pa.num - pb.num
    return pa.unit - pb.unit
  })
}

export function generateMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  const now = new Date()
  // past 6 months + current month + future 9 months = 16 total, newest first
  for (let i = 9; i >= -6; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString('en-US', { year: 'numeric', month: 'long' })
    options.push({ value, label })
  }
  return options
}
