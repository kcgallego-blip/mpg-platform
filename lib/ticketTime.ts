export type Meridiem = 'AM' | 'PM'

export type TwelveHourTime = {
  time: string
  meridiem: Meridiem
}

export function getCurrentManilaTime(date = new Date()): TwelveHourTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  const minute = parts.find((part) => part.type === 'minute')?.value || '00'
  const dayPeriod = parts.find((part) => part.type === 'dayPeriod')?.value.toUpperCase()
  return {
    time: `${Number.isInteger(hour) && hour > 0 ? hour : 12}:${minute}`,
    meridiem: dayPeriod === 'PM' ? 'PM' : 'AM',
  }
}

export function convertTwelveHourTimeToDatabaseTime(value: string, meridiem: Meridiem): string | null {
  const match = value.trim().match(/^(\d{1,2}):([0-5]\d)$/)
  if (!match) return null
  const hour = Number(match[1])
  if (hour < 1 || hour > 12) return null
  const hour24 = (hour % 12) + (meridiem === 'PM' ? 12 : 0)
  return `${hour24.toString().padStart(2, '0')}:${match[2]}:00`
}

export function normalizeDatabaseTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/)
  if (!match) return null
  return `${match[1]}:${match[2]}:${match[3] || '00'}`
}
