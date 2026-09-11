'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, ClipboardCheck, Eye, Save, UserCheck } from 'lucide-react'
import { formatAttendanceTime } from '@/lib/attendance'
import { REJECT_IMPORT_IDENTITY } from '@/lib/attendanceManagement'
import type {
  FormAction,
  AbsenceResolution,
  AbsenceReview,
  ImportAgentPreview,
  ImportIdentityReview,
  ImportIssue,
  MistagResolution,
  OvertimeResolution,
} from '@/lib/attendanceManagement'

type RosterOption = { email: string; name: string }
type Preview = {
  agents: ImportAgentPreview[]
  identityReviews: ImportIdentityReview[]
  roster: RosterOption[]
  issues: ImportIssue[]
  canCommit: boolean
  shiftDate: string
  absenceReviews: AbsenceReview[]
}
type ConflictResolution = Record<string, Partial<Record<FormAction, 'keep' | 'replace'>>>

export default function AttendanceImportPanel({ currentShiftDate }: { currentShiftDate: string }) {
  const [shiftDate, setShiftDate] = useState(currentShiftDate)
  const [rawText, setRawText] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [resolutions, setResolutions] = useState<ConflictResolution>({})
  const [identityResolutions, setIdentityResolutions] = useState<Record<string, string>>({})
  const [mistagResolutions, setMistagResolutions] = useState<Record<string, MistagResolution>>({})
  const [overtimeResolutions, setOvertimeResolutions] = useState<Record<string, Partial<Record<'pre_shift' | 'post_shift', OvertimeResolution>>>>({})
  const [absenceResolutions, setAbsenceResolutions] = useState<Record<string, AbsenceResolution>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const resetPreview = () => {
    setPreview(null)
    setResolutions({})
    setIdentityResolutions({})
    setMistagResolutions({})
    setOvertimeResolutions({})
    setAbsenceResolutions({})
  }

  const submit = async (mode: 'preview' | 'commit') => {
    setLoading(true); setError(null); setMessage(null)
    try {
      const expected = Object.fromEntries((preview?.agents || []).map((agent) => [agent.email, agent.expectedUpdatedAt]))
      const response = await fetch('/api/attendance/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          shiftDate,
          rawText,
          resolutions,
          expected,
          identityResolutions,
          mistagResolutions,
          overtimeResolutions,
          absenceResolutions,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        if (payload.agents) setPreview(payload)
        throw new Error(payload.error || 'Unable to process attendance paste')
      }
      if (mode === 'preview') {
        setPreview(payload)
        const conflictDefaults: ConflictResolution = {}
        payload.agents.forEach((agent: ImportAgentPreview) => {
          conflictDefaults[agent.email] = Object.fromEntries(
            agent.conflicts.map((field) => [field, resolutions[agent.email]?.[field] || 'keep'])
          )
        })
        setResolutions(conflictDefaults)
        setIdentityResolutions((current) => {
          const next = { ...current }
          payload.identityReviews.forEach((review: ImportIdentityReview) => {
            if (next[review.key]) return
            const best = review.candidates[0]
            const runnerUp = review.candidates[1]
            if (review.reason === 'unknown_email' && best && best.score >= 70 && best.score - (runnerUp?.score || 0) >= 5) {
              next[review.key] = best.email
            }
          })
          return next
        })
      } else {
        setMessage(`Saved attendance for ${payload.saved} agent${payload.saved === 1 ? '' : 's'} and ${payload.outcomesSaved || 0} attendance outcome${payload.outcomesSaved === 1 ? '' : 's'} on ${shiftDate}.`)
        resetPreview()
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to process attendance paste')
    } finally { setLoading(false) }
  }

  const changeResolution = (email: string, field: FormAction, value: 'keep' | 'replace') =>
    setResolutions((current) => ({ ...current, [email]: { ...current[email], [field]: value } }))

  const approvalsComplete = useMemo(() => {
    if (!preview) return false
    const identitiesReady = preview.identityReviews.every((review) => identityResolutions[review.key])
    const mistagsReady = preview.agents.every(
      (agent) => !agent.suspectedMistag || mistagResolutions[agent.email]
    )
    const overtimeReady = preview.agents.every((agent) => (
      (!agent.overtimeReview.preShift || overtimeResolutions[agent.email]?.pre_shift)
      && (!agent.overtimeReview.postShift || overtimeResolutions[agent.email]?.post_shift)
    ))
    const absencesReady = preview.absenceReviews.every((review) => absenceResolutions[review.email])
    return identitiesReady && mistagsReady && overtimeReady && absencesReady
  }, [absenceResolutions, identityResolutions, mistagResolutions, overtimeResolutions, preview])
  const hasPendingApprovalReview = Boolean(preview && (
    preview.identityReviews.length > 0
    || preview.agents.some((agent) => agent.suspectedMistag && !agent.suspectedMistag.resolution)
    || preview.agents.some((agent) => (
      (agent.overtimeReview.preShift && !agent.overtimeReview.preShift.resolution)
      || (agent.overtimeReview.postShift && !agent.overtimeReview.postShift.resolution)
    ))
    || preview.absenceReviews.some((review) => !review.resolution)
  ))

  return <div className="space-y-5">
    <div className="rounded-xl border border-outline-variant/30 bg-surface p-5">
      <div className="mb-1 flex items-center gap-2"><ClipboardCheck size={20} className="text-primary" /><h2 className="font-hanken text-xl font-bold text-on-surface">Paste Google Form responses</h2></div>
      <p className="mb-4 text-sm text-on-surface-variant">Time IN, Time OUT, OVERTIME IN, and OVERTIME OUT are accepted. Normal/Graveyard stays on the selected business shift date; Overnight is stored on the following calendar date. Clocks at least two hours before or after the applicable schedule require an explicit overtime decision.</p>
      <label className="mb-4 block max-w-xs"><span className="mb-1 block text-xs font-semibold uppercase text-on-surface-variant">Shift date (America/New_York)</span><input type="date" value={shiftDate} onChange={(event) => { setShiftDate(event.target.value); resetPreview() }} className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-low px-3 py-2 text-sm text-on-surface" /></label>
      <textarea value={rawText} onChange={(event) => { setRawText(event.target.value); resetPreview() }} rows={9} placeholder={'Timestamp\tEmail\tAgent Name\tAction\tTeam Leader\n9/6/2026 8:07:28\tmldevera@m-piece.com\tMaria Luisa De Vera\tOVERTIME OUT\tCharlene Esparza'} className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-low p-3 font-mono text-xs text-on-surface outline-none focus:border-primary" />
      <button type="button" onClick={() => void submit('preview')} disabled={loading || !rawText.trim()} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-40"><Eye size={16} />{loading ? 'Checking…' : 'Preview attendance'}</button>
      {error && <p className="mt-3 text-sm text-error">{error}</p>}{message && <p className="mt-3 text-sm text-success">{message}</p>}
    </div>

    {preview?.identityReviews.length ? <IdentityReview
      reviews={preview.identityReviews}
      roster={preview.roster}
      selections={identityResolutions}
      onChange={(key, email) => setIdentityResolutions((current) => ({ ...current, [key]: email }))}
    /> : null}

    {preview?.absenceReviews.length ? <div className="rounded-xl border border-error/30 bg-surface p-5">
      <div className="mb-2 flex items-center gap-2"><UserCheck size={18} className="text-error" /><h3 className="font-semibold text-on-surface">Confirm agents beyond the one-hour grace period</h3></div>
      <p className="mb-4 text-sm text-on-surface-variant">These scheduled agents have no attendance more than one hour after their applicable start. This is an attendance outcome—not a Date Exception—and requires an uploader decision.</p>
      <div className="grid gap-3 lg:grid-cols-2">{preview.absenceReviews.map((review) => <label key={review.email} className="rounded-lg border border-outline-variant/40 p-3 text-sm">
        <span className="block font-semibold text-on-surface">{review.agentName}</span>
        <span className="mb-2 block text-xs text-on-surface-variant">{review.shiftDate} · scheduled {review.startShift}</span>
        <select value={absenceResolutions[review.email] || review.resolution || ''} onChange={(event) => setAbsenceResolutions((current) => ({ ...current, [review.email]: event.target.value as AbsenceResolution }))} className="w-full rounded border border-outline-variant bg-surface-container-low px-2 py-1.5 text-sm text-on-surface">
          <option value="">Uploader decision required…</option>
          <option value="confirmed_absent">Confirm Absent</option>
          <option value="not_absent">Not absent — keep attendance pending</option>
        </select>
      </label>)}</div>
    </div> : null}

    {preview && <div className="rounded-xl border border-outline-variant/30 bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-hanken text-lg font-bold text-on-surface">Import preview</h3><p className="text-sm text-on-surface-variant">{preview.agents.length} matched agents for {preview.shiftDate}</p></div>
        {preview.canCommit
          ? <button type="button" onClick={() => void submit('commit')} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-40"><Save size={16} />Save accepted rows</button>
          : hasPendingApprovalReview
            ? <button type="button" onClick={() => void submit('preview')} disabled={loading || !approvalsComplete} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-40"><UserCheck size={16} />Apply approvals and refresh</button>
            : <span className="text-sm font-medium text-on-surface-variant">{preview.agents.length ? 'Correct the blocking pasted rows and preview again.' : 'No accepted rows to save.'}</span>}
      </div>

      {preview.issues.length > 0 && <div className="mb-4 rounded-lg bg-warning-container/50 p-4 text-sm text-on-warning-container"><div className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} />Review import issues</div><ul className="mt-2 list-disc pl-5">{preview.issues.map((issue, index) => <li key={`${issue.message}-${index}`}>{issue.rowNumber ? `Row ${issue.rowNumber}: ` : ''}{issue.message}{issue.blocking ? ' (approval required)' : ''}</li>)}</ul></div>}

      <div className="overflow-auto"><table className="w-full min-w-[1040px]"><thead className="bg-surface-container-low"><tr>{['Agent','Selected Time In','Selected Time Out','Existing Time In','Existing Time Out','Review'].map((heading) => <th key={heading} className="px-3 py-2 text-left text-xs font-semibold uppercase text-on-surface-variant">{heading}</th>)}</tr></thead><tbody className="divide-y divide-outline-variant/20">{preview.agents.map((agent) => <tr key={agent.email}>
        <td className="px-3 py-2"><div className="text-sm font-semibold text-on-surface">{agent.agentName}</div><div className="text-xs text-on-surface-variant">{agent.email}</div><div className="mt-1 text-xs font-semibold text-primary">Calendar date: {agent.shiftDate}</div>{agent.nameWarning && <div className="mt-1 text-xs text-warning">{agent.nameWarning}</div>}{agent.scheduleWarning && <div className="mt-1 rounded bg-primary-container/25 px-2 py-1 text-xs text-primary">{agent.scheduleWarning}</div>}</td>
        <td className="px-3 py-2 font-mono text-xs">{formatAttendanceTime(agent.timeIn)}</td><td className="px-3 py-2 font-mono text-xs">{formatAttendanceTime(agent.timeOut)}</td><td className="px-3 py-2 font-mono text-xs">{formatAttendanceTime(agent.existingTimeIn)}</td><td className="px-3 py-2 font-mono text-xs">{formatAttendanceTime(agent.existingTimeOut)}</td>
        <td className="space-y-2 px-3 py-2 text-xs">
          {agent.suspectedMistag && <label className="block rounded-md bg-warning-container/50 p-2"><span className="mb-1 block font-semibold">Possible incorrect {agent.suspectedMistag.duplicatedAction === 'time_in' ? 'Time In' : 'Time Out'} tags ({formatDuration(agent.suspectedMistag.gapMinutes)} apart)</span><select value={mistagResolutions[agent.email] || ''} onChange={(event) => setMistagResolutions((current) => ({ ...current, [agent.email]: event.target.value as MistagResolution }))} className="w-full rounded border border-outline-variant bg-surface px-2 py-1"><option value="">Uploader approval required…</option><option value="keep_duplicates">Real duplicates — apply duplicate rule</option><option value="reinterpret">Incorrect tags — earlier is In, later is Out</option></select></label>}
          {agent.duplicateDetails.map((detail) => <div key={detail.action} className="text-on-surface-variant">{detail.count} {detail.action === 'time_in' ? 'Time In' : 'Time Out'} rows · {formatDuration(detail.gapMinutes)} range · selected {formatAttendanceTime(detail.selectedTimestamp)}</div>)}
          {agent.overtimeReview.preShift && <OvertimeReviewSelect
            label="Possible Pre-shift OT"
            minutes={agent.overtimeReview.preShift.minutes}
            value={overtimeResolutions[agent.email]?.pre_shift || agent.overtimeReview.preShift.resolution || ''}
            confirmLabel="Confirm Pre-shift OT"
            onChange={(value) => setOvertimeResolutions((current) => ({ ...current, [agent.email]: { ...current[agent.email], pre_shift: value } }))}
          />}
          {agent.overtimeReview.postShift && <OvertimeReviewSelect
            label="Possible Post-shift OT"
            minutes={agent.overtimeReview.postShift.minutes}
            value={overtimeResolutions[agent.email]?.post_shift || agent.overtimeReview.postShift.resolution || ''}
            confirmLabel="Confirm Post-shift OT"
            onChange={(value) => setOvertimeResolutions((current) => ({ ...current, [agent.email]: { ...current[agent.email], post_shift: value } }))}
          />}
          {agent.conflicts.map((field) => <label key={field} className="flex items-center gap-2"><span>{field === 'time_in' ? 'In:' : 'Out:'}</span><select value={resolutions[agent.email]?.[field] || 'keep'} onChange={(event) => changeResolution(agent.email, field, event.target.value as 'keep' | 'replace')} className="rounded border border-outline-variant bg-surface px-2 py-1"><option value="keep">Keep existing</option><option value="replace">Replace explicitly</option></select></label>)}
          {!agent.suspectedMistag && !agent.overtimeReview.preShift && !agent.overtimeReview.postShift && !agent.duplicateDetails.length && !agent.conflicts.length && (agent.missing.length ? `Missing ${agent.missing.map((field) => field === 'time_in' ? 'Time In' : 'Time Out').join(' and ')}` : 'Ready')}
        </td>
      </tr>)}</tbody></table></div>
    </div>}
  </div>
}

