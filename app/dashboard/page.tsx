'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock, LogIn, LogOut, UserX, Users, Grid3x3, Table2 } from 'lucide-react'
import { useAuthStore } from '@/lib/authStore'
import { useRouter } from 'next/navigation'

type ScheduleAgent = {
  id: string
  name: string
  role: string
  dayOff1: string
  dayOff2: string
  startShift: string
  endShift: string
  break1: string
  lunch: string
  break2: string
  supervisor: string
}

type ScheduleResponse = {
  agents: ScheduleAgent[]
  supervisors: string[]
}

type AgentStatus = 'notLoggedIn' | 'loggedIn' | 'loggedOut' | 'off' | 'absent'

type BoardAgent = ScheduleAgent & {
  status: AgentStatus
  dayOffApplies: string
  scheduledStart: Date
  scheduledEnd: Date
}

type Lane = {
  key: AgentStatus
  title: string
  description: string
  icon: JSX.Element
  agents: BoardAgent[]
  color: {
    border: string
    header: string
    icon: string
    count: string
  }
}

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const fiveMinutes = 5 * 60 * 1000

const getPhilippineDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date)

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0)

  return new Date(
    getPart('year'),
    getPart('month') - 1,
    getPart('day'),
    getPart('hour'),
    getPart('minute'),
    getPart('second')
  )
}

const getCurrentShiftInfo = (date: Date) => {
  const phDate = getPhilippineDate(date)
  const shiftDate = new Date(phDate)

  if (phDate.getHours() < 19) {
    shiftDate.setDate(shiftDate.getDate() - 1)
  }

  const shiftDayIndex = shiftDate.getDay()
  const nextDayIndex = (shiftDayIndex + 1) % dayNames.length

  return {
    shiftDate,
    shiftDay: dayNames[shiftDayIndex],
    nextDay: dayNames[nextDayIndex],
    phDate,
  }
}

const getShiftStartMinutes = (time: string) => {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)

  if (!match) {
    return 0
  }

  const [, hourValue, minuteValue, meridiem] = match
  let hours = Number(hourValue) % 12

  if (meridiem.toUpperCase() === 'PM') {
    hours += 12
  }

  return hours * 60 + Number(minuteValue)
}

const getDayOffAppliedForCurrentShift = (agent: ScheduleAgent, shiftDay: string, nextDay: string) => {
  const startMinutes = getShiftStartMinutes(agent.startShift)
  return startMinutes >= 19 * 60 ? shiftDay : nextDay
}

const isAgentOffForCurrentShift = (agent: ScheduleAgent, shiftDay: string, nextDay: string) => {
  const dayToCheck = getDayOffAppliedForCurrentShift(agent, shiftDay, nextDay)
  const daysOff = [agent.dayOff1, agent.dayOff2].map((day) => day.trim().toLowerCase())

  return daysOff.includes(dayToCheck.toLowerCase())
}

const getScheduledDateTime = (shiftDate: Date, time: string) => {
  const minutes = getShiftStartMinutes(time)
  const scheduledDate = new Date(shiftDate)

  if (minutes < 19 * 60) {
    scheduledDate.setDate(scheduledDate.getDate() + 1)
  }

  scheduledDate.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return scheduledDate
}

const getAgentScheduleWindow = (agent: ScheduleAgent, shiftDate: Date) => {
  const scheduledStart = getScheduledDateTime(shiftDate, agent.startShift)
  const scheduledEnd = getScheduledDateTime(shiftDate, agent.endShift)

  if (scheduledEnd <= scheduledStart) {
    scheduledEnd.setDate(scheduledEnd.getDate() + 1)
  }

  return { scheduledStart, scheduledEnd }
}

const getAgentScheduleStatus = (agent: ScheduleAgent, shiftDate: Date, phDate: Date): AgentStatus => {
  const { scheduledStart, scheduledEnd } = getAgentScheduleWindow(agent, shiftDate)

  if (phDate < scheduledStart) {
    return 'notLoggedIn'
  }

  if (phDate >= scheduledEnd) {
    return 'loggedOut'
  }

  return 'loggedIn'
}

const getShiftKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`

const getMillisecondsUntilNextFiveMinuteMark = (date: Date) => {
  const phDate = getPhilippineDate(date)
  const next = new Date(phDate)
  const nextMinute = Math.ceil((phDate.getMinutes() + 1) / 5) * 5

  next.setMinutes(nextMinute, 0, 0)

  if (next <= phDate) {
    next.setMinutes(next.getMinutes() + 5)
  }

  return Math.max(next.getTime() - phDate.getTime(), 1000)
}

const formatShiftDate = (date: Date) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(date)

export default function DashboardPage() {
  const { user } = useAuthStore()
  const router = useRouter()

  // Redirect Agent role to /dashboard/agent
  useEffect(() => {
    if (user?.role === 'Agent') {
      router.replace('/dashboard/agent')
    }
  }, [user?.role, router])

  const [agents, setAgents] = useState<ScheduleAgent[]>([])
  const [supervisors, setSupervisors] = useState<string[]>([])
  const [selectedSupervisors, setSelectedSupervisors] = useState<string[]>([])
  const [absentAgentIds, setAbsentAgentIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => new Date())
  const [viewType, setViewType] = useState<'kanban' | 'table'>('kanban')

  const loadSchedule = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) {
        setIsLoading(true)
      }

      setError('')

      const response = await fetch('/api/schedule', { cache: 'no-store' })
      const data = (await response.json()) as Partial<ScheduleResponse> & { error?: string }

      if (!response.ok) {
        throw new Error(data.error || 'Unable to load schedule')
      }

      const nextAgents = data.agents || []
      const nextSupervisors = data.supervisors || []

      setAgents(nextAgents)
      setSupervisors(nextSupervisors)
      setSelectedSupervisors((current) => current.length > 0 ? current : nextSupervisors)
    } catch (loadError: any) {
      setError(loadError.message || 'Unable to load schedule')
    } finally {
      if (showLoading) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    loadSchedule(true)
  }, [loadSchedule])

  useEffect(() => {
    let interval: number | undefined

    const timeout = window.setTimeout(() => {
      setNow(new Date())
      loadSchedule()

      interval = window.setInterval(() => {
        setNow(new Date())
        loadSchedule()
      }, fiveMinutes)
    }, getMillisecondsUntilNextFiveMinuteMark(new Date()))

    return () => {
      window.clearTimeout(timeout)

      if (interval) {
        window.clearInterval(interval)
      }
    }
  }, [loadSchedule])

  const selectedAgents = useMemo(
    () => agents.filter((agent) => selectedSupervisors.includes(agent.supervisor)),
    [agents, selectedSupervisors]
  )

  const currentShift = useMemo(() => getCurrentShiftInfo(now), [now])
  const shiftKey = useMemo(() => getShiftKey(currentShift.shiftDate), [currentShift.shiftDate])

  useEffect(() => {
    const storedAbsences = window.localStorage.getItem(`dashboard-absent-${shiftKey}`)
    setAbsentAgentIds(storedAbsences ? JSON.parse(storedAbsences) : [])
  }, [shiftKey])

  const saveAbsentAgentIds = useCallback(
    (nextAbsentAgentIds: string[]) => {
      setAbsentAgentIds(nextAbsentAgentIds)
      window.localStorage.setItem(
        `dashboard-absent-${shiftKey}`,
        JSON.stringify(nextAbsentAgentIds)
      )
    },
    [shiftKey]
  )

  const handleAgentCardClick = useCallback(
    (agent: BoardAgent) => {
      if (agent.status === 'off') {
        return
      }

      if (agent.status === 'absent') {
        const shouldRemoveAbsent = window.confirm(
          `Remove ${agent.name} from Absent for this shift?`
        )

        if (shouldRemoveAbsent) {
          saveAbsentAgentIds(absentAgentIds.filter((agentId) => agentId !== agent.id))
        }

        return
      }

      const shouldMarkAbsent = window.confirm(
        `Mark ${agent.name} as absent for this shift?`
      )

      if (shouldMarkAbsent) {
        saveAbsentAgentIds(Array.from(new Set([...absentAgentIds, agent.id])))
      }
    },
    [absentAgentIds, saveAbsentAgentIds]
  )

  const boardAgents = useMemo(
    () =>
      selectedAgents.map((agent) => {
        const dayOffApplies = getDayOffAppliedForCurrentShift(
          agent,
          currentShift.shiftDay,
          currentShift.nextDay
        )
        const { scheduledStart, scheduledEnd } = getAgentScheduleWindow(
          agent,
          currentShift.shiftDate
        )

        if (absentAgentIds.includes(agent.id)) {
          return {
            ...agent,
            status: 'absent' as const,
            dayOffApplies,
            scheduledStart,
            scheduledEnd,
          }
        }

        if (isAgentOffForCurrentShift(agent, currentShift.shiftDay, currentShift.nextDay)) {
          return {
            ...agent,
            status: 'off' as const,
            dayOffApplies,
            scheduledStart,
            scheduledEnd,
          }
        }

        return {
          ...agent,
          status: getAgentScheduleStatus(agent, currentShift.shiftDate, currentShift.phDate),
          dayOffApplies,
          scheduledStart,
          scheduledEnd,
        }
      }),
    [
      currentShift.nextDay,
      currentShift.phDate,
      currentShift.shiftDay,
      currentShift.shiftDate,
      absentAgentIds,
      selectedAgents,
    ]
  )

  const lanes: Lane[] = [
    {
      key: 'notLoggedIn',
      title: 'Not logged in yet',
      description: 'Waiting for first login',
      icon: <Clock size={18} />,
      agents: boardAgents.filter((agent) => agent.status === 'notLoggedIn'),
      color: {
        border: 'border-slate-300',
        header: 'bg-slate-100/80',
        icon: 'bg-slate-200 text-slate-700',
        count: 'bg-slate-200 text-slate-800',
      },
    },
    {
      key: 'loggedIn',
      title: 'Logged in',
      description: 'Currently active',
      icon: <LogIn size={18} />,
      agents: boardAgents.filter((agent) => agent.status === 'loggedIn'),
      color: {
        border: 'border-emerald-300',
        header: 'bg-emerald-50',
        icon: 'bg-emerald-100 text-emerald-700',
        count: 'bg-emerald-100 text-emerald-800',
      },
    },
    {
      key: 'loggedOut',
      title: 'Logged out',
      description: 'Shift completed',
      icon: <LogOut size={18} />,
      agents: boardAgents.filter((agent) => agent.status === 'loggedOut'),
      color: {
        border: 'border-amber-300',
        header: 'bg-amber-50',
        icon: 'bg-amber-100 text-amber-700',
        count: 'bg-amber-100 text-amber-800',
      },
    },
    {
      key: 'off',
      title: 'Off',
      description: 'Scheduled day off',
      icon: <CalendarDays size={18} />,
      agents: boardAgents.filter((agent) => agent.status === 'off'),
      color: {
        border: 'border-sky-300',
        header: 'bg-sky-50',
        icon: 'bg-sky-100 text-sky-700',
        count: 'bg-sky-100 text-sky-800',
      },
    },
    {
      key: 'absent',
      title: 'Absent',
      description: 'Confirmed manually',
      icon: <UserX size={18} />,
      agents: boardAgents.filter((agent) => agent.status === 'absent'),
      color: {
        border: 'border-red-300',
        header: 'bg-red-50',
        icon: 'bg-red-100 text-red-700',
        count: 'bg-red-100 text-red-800',
      },
    },
  ]

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-label-md font-semibold uppercase text-primary-container">
            Team Attendance
          </p>
          <h1 className="font-hanken text-headline-lg font-bold text-on-surface">
            Daily agent status board
          </h1>
          <p className="mt-2 max-w-2xl text-on-surface-variant">
            View scheduled agents by team leader. Status is based only on schedule.csv and refreshes every 5-minute mark in PH time.
          </p>
        </div>

        <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-end sm:gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-label-md font-semibold text-on-surface">Team leaders</span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedSupervisors(supervisors)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  selectedSupervisors.length === supervisors.length
                    ? 'bg-primary-container text-on-primary-container'
                    : 'border border-outline-variant bg-surface text-on-surface hover:border-primary-container'
                }`}
                disabled={isLoading || supervisors.length === 0}
              >
                All
              </button>
              {supervisors.map((supervisor) => (
                <button
                  key={supervisor}
                  onClick={() => {
                    setSelectedSupervisors((current) =>
                      current.includes(supervisor)
                        ? current.filter((s) => s !== supervisor)
                        : [...current, supervisor]
                    )
                  }}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    selectedSupervisors.includes(supervisor)
                      ? 'bg-primary-container text-on-primary-container'
                      : 'border border-outline-variant bg-surface text-on-surface hover:border-primary-container'
                  }`}
                  disabled={isLoading}
                >
                  {supervisor}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewType('kanban')}
              className={`rounded-lg p-2 transition ${
                viewType === 'kanban'
                  ? 'bg-primary-container text-on-primary-container'
                  : 'border border-outline-variant text-on-surface hover:border-primary-container'
              }`}
              title="Kanban view"
            >
              <Grid3x3 size={20} />
            </button>
            <button
              onClick={() => setViewType('table')}
              className={`rounded-lg p-2 transition ${
                viewType === 'table'
                  ? 'bg-primary-container text-on-primary-container'
                  : 'border border-outline-variant text-on-surface hover:border-primary-container'
              }`}
              title="Table view"
            >
              <Table2 size={20} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-error">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="glass-effect rounded-lg p-5 backdrop-blur-glass-lg">
          <div className="flex items-center gap-3 text-on-surface-variant">
            <Users size={20} />
            <span className="text-label-md font-semibold uppercase">Agents</span>
          </div>
          <p className="mt-3 font-hanken text-headline-md font-bold text-on-surface">
            {boardAgents.length}
          </p>
        </div>
        <div className="glass-effect rounded-lg p-5 backdrop-blur-glass-lg">
          <div className="flex items-center gap-3 text-on-surface-variant">
            <CalendarDays size={20} />
            <span className="text-label-md font-semibold uppercase">Team Leaders</span>
          </div>
          <p className="mt-3 truncate font-hanken text-headline-md font-bold text-on-surface">
            {selectedSupervisors.length === 0
              ? 'None'
              : selectedSupervisors.length === supervisors.length
                ? 'All'
                : selectedSupervisors.join(', ')}
          </p>
        </div>
        <div className="glass-effect rounded-lg p-5 backdrop-blur-glass-lg">
          <div className="flex items-center gap-3 text-on-surface-variant">
            <Clock size={20} />
            <span className="text-label-md font-semibold uppercase">Current Shift</span>
          </div>
          <p className="mt-3 font-hanken text-headline-md font-bold text-on-surface">
            {formatShiftDate(currentShift.shiftDate)}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-outline-variant/60 bg-surface/70">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-outline-variant/40 border-t-primary-container" />
            <p className="text-on-surface-variant">Loading schedule...</p>
          </div>
        </div>
      ) : viewType === 'kanban' ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          {lanes.map((lane) => (
            <section
              key={lane.key}
              className={`flex min-h-[420px] flex-col rounded-lg border bg-surface/90 ${lane.color.border}`}
            >
              <div className={`border-b border-outline-variant/60 p-4 ${lane.color.header}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${lane.color.icon}`}>
                      {lane.icon}
                    </div>
                    <div>
                      <h2 className="font-hanken text-body-md font-bold text-on-surface">
                        {lane.title}
                      </h2>
                      <p className="text-sm text-on-surface-variant">{lane.description}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-label-md font-bold ${lane.color.count}`}>
                    {lane.agents.length}
                  </span>
                </div>
              </div>

              <div className="flex-1 space-y-3 p-3">
                {lane.agents.length > 0 ? (
                  lane.agents.map((agent) => (
                    <article
                      key={agent.id}
                      onClick={() => handleAgentCardClick(agent)}
                      className={`rounded-lg border border-outline-variant/60 bg-white p-4 shadow-sm transition ${
                        agent.status === 'off'
                          ? 'cursor-default'
                          : 'cursor-pointer hover:border-primary-container/70 hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold text-on-surface">{agent.name}</h3>
                        <span className="shrink-0 rounded-full bg-indigo-100 px-2.5 py-1 text-label-sm font-semibold text-indigo-700">
                          {agent.role}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-label-sm font-semibold text-emerald-700">
                          Shift In {agent.startShift}
                        </span>
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-label-sm font-semibold text-amber-700">
                          Shift Out {agent.endShift}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-label-sm font-semibold text-slate-700">
                          Off {agent.dayOff1}, {agent.dayOff2}
                        </span>
                        {agent.status === 'off' && (
                          <span className="rounded-full bg-sky-100 px-3 py-1 text-label-sm font-semibold text-sky-700">
                            Off applies {agent.dayOffApplies}
                          </span>
                        )}
                        {agent.status === 'absent' && (
                          <span className="rounded-full bg-red-100 px-3 py-1 text-label-sm font-semibold text-red-700">
                            Confirmed absent
                          </span>
                        )}
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">
                    No agents in this status
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-outline-variant/60 bg-surface">
          <table className="w-full">
            <thead>
              <tr className="border-b border-outline-variant/60 bg-surface-variant/40">
                <th className="px-6 py-3 text-left text-label-md font-semibold text-on-surface">
                  Agent Name
                </th>
                <th className="px-6 py-3 text-left text-label-md font-semibold text-on-surface">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-label-md font-semibold text-on-surface">
                  Team Leader
                </th>
                <th className="px-6 py-3 text-left text-label-md font-semibold text-on-surface">
                  Shift In
                </th>
                <th className="px-6 py-3 text-left text-label-md font-semibold text-on-surface">
                  Shift Out
                </th>
                <th className="px-6 py-3 text-left text-label-md font-semibold text-on-surface">
                  Days Off
                </th>
                <th className="px-6 py-3 text-left text-label-md font-semibold text-on-surface">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-label-md font-semibold text-on-surface">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {boardAgents.length > 0 ? (
                boardAgents.map((agent) => {
                  const statusColors = {
                    notLoggedIn: 'bg-slate-100 text-slate-700',
                    loggedIn: 'bg-emerald-100 text-emerald-700',
                    loggedOut: 'bg-amber-100 text-amber-700',
                    off: 'bg-sky-100 text-sky-700',
                    absent: 'bg-red-100 text-red-700',
                  }

                  return (
                    <tr
                      key={agent.id}
                      className="border-b border-outline-variant/30 hover:bg-surface-variant/40 transition"
                    >
                      <td className="px-6 py-4">
                        <p className="font-semibold text-on-surface">{agent.name}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-label-sm font-semibold text-indigo-700">
                          {agent.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-on-surface">{agent.supervisor}</td>
                      <td className="px-6 py-4 text-on-surface">{agent.startShift}</td>
                      <td className="px-6 py-4 text-on-surface">{agent.endShift}</td>
                      <td className="px-6 py-4 text-on-surface">
                        {agent.dayOff1}, {agent.dayOff2}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-label-sm font-semibold ${
                            statusColors[agent.status]
                          }`}
                        >
                          {agent.status === 'notLoggedIn'
                            ? 'Not Logged In'
                            : agent.status === 'loggedIn'
                              ? 'Logged In'
                              : agent.status === 'loggedOut'
                                ? 'Logged Out'
                                : agent.status === 'off'
                                  ? 'Off'
                                  : 'Absent'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleAgentCardClick(agent)}
                          className={`rounded-lg px-3 py-1 text-sm font-semibold transition ${
                            agent.status === 'off'
                              ? 'cursor-default opacity-50'
                              : agent.status === 'absent'
                                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                          disabled={agent.status === 'off'}
                        >
                          {agent.status === 'absent' ? 'Remove' : 'Mark'}
                        </button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-on-surface-variant">
                    No agents to display
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}