import { NextRequest, NextResponse } from 'next/server'
import { canManageAttendance } from '@/lib/attendanceAccess'
import {
  FormAction,
  AbsenceResolution,
  MistagResolution,
  OvertimeResolution,
  buildImportPreview,
  buildAbsenceReviews,
  parseGoogleFormPaste,
} from '@/lib/attendanceManagement'
import {
  commitAttendanceRows,
  loadAttendanceRoster,
  loadOperationalAttendance,
  loadTrackerOrder,
} from '@/lib/attendanceService'
import { isDateKey } from '@/lib/attendance'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'

export const dynamic = 'force-dynamic'
const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedDbUser(request)
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: HEADERS })
    if (!canManageAttendance(user.role)) return NextResponse.json({ error: 'Attendance import access denied' }, { status: 403, headers: HEADERS })
    const body = await request.json()
    const shiftDate = typeof body?.shiftDate === 'string' ? body.shiftDate : ''
    const rawText = typeof body?.rawText === 'string' ? body.rawText : ''
    const mode = body?.mode === 'commit' ? 'commit' : 'preview'
    if (!isDateKey(shiftDate)) return NextResponse.json({ error: 'A valid selected shift date is required.' }, { status: 400, headers: HEADERS })

    const roster = await loadAttendanceRoster()
    const order = await loadTrackerOrder(roster)
    if (!order.ready) return NextResponse.json({ error: 'Save a valid tracker order before importing attendance.', issues: order.issues }, { status: 409, headers: HEADERS })
    const parsed = parseGoogleFormPaste(rawText)
    const resolved = await loadOperationalAttendance({
      shiftDate,
      roster: order.agents,
      currentShiftDate: shiftDate,
    })
    const identityResolutions = body?.identityResolutions && typeof body.identityResolutions === 'object'
      ? body.identityResolutions as Record<string, string>
      : {}
    const mistagResolutions = body?.mistagResolutions && typeof body.mistagResolutions === 'object'
      ? body.mistagResolutions as Record<string, MistagResolution>
      : {}
    const overtimeResolutions = body?.overtimeResolutions && typeof body.overtimeResolutions === 'object'
      ? body.overtimeResolutions as Record<string, Partial<Record<'pre_shift' | 'post_shift', OvertimeResolution>>>
      : {}
    const absenceResolutions = body?.absenceResolutions && typeof body.absenceResolutions === 'object'
      ? body.absenceResolutions as Record<string, AbsenceResolution>
      : {}
    const preview = buildImportPreview({
      rows: parsed.rows,
      roster: order.agents,
      existing: resolved.attendance,
      resolvedDays: resolved.days,
      baseShiftDate: shiftDate,
      identityResolutions,
      mistagResolutions,
      overtimeResolutions,
    })
    const absenceReviews = buildAbsenceReviews({
      days: resolved.days,
      importedAttendanceEmails: preview.agents.filter((agent) => agent.timeIn || agent.timeOut).map((agent) => agent.email),
      resolutions: absenceResolutions,
    })
    const absenceIssues = absenceReviews.map((review) => ({
      email: review.email,
      message: `${review.agentName} has no attendance more than one hour after the ${review.startShift} scheduled start. Confirm Absent or Not absent.`,
      blocking: !review.resolution,
    }))
    const outcomeKeys = new Set(resolved.outcomes.map((entry) => `${entry.agentEmail}|${entry.shiftDate}`))
    const outcomesToClear = preview.agents
      .filter((agent) => (agent.timeIn || agent.timeOut) && outcomeKeys.has(`${agent.email}|${agent.shiftDate}`))
      .map((agent) => ({ agent_email: agent.email, shift_date: agent.shiftDate, outcome: null }))
    const outcomeClearIssues = outcomesToClear.map((entry) => ({
      email: entry.agent_email,
      message: 'Existing absence outcome will be cleared because attendance clocks are being saved.',
      blocking: false,
    }))
    const issues = [...parsed.issues, ...preview.issues, ...absenceIssues, ...outcomeClearIssues]
    const canCommit = (preview.agents.length > 0 || absenceReviews.length > 0) && !issues.some((issue) => issue.blocking)
    if (mode === 'preview') return NextResponse.json({
      ...preview,
      absenceReviews,
      issues,
      canCommit,
      shiftDate,
      roster: roster.map((agent) => ({ email: agent.email, name: agent.name })),
    }, { headers: HEADERS })
    if (!canCommit) return NextResponse.json({ error: 'Resolve blocking import issues before saving.', ...preview, absenceReviews, issues }, { status: 400, headers: HEADERS })

    const resolutions = (body?.resolutions || {}) as Record<string, Partial<Record<FormAction, 'keep' | 'replace'>>>
    const expected = (body?.expected || {}) as Record<string, string | null>
    const rows = preview.agents.map((agent) => {
      const resolution = resolutions[agent.email] || {}
      const unresolved = agent.conflicts.filter((field) => resolution[field] !== 'replace')
      const timeIn = unresolved.includes('time_in') ? agent.existingTimeIn : agent.timeIn || agent.existingTimeIn
      const timeOut = unresolved.includes('time_out') ? agent.existingTimeOut : agent.timeOut || agent.existingTimeOut
      const usesImportedTimeIn = Boolean(agent.timeIn) && !unresolved.includes('time_in')
      const usesImportedTimeOut = Boolean(agent.timeOut) && !unresolved.includes('time_out')
      return {
        agent_email: agent.email,
        shift_date: agent.shiftDate,
        time_in: timeIn,
        time_out: timeOut,
        pre_shift_ot_approved: usesImportedTimeIn
          ? agent.overtimeReview.preShift?.resolution === 'confirm'
          : agent.existingPreShiftOtApproved,
        pre_shift_ot_review: usesImportedTimeIn
          ? agent.overtimeReview.preShift
            ? agent.overtimeReview.preShift.resolution === 'confirm' ? 'approved' : 'rejected'
            : 'not_required'
          : agent.existingPreShiftOtReview,
        post_shift_ot_approved: usesImportedTimeOut
          ? agent.overtimeReview.postShift?.resolution === 'confirm'
          : agent.existingPostShiftOtApproved,
        post_shift_ot_review: usesImportedTimeOut
          ? agent.overtimeReview.postShift
            ? agent.overtimeReview.postShift.resolution === 'confirm' ? 'approved' : 'rejected'
            : 'not_required'
          : agent.existingPostShiftOtReview,
        expected_updated_at: Object.prototype.hasOwnProperty.call(expected, agent.email) ? expected[agent.email] : agent.expectedUpdatedAt,
      }
    })
    const outcomes = [...absenceReviews.map((review) => ({
      agent_email: review.email,
      shift_date: review.shiftDate,
      outcome: review.resolution!,
    })), ...outcomesToClear]
    const result = await commitAttendanceRows({ shiftDate, source: 'google_form_paste', actor: user.email, rows, outcomes })
    return NextResponse.json({
      success: true,
      result,
      saved: rows.length,
      outcomesSaved: outcomes.length,
      confirmedAbsences: outcomes.filter((entry) => entry.outcome === 'confirmed_absent').length,
    }, { headers: HEADERS })
  } catch (error: any) {
    const concurrent = error?.code === '40001' || /changed after preview/i.test(error?.message || '')
    const legacyForeignKey = error?.code === '23503' && /attendance_agent_fkey/i.test(error?.message || '')
    const missingCohortRpc = /commit_attendance_with_outcomes|attendance_day_outcomes/i.test(error?.message || '')
    return NextResponse.json({ error: concurrent
      ? 'Attendance changed after preview. Preview again before saving.'
      : legacyForeignKey
        ? 'The database still has the legacy attendance-agent foreign key. Apply migration 28_remove_attendance_agent_foreign_key.sql, then retry.'
        : missingCohortRpc
          ? 'Apply migration 32_add_attendance_absence_outcomes.sql before importing attendance, then retry.'
        : error?.message || 'Unable to import attendance' }, { status: concurrent || legacyForeignKey || missingCohortRpc ? 409 : 500, headers: HEADERS })
  }
}