function OvertimeReviewSelect({ label, minutes, value, confirmLabel, onChange }: {
  label: string
  minutes: number
  value: OvertimeResolution | ''
  confirmLabel: string
  onChange: (value: OvertimeResolution) => void
}) {
  return <label className="block rounded-md border border-success/30 bg-success-container/30 p-2 text-on-success-container">
    <span className="mb-1 block font-semibold">{label} ({formatDuration(minutes)})</span>
    <select value={value} onChange={(event) => onChange(event.target.value as OvertimeResolution)} className="w-full rounded border border-outline-variant bg-surface px-2 py-1 text-on-surface">
      <option value="">Uploader approval required…</option>
      <option value="confirm">{confirmLabel}</option>
      <option value="not_overtime">Not OT — keep as a normal clock</option>
    </select>
  </label>
}

function IdentityReview({ reviews, roster, selections, onChange }: {
  reviews: ImportIdentityReview[]
  roster: RosterOption[]
  selections: Record<string, string>
  onChange: (key: string, email: string) => void
}) {
  return <div className="rounded-xl border border-warning/30 bg-surface p-5">
    <div className="mb-3 flex items-center gap-2"><UserCheck size={18} className="text-warning" /><h3 className="font-semibold text-on-surface">Approve uncertain identities</h3></div>
    <p className="mb-4 text-sm text-on-surface-variant">Email and name are checked first. Team leader and schedule proximity are supporting evidence only; Day Off may be valid RDOT. Approve or reject every uncertain identity.</p>
    <div className="space-y-4">{reviews.map((review) => {
      const suggestions = new Set(review.candidates.map((candidate) => candidate.email))
      return <section key={review.key} className="rounded-lg border border-outline-variant/40 p-4">
        <div className="mb-3 grid gap-2 text-sm sm:grid-cols-3">
          <div><span className="block text-xs font-semibold uppercase text-on-surface-variant">Pasted agent</span><strong>{review.pastedName}</strong><span className="block text-xs text-on-surface-variant">Rows {review.rowNumbers.join(', ')}</span></div>
          <div><span className="block text-xs font-semibold uppercase text-on-surface-variant">Pasted email</span><span className="font-mono text-xs text-error">{review.pastedEmail}</span></div>
          <div><span className="block text-xs font-semibold uppercase text-on-surface-variant">Pasted team leader</span><span>{review.pastedTeamLeader || 'Not provided'}</span></div>
        </div>
        {review.reason === 'email_name_conflict' && <p className="mb-3 rounded-md bg-error-container/40 p-2 text-xs text-on-error-container">The email and name point to different roster agents. Schedule proximity will not choose one automatically.</p>}
        <div className="mb-3 grid gap-2 lg:grid-cols-2">{review.candidates.map((candidate) => <label key={candidate.email} className={`cursor-pointer rounded-md border p-3 text-xs ${selections[review.key] === candidate.email ? 'border-primary bg-primary-container/20' : 'border-outline-variant/40'}`}>
          <div className="flex items-start gap-2"><input type="radio" name={review.key} checked={selections[review.key] === candidate.email} onChange={() => onChange(review.key, candidate.email)} /><div><strong className="text-sm text-on-surface">{candidate.name}</strong><span className="ml-2 text-on-surface-variant">Name {candidate.score}%</span><div className="mt-1 text-on-surface-variant">{candidate.emailMatch ? 'Exact submitted email' : candidate.email}</div><div className="mt-1">Team leader: {candidate.teamLeaderMatch === null ? 'not provided' : candidate.teamLeaderMatch ? 'matches' : 'does not match'}</div><div>{candidate.scheduleEvidence}</div></div></div>
        </label>)}</div>
        <label className="block text-xs font-semibold uppercase text-on-surface-variant">Approved resolution<select value={selections[review.key] || ''} onChange={(event) => onChange(review.key, event.target.value)} className="mt-1 w-full rounded border border-outline-variant bg-surface-container-low px-2 py-1.5 text-sm font-normal normal-case"><option value="">Choose and approve…</option>{review.candidates.map((candidate) => <option key={candidate.email} value={candidate.email}>{candidate.name} — name {candidate.score}%{candidate.emailMatch ? ', exact email' : ''}</option>)}<optgroup label="All other roster agents">{roster.filter((agent) => !suggestions.has(agent.email)).map((agent) => <option key={agent.email} value={agent.email}>{agent.name}</option>)}</optgroup><option value={REJECT_IMPORT_IDENTITY}>Reject these pasted rows</option></select></label>
      </section>
    })}</div>
  </div>
}

const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${hours}h${remainder ? ` ${remainder}m` : ''}`
}
