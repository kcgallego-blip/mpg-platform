import type { ResolvedAttendanceDay } from './attendance.ts'
import { formatAttendanceTime } from './attendance.ts'

const OFF_STATUSES = new Set(['Day Off', 'Holiday Off', 'Leave', 'Vacation Leave', 'Sick Leave', 'Transition Off', 'Absent'])
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character] || character))

export const buildAgentAttendanceClipboard = (day: ResolvedAttendanceDay) => {
  const timeIn = formatAttendanceTime(day.timeIn)
  const timeOut = formatAttendanceTime(day.timeOut)
  const values = OFF_STATUSES.has(day.status)
    ? [day.status.toUpperCase(), '']
    : [timeIn === '--' ? '' : timeIn, timeOut === '--' ? '' : timeOut]
  const isRdot = day.status.startsWith('RDOT')
  const colors = isRdot
    ? ['#34A853', '#34A853']
    : [day.lateMinutes > 0 ? '#FFFF00' : '', day.undertimeMinutes > 0 ? '#FFFF00' : '']
  const html = `<table><tbody>${values.map((value, index) => {
    const color = colors[index]
    return `<tr><td${color ? ` bgcolor="${color}" style="background-color:${color}"` : ''}>${escapeHtml(value)}</td></tr>`
  }).join('')}</tbody></table>`

  return { values, colors, plainText: values.join('\n'), html }
}
