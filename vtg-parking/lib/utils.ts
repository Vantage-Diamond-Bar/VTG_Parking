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

export const VISITOR_QUOTA_LIMIT = 10
