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
  'Vehicle Parked for Over 96 Hours Without Movement',
  'Opposite Direction of Traffic',
  'Parking Outside Designated Spaces',
  'Parking in Red-Curb Zone',
  'Unauthorized Commercial Vehicle',
  'Parking in Handicap Space Without Permit',
  'Safety Concern (Suspicious Person/Vehicle)',
  'Other',
] as const

export const VISITOR_QUOTA_LIMIT = 10

/**
 * Count how many midnight boundaries (00:00) fall within a parking period.
 * Equivalent to: floor(end_date) - floor(start_date) in calendar days.
 * e.g. May 12 22:00 → May 15 08:00 = 3 nights (crosses May 13, 14, 15 00:00)
 *      May 12 08:00 → May 12 23:00 = 0 nights (no midnight crossed)
 */
/** Returns ISO-string boundaries [start, end) for a given "YYYY-MM" month. */
export function monthBounds(yearMonth: string): { start: string; end: string } {
  const [y, mo] = yearMonth.split('-').map(Number)
  const nextMo = mo === 12 ? 1 : mo + 1
  const nextY  = mo === 12 ? y + 1 : y
  return {
    start: `${yearMonth}-01T00:00`,
    end:   `${String(nextY)}-${String(nextMo).padStart(2, '0')}-01T00:00`,
  }
}

export function countNights(startStr: string, endStr: string): number {
  const sd = startStr.slice(0, 10)
  const ed = endStr.slice(0, 10)
  if (!sd || !ed || sd.length < 10 || ed.length < 10) return 0
  const start = Date.UTC(+sd.slice(0, 4), +sd.slice(5, 7) - 1, +sd.slice(8, 10))
  const end   = Date.UTC(+ed.slice(0, 4), +ed.slice(5, 7) - 1, +ed.slice(8, 10))
  return Math.max(0, Math.round((end - start) / 86_400_000))
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
