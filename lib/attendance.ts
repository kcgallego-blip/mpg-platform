export const EASTERN_TIME_ZONE = 'America/New_York'
export const PHILIPPINE_TIME_ZONE = 'Asia/Manila'

export type AttendanceSource = 'google_form_paste' | 'manual' | 'legacy' | 'self_service'
export type OvertimeReviewStatus = 'not_required' | 'pending' | 'approved' | 'rejected'
export type AttendanceNetworkStatus = 'office' | 'offsite_flagged' | 'wfh_exempt' | 'unknown_ip_flagged' | 'unconfigured'

export type AttendanceRecord = {
  agent: string
  shift_date: string
  time_in: string | null
  time_out: string | null
  source?: AttendanceSource | null
  updated_by?: string | null
  updated_at?: string | null
  import_id?: string | null
  pre_shift_ot_approved?: boolean | null
  post_shift_ot_approved?: boolean | null
  pre_shift_ot_review?: OvertimeReviewStatus | null
  post_shift_ot_review?: OvertimeReviewStatus | null
}

export type AttendanceOutcomeValue = 'confirmed_absent' | 'not_absent'

export type AttendanceDayOutcome = {
  agentEmail: string
  shiftDate: string
  outcome: AttendanceOutcomeValue
  note?: string | null
  updatedBy?: string | null
  updatedAt?: string | null
}

export type ScheduleExceptionKind =
  | 'holiday_off'
  | 'leave'
  | 'vacation_leave'
  | 'sick_leave'
  | 'transition_off'
  | 'day_off'
  | 'absent'
  | 'scheduled'

export type AttendanceDayStatus =
  | 'Scheduled'
  | 'Currently Working'
  | 'Complete'
  | 'Missing Time In'
  | 'Missing Time Out'
  | 'No attendance record'
  | 'Awaiting Time In'
  | 'Absence Confirmation Required'
  | 'Not Absent - Missing Attendance'
  | 'Day Off'
  | 'Holiday Off'
  | 'Leave'
  | 'Vacation Leave'
  | 'Sick Leave'
  | 'Transition Off'
  | 'Absent'
  | 'RDOT - Currently Working'
  | 'RDOT - Complete'
  | 'RDOT - Missing Time In'
  | 'RDOT - Missing Time Out'

export type ShiftGroup = 'normal_graveyard' | 'overnight'

export type RosterAttendanceAgent = {
  email: string
  name: string
  teamLeader: string
  startShift: string
  endShift: string
  off1: string
  off2: string
  shiftGroup: ShiftGroup
}

export type ScheduleSnapshotEntry = RosterAttendanceAgent & { versionId?: string }

export type ScheduleException = {
  id?: string
  agentEmail: string
  shiftDate: string
  kind: ScheduleExceptionKind
  startShift?: string | null
  endShift?: string | null
  note?: string | null
}

