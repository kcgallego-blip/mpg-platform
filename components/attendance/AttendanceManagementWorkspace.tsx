'use client'

import { useState } from 'react'
import { CalendarClock, CalendarDays, ClipboardPaste, ListOrdered, PencilLine, Rows3, Wifi } from 'lucide-react'
import TeamAttendanceListView from './TeamAttendanceListView'
import AttendanceImportPanel from './AttendanceImportPanel'
import ScheduleManagementPanel from './ScheduleManagementPanel'
import TrackerOrderPanel from './TrackerOrderPanel'
import ManualAttendancePanel from './ManualAttendancePanel'
import ManagerAgentCalendarPanel from './ManagerAgentCalendarPanel'
import ClockingPolicyPanel from './ClockingPolicyPanel'

type Tab = 'daily' | 'calendars' | 'import' | 'schedule' | 'order' | 'manual' | 'clocking'
const tabs: Array<{ id: Tab; label: string; icon: typeof Rows3 }> = [
  { id: 'daily', label: 'Daily Log', icon: Rows3 },
  { id: 'calendars', label: 'Agent Calendars', icon: CalendarDays },
  { id: 'import', label: 'Import Attendance', icon: ClipboardPaste },
  { id: 'schedule', label: 'Schedule', icon: CalendarClock },
  { id: 'order', label: 'Tracker Order', icon: ListOrdered },
  { id: 'manual', label: 'Manual Entry', icon: PencilLine },
  { id: 'clocking', label: 'Clocking Policy', icon: Wifi },
]

export default function AttendanceManagementWorkspace({ currentShiftDate }: { currentShiftDate: string }) {
  const [tab, setTab] = useState<Tab>('daily')
  return (
    <section>
      <div className="mb-6">
        <h1 className="font-hanken text-3xl font-bold text-on-surface">Attendance management</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Eastern shift dates, historical schedules, exceptions, and tracker-ready output in one workspace.</p>
      </div>
      <div className="mb-6 overflow-x-auto border-b border-outline-variant/40">
        <div className="flex min-w-max gap-1">{tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${tab === id ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}><Icon size={16} />{label}</button>
        ))}</div>
      </div>
      {tab === 'daily' && <TeamAttendanceListView currentShiftDate={currentShiftDate} />}
      {tab === 'calendars' && <ManagerAgentCalendarPanel currentShiftDate={currentShiftDate} />}
      {tab === 'import' && <AttendanceImportPanel currentShiftDate={currentShiftDate} />}
      {tab === 'schedule' && <ScheduleManagementPanel currentShiftDate={currentShiftDate} />}
      {tab === 'order' && <TrackerOrderPanel />}
      {tab === 'manual' && <ManualAttendancePanel currentShiftDate={currentShiftDate} />}
      {tab === 'clocking' && <ClockingPolicyPanel />}
    </section>
  )
}