export type ResolvedAttendanceDay = {
  agent: string
  agentName: string
  teamLeader: string
  shiftDate: string
  timeIn: string | null
  timeOut: string | null
  startShift: string
  endShift: string
  off1: string
  off2: string
  shiftGroup: ShiftGroup
  status: AttendanceDayStatus
  exceptionKind: ScheduleExceptionKind | null
  scheduleSource: 'exception' | 'snapshot' | 'roster'
  attendanceOutcome: AttendanceOutcomeValue | null
  preShiftOtApproved: boolean
  postShiftOtApproved: boolean
  preShiftOtReview: OvertimeReviewStatus
  postShiftOtReview: OvertimeReviewStatus
  preShiftOtMinutes: number
  postShiftOtMinutes: number
  lateMinutes: number
  undertimeMinutes: number
  updatedAt: string | null
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const isDateKey = (value: string) => {
  if (!DATE_KEY_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export const getDateKeyInTimeZone = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`
}

/** Attendance shift-date selectors follow the real Eastern calendar, including DST. */
export const SHIFT_DATE_ROLLOVER_HOUR = 6

/** The operational business date changes at 6:00 AM Eastern, after Overnight starts. */
export const getDefaultShiftDate = (date = new Date()) => {
  const easternWallClock = getEasternWallClockTimestamp(date)
  const shifted = new Date(wallClockTimestampValue(easternWallClock) - SHIFT_DATE_ROLLOVER_HOUR * 60 * 60_000)
  return getDateKeyInTimeZone(shifted, 'UTC')
}

export const getEasternWallClockTimestamp = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`
}

/** Self-service clock values are stored as Philippine local wall-clock timestamps. */
export const getPhilippineWallClockTimestamp = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PHILIPPINE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`
}

const wallClockTimestampValue = (value: string) => Date.parse(`${value.replace(' ', 'T')}Z`)

export const parseDateKey = (value: string) => {
  if (!isDateKey(value)) throw new Error(`Invalid date key: ${value}`)
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export const getMonthRange = (month: Date) => {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  return { from: toDateKey(firstDay), to: toDateKey(lastDay) }
}

export const enumerateDateKeys = (from: string, to: string) => {
  if (!isDateKey(from) || !isDateKey(to)) return []
  const result: string[] = []
  const cursor = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (cursor <= end) {
    result.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return result
}

export const addDateKeyDays = (dateKey: string, days: number) => {
  if (!isDateKey(dateKey)) throw new Error(`Invalid date key: ${dateKey}`)
  const date = new Date(`${dateKey}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Maps a business shift date to the actual calendar date used by each cohort. */
export const getOperationalCalendarDate = (shiftDate: string, shiftGroup: ShiftGroup) =>
  shiftGroup === 'overnight' ? addDateKeyDays(shiftDate, 1) : shiftDate

/** Supabase wall-clock values are deliberately displayed without timezone conversion. */
export const formatAttendanceTime = (timestamp: string | null) => {
  if (!timestamp) return '--'
  const match = timestamp.match(/(?:T|\s)(\d{2}):(\d{2})(?::(\d{2}))?/)
  return match ? `${match[1]}:${match[2]}:${match[3] || '00'}` : '--'
}

/** Calendar-only 12-hour display; the stored wall clock is not timezone-converted. */
export const formatAttendanceTime12Hour = (timestamp: string | null) => {
  if (!timestamp) return '--'
  const match = timestamp.match(/(?:T|\s)(\d{2}):(\d{2})(?::\d{2})?/)
  if (!match) return '--'
  const hour = Number(match[1])
  if (hour > 23) return '--'
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${match[2]} ${suffix}`
}

export const normalizeEmail = (value: string) => value.trim().toLowerCase()

export const normalizePersonName = (value: string) =>
  value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ').toLowerCase()

const WEEKDAY_ALIASES: Record<string, string> = {
  sun: 'sunday',
  sunday: 'sunday',
  mon: 'monday',
  monday: 'monday',
  tue: 'tuesday',
  tues: 'tuesday',
  tuesday: 'tuesday',
  wed: 'wednesday',
  weds: 'wednesday',
  wednesday: 'wednesday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  thursday: 'thursday',
  fri: 'friday',
  friday: 'friday',
  sat: 'saturday',
  saturday: 'saturday',
}

export const normalizeWeekday = (value: string | null | undefined) => {
  const normalized = (value || '').trim().toLowerCase().replace(/\.$/, '')
  return WEEKDAY_ALIASES[normalized] || normalized
}

export const getWeekdayForDateKey = (dateKey: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' })
    .format(new Date(`${dateKey}T12:00:00Z`)).toLowerCase()

const parseClockHour = (value: string) => {
  const match = value.trim().match(/^(\d{1,2})(?::\d{2})?(?::\d{2})?\s*(am|pm)?$/i)
  if (!match) return null
  let hour = Number(match[1])
  if (hour > 23) return null
  const suffix = match[2]?.toLowerCase()
  if (suffix) {
    if (hour < 1 || hour > 12) return null
    if (suffix === 'am') hour %= 12
    if (suffix === 'pm') hour = (hour % 12) + 12
  }
  return hour
}

/** Starts from midnight through 5:59 AM default to the overnight cohort; managers can override it. */
export const inferShiftGroup = (startShift: string): ShiftGroup => {
  const hour = parseClockHour(startShift)
  return hour !== null && hour < 6 ? 'overnight' : 'normal_graveyard'
}

export const exceptionStatus = (kind: ScheduleExceptionKind): AttendanceDayStatus => {
  if (kind === 'holiday_off') return 'Holiday Off'
  if (kind === 'transition_off') return 'Transition Off'
  if (kind === 'day_off') return 'Day Off'
  if (kind === 'leave' || kind === 'vacation_leave') return 'Vacation Leave'
  if (kind === 'sick_leave') return 'Sick Leave'
  if (kind === 'absent') return 'Absent'
  return 'Scheduled'
}
