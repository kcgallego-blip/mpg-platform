'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Search,
  Upload,
  X,
} from 'lucide-react'
import Navigation from '@/components/Navigation'
import { useAuthStore } from '@/lib/authStore'

type SurveyRow = {
  survey_date: string | null
  response_id: string
  agent: string
  csat: 'Unsatisfied' | 'Neutral' | 'Satisfied'
  mod_comment: string | null
  open_comment: string | null
  created_at: string
}

type PeriodOption = {
  value: string
  label: string
}

type Notification = {
  type: 'success' | 'error'
  title: string
  message: string
  details?: string
}

const CSAT_GROUPS = [
  { value: 'Unsatisfied' as const, title: 'Unsatisfied', emoji: '😡', accent: 'border-red-200 bg-red-50/70' },
  { value: 'Neutral' as const, title: 'Neutral', emoji: '😐', accent: 'border-amber-200 bg-amber-50/70' },
  { value: 'Satisfied' as const, title: 'Satisfied', emoji: '😊', accent: 'border-emerald-200 bg-emerald-50/70' },
]
const TABLE_PAGE_SIZE = 50

const formatSurveyDate = (value: string | null) => {
  if (!value) return 'No date'

  try {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return value
  }
}

const getActiveComment = (row: SurveyRow) => {
  const modComment = row.mod_comment?.trim()
  const openComment = row.open_comment?.trim()
  return modComment || openComment || ''
}

function SurveyCarousel({
  title,
  emoji,
  accent,
  rows,
}: {
  title: string
  emoji: string
  accent: string
  rows: SurveyRow[]
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  const scrollBy = (direction: 'left' | 'right') => {
    scrollerRef.current?.scrollBy({
      left: direction === 'left' ? -360 : 360,
      behavior: 'smooth',
    })
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-4xl leading-none" aria-hidden="true">{emoji}</span>
          <div>
            <h2 className="font-hanken text-headline-md font-bold text-on-surface">{title}</h2>
            <p className="text-sm text-on-surface-variant">{rows.length} entries</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scrollBy('left')}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-outline bg-surface text-on-surface transition hover:bg-surface-dim"
            aria-label={`Scroll ${title} left`}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={() => scrollBy('right')}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-outline bg-surface text-on-surface transition hover:bg-surface-dim"
            aria-label={`Scroll ${title} right`}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-outline-variant/60 bg-surface/70 p-8 text-center text-on-surface-variant">
          No entries in this category.
        </div>
      ) : (
        <div
          ref={scrollerRef}
          className="scrollbar-hidden flex snap-x gap-4 overflow-x-auto pb-2"
        >
          {rows.map(row => {
            const comment = getActiveComment(row)

            return (
              <article
                key={`${row.agent}-${row.response_id}`}
                className={`min-h-[220px] w-[min(22rem,86vw)] flex-shrink-0 snap-start rounded-lg border p-5 shadow-sm ${accent}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-on-surface">{formatSurveyDate(row.survey_date)}</p>
                    <p className="mt-1 font-mono text-sm text-on-surface-variant">ID {row.response_id}</p>
                  </div>
                  <span className="text-5xl leading-none" aria-label={title}>{emoji}</span>
                </div>

                {comment && (
                  <div className="relative mt-6 rounded-lg border border-outline-variant/50 bg-surface p-4 text-sm leading-6 text-on-surface shadow-sm">
                    <span className="absolute -top-2 right-8 h-4 w-4 rotate-45 border-l border-t border-outline-variant/50 bg-surface" />
                    <p className="relative whitespace-pre-wrap break-words">{comment}</p>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default function SurveyPage() {
  const router = useRouter()
  const { user, loading, checkAuth, rehydrateFromStorage } = useAuthStore()
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [survey, setSurvey] = useState<SurveyRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')
  const [notification, setNotification] = useState<Notification | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [userRole, setUserRole] = useState<string | null>(null)
  const [periodType, setPeriodType] = useState<'weekly' | 'monthly'>('weekly')
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [periodOptions, setPeriodOptions] = useState<{
    weekly: PeriodOption[]
    monthly: PeriodOption[]
  }>({ weekly: [], monthly: [] })
  const [tablePage, setTablePage] = useState(1)

  const isAgentView = userRole?.toLowerCase() === 'agent'
  const canUpload = ['admin', 'manager', 'operations manager', 'team leader', 'supervisor'].includes(userRole?.toLowerCase() || '')

  const showNotification = useCallback((type: 'success' | 'error', title: string, message: string, details?: string) => {
    setNotification({ type, title, message, details })
  }, [])

  const loadSurvey = useCallback(async () => {
    try {
      setIsLoading(true)
      setError('')

      const queryParams = new URLSearchParams({ periodType })
      if (selectedPeriod) {
        queryParams.set('period', selectedPeriod)
      }

      const response = await fetch(`/api/survey?${queryParams}`)

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login')
          return
        }
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to fetch survey data')
      }

      const data = await response.json()
      setSurvey(data.survey || [])
      setUserRole(data.userRole)
      setPeriodOptions(data.periodOptions || { weekly: [], monthly: [] })
      if (data.periodType === 'monthly' || data.periodType === 'weekly') {
        setPeriodType(data.periodType)
      }
      if (data.periodValue !== selectedPeriod) {
        setSelectedPeriod(data.periodValue || '')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load survey data')
      console.error('Survey error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [periodType, selectedPeriod, router])

  useEffect(() => {
    const initAuth = async () => {
      rehydrateFromStorage()
      await checkAuth()
      setIsCheckingAuth(false)
    }

    initAuth()
  }, [checkAuth, rehydrateFromStorage])

  useEffect(() => {
    if (!isCheckingAuth && !user) {
      router.push('/login')
    }
  }, [user, isCheckingAuth, router])

  useEffect(() => {
    if (user) {
      loadSurvey()
    }
  }, [user, loadSurvey])

  useEffect(() => {
    if (!notification) return

    const timer = window.setTimeout(() => setNotification(null), 6000)
    return () => window.clearTimeout(timer)
  }, [notification])

  useEffect(() => {
    setTablePage(1)
  }, [searchQuery])

  const filteredSurvey = useMemo(() => {
    if (!searchQuery.trim()) return survey
    const query = searchQuery.toLowerCase()

    return survey.filter(row =>
      row.response_id.toLowerCase().includes(query) ||
      row.agent.toLowerCase().includes(query) ||
      row.csat.toLowerCase().includes(query) ||
      (row.mod_comment || '').toLowerCase().includes(query) ||
      (row.open_comment || '').toLowerCase().includes(query)
    )
  }, [survey, searchQuery])

  const groupedSurvey = useMemo(() => {
    return CSAT_GROUPS.map(group => ({
      ...group,
      rows: survey.filter(row => row.csat === group.value),
    }))
  }, [survey])

  const totalTablePages = Math.max(1, Math.ceil(filteredSurvey.length / TABLE_PAGE_SIZE))
  const safeTablePage = Math.min(tablePage, totalTablePages)
  const paginatedSurvey = filteredSurvey.slice(
    (safeTablePage - 1) * TABLE_PAGE_SIZE,
    safeTablePage * TABLE_PAGE_SIZE
  )
  const firstTableRow = filteredSurvey.length === 0 ? 0 : (safeTablePage - 1) * TABLE_PAGE_SIZE + 1
  const lastTableRow = Math.min(safeTablePage * TABLE_PAGE_SIZE, filteredSurvey.length)

  const activePeriodOptions = periodType === 'monthly'
    ? periodOptions.monthly
    : periodOptions.weekly
  const selectedPeriodLabel = activePeriodOptions.find(option => option.value === selectedPeriod)?.label || 'No period available'

  const handleDrag = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragActive(event.type === 'dragenter' || event.type === 'dragover')
  }

  const selectFile = (selectedFile: File) => {
    const fileName = selectedFile.name.toLowerCase()

    if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx')) {
      showNotification('error', 'Upload required', 'Please upload a CSV or XLSX file')
      return
    }

    setFile(selectedFile)
    setNotification(null)
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragActive(false)

    const selectedFile = event.dataTransfer.files?.[0]
    if (selectedFile) {
      selectFile(selectedFile)
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      selectFile(selectedFile)
    }
  }

  const handleUpload = async () => {
    if (!file) {
      showNotification('error', 'Upload required', 'Please select a survey file first')
      return
    }

    try {
      setIsUploading(true)
      setNotification(null)

      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/survey/import', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to import survey data')
      }

      const details = [
        `Imported ${result.imported ?? 0} rows`,
        `Skipped ${result.duplicatesSkipped ?? 0} duplicates`,
        `Skipped ${result.skippedSatisfiedWithoutMod ?? 0} satisfied rows without MOD Comment`,
        `Skipped ${result.skippedInvalid ?? 0} invalid rows`,
        result.eligibleDateRange
          ? `Eligible dates ${result.eligibleDateRange.earliest} to ${result.eligibleDateRange.latest}`
          : 'No eligible dates found',
        result.importedDateRange
          ? `Inserted dates ${result.importedDateRange.earliest} to ${result.importedDateRange.latest}`
          : 'No new dates inserted',
      ].join(' - ')

      showNotification('success', 'Upload complete', result.message || 'Survey data imported', details)
      setFile(null)
      await loadSurvey()
    } catch (err: any) {
      showNotification('error', 'Upload failed', err.message || 'Failed to upload survey data')
      console.error('Survey upload error:', err)
    } finally {
      setIsUploading(false)
    }
  }

  if (isCheckingAuth || loading || (user && isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 size={48} className="mx-auto mb-4 animate-spin text-primary-container" />
          <p className="text-on-surface-variant">Loading survey...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen relative">
      <Navigation />
      <main className="ml-64 pt-8 px-gutter max-w-container">
        <div className="space-y-6 pb-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-label-md font-semibold uppercase text-primary-container">Survey</p>
              <h1 className="font-hanken text-headline-lg font-bold text-on-surface">
                Customer Survey Feedback
              </h1>
              <p className="mt-2 max-w-3xl text-on-surface-variant">
                Review CSAT survey feedback with access scoped by role.
              </p>
            </div>
          </div>

          {notification && (
            <div className={`pointer-events-auto fixed right-4 top-4 z-50 max-w-md rounded-xl border p-4 shadow-lg backdrop-blur-sm ${notification.type === 'success' ? 'border-success/30 bg-success/10' : 'border-error/30 bg-error/10'}`}>
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 rounded-full p-2 ${notification.type === 'success' ? 'bg-success/15' : 'bg-error/15'}`}>
                  {notification.type === 'success' ? (
                    <CheckCircle size={18} className="text-success" />
                  ) : (
                    <AlertCircle size={18} className="text-error" />
                  )}
                </div>
                <div className="flex-1">
                  <p className={`font-semibold ${notification.type === 'success' ? 'text-success' : 'text-error'}`}>
                    {notification.title}
                  </p>
                  <p className={`mt-1 text-sm ${notification.type === 'success' ? 'text-success/80' : 'text-error/80'}`}>
                    {notification.message}
                  </p>
                  {notification.details && (
                    <p className={`mt-2 text-sm ${notification.type === 'success' ? 'text-success/80' : 'text-error/80'}`}>
                      {notification.details}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setNotification(null)}
                  className={`rounded-full p-1 transition hover:opacity-80 ${notification.type === 'success' ? 'text-success/80' : 'text-error/80'}`}
                  aria-label="Dismiss notification"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="flex gap-3 rounded-lg border border-error/30 bg-error/10 p-4">
              <AlertCircle size={20} className="mt-0.5 flex-shrink-0 text-error" />
              <div>
                <p className="font-medium text-error">Error</p>
                <p className="text-sm text-error/80">{error}</p>
              </div>
            </div>
          )}

          {!isAgentView && canUpload && (
            <section className="rounded-lg border-2 border-dashed border-outline-variant bg-surface-dim p-6">
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`rounded-lg border p-8 text-center transition ${isDragActive ? 'border-primary bg-primary/5' : 'border-transparent'}`}
              >
                {!file ? (
                  <>
                    <div className="mb-4 flex justify-center">
                      <div className="rounded-full bg-primary-container/20 p-4">
                        <Upload size={32} className="text-primary-container" />
                      </div>
                    </div>
                    <h2 className="mb-2 text-lg font-semibold text-on-surface">
                      {isDragActive ? 'Drop your survey file here' : 'Drag and drop your survey file'}
                    </h2>
                    <p className="mb-4 text-on-surface-variant">
                      CSV and XLSX files are accepted.
                    </p>
                    <label>
                      <input
                        type="file"
                        accept=".csv,.xlsx"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <span className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary-container px-6 py-2 font-medium text-on-primary-container transition hover:opacity-90">
                        <FileText size={18} />
                        Select File
                      </span>
                    </label>
                  </>
                ) : (
                  <>
                    <div className="mb-4 flex justify-center">
                      <div className="rounded-full bg-success/20 p-4">
                        <FileText size={32} className="text-success" />
                      </div>
                    </div>
                    <h2 className="mb-2 text-lg font-semibold text-on-surface">File Selected</h2>
                    <p className="mb-4 break-all text-on-surface-variant">{file.name}</p>
                    <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                      <button
                        type="button"
                        onClick={handleUpload}
                        disabled={isUploading}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-success px-6 py-2 font-medium text-on-success transition hover:opacity-90 disabled:opacity-50"
                      >
                        {isUploading && <Loader2 size={18} className="animate-spin" />}
                        {isUploading ? 'Uploading...' : 'Upload Survey'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFile(null)
                          setNotification(null)
                        }}
                        disabled={isUploading}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-outline bg-surface px-6 py-2 font-medium text-on-surface transition hover:bg-surface-dim disabled:opacity-50"
                      >
                        <X size={18} />
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          {isAgentView ? (
            <div className="space-y-8">
              <div className="rounded-lg border border-outline-variant/60 bg-surface-dim p-5">
                <div className="grid gap-4 md:grid-cols-[auto,1fr] md:items-end">
                  <div>
                    <p className="mb-2 block text-sm font-medium text-on-surface">Timeframe</p>
                    <div className="inline-flex rounded-full border border-outline-variant bg-surface p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setPeriodType('weekly')
                          setSelectedPeriod('')
                        }}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${periodType === 'weekly' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant'}`}
                      >
                        Weekly
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPeriodType('monthly')
                          setSelectedPeriod('')
                        }}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${periodType === 'monthly' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant'}`}
                      >
                        Monthly
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="surveyPeriod" className="mb-2 block text-sm font-medium text-on-surface">
                      {periodType === 'monthly' ? 'Month' : 'Week'}
                    </label>
                    <select
                      id="surveyPeriod"
                      value={selectedPeriod}
                      onChange={event => setSelectedPeriod(event.target.value)}
                      disabled={activePeriodOptions.length === 0}
                      className="w-full rounded-lg border border-outline bg-surface px-4 py-2.5 text-on-surface outline-none transition focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
                    >
                      {activePeriodOptions.length === 0 ? (
                        <option value="">No uploaded survey dates available</option>
                      ) : (
                        activePeriodOptions.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))
                      )}
                    </select>
                    <p className="mt-2 text-sm text-on-surface-variant">
                      Showing {selectedPeriodLabel}. Options are based on uploaded survey dates only.
                    </p>
                  </div>
                </div>
              </div>

              {groupedSurvey.map(group => (
                <SurveyCarousel
                  key={group.value}
                  title={group.title}
                  emoji={group.emoji}
                  accent={group.accent}
                  rows={group.rows}
                />
              ))}
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex-1">
                  <label htmlFor="surveySearch" className="mb-2 block text-sm font-medium text-on-surface">
                    Search Survey
                  </label>
                  <div className="relative">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                    <input
                      id="surveySearch"
                      type="text"
                      placeholder="Search by ID, agent, CSAT, or comment..."
                      value={searchQuery}
                      onChange={event => setSearchQuery(event.target.value)}
                      className="w-full rounded-lg border border-outline bg-surface py-2.5 pl-10 pr-4 text-on-surface outline-none transition placeholder:text-on-surface-variant focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>

              {filteredSurvey.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-outline-variant/60 bg-surface/70 py-16">
                  <AlertCircle size={40} className="mb-4 text-on-surface-variant/40" />
                  <p className="text-on-surface-variant">
                    {searchQuery ? `No survey rows found matching "${searchQuery}".` : 'No survey rows available.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-col gap-3 rounded-lg border border-outline-variant/60 bg-surface-dim p-4 text-sm text-on-surface-variant sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      Showing {firstTableRow}-{lastTableRow} of {filteredSurvey.length} rows
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTablePage(page => Math.max(1, page - 1))}
                        disabled={safeTablePage === 1}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-outline bg-surface text-on-surface transition hover:bg-surface-dim disabled:opacity-50"
                        aria-label="Previous survey table page"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <span className="px-2 font-medium text-on-surface">
                        Page {safeTablePage} of {totalTablePages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTablePage(page => Math.min(totalTablePages, page + 1))}
                        disabled={safeTablePage === totalTablePages}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-outline bg-surface text-on-surface transition hover:bg-surface-dim disabled:opacity-50"
                        aria-label="Next survey table page"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-outline-variant/60 bg-surface">
                    <table className="w-full border-collapse">
                      <thead className="border-b border-outline-variant/60 bg-surface-dim">
                        <tr>
                          {['Date', 'ID', 'Agent', 'CSAT', 'MOD Comment', 'Open Comment'].map(label => (
                            <th key={label} className="whitespace-nowrap px-4 py-3 text-left font-semibold text-on-surface">
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedSurvey.map((row, index) => (
                          <tr
                            key={`${row.agent}-${row.response_id}`}
                            className={`border-b border-outline-variant/30 transition hover:bg-surface-dim ${index % 2 === 0 ? 'bg-surface' : 'bg-surface/50'}`}
                          >
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-on-surface">{formatSurveyDate(row.survey_date)}</td>
                            <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-on-surface">{row.response_id}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-on-surface">{row.agent}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-on-surface">{row.csat}</td>
                            <td className="min-w-72 px-4 py-3 text-sm text-on-surface">
                              <span className="whitespace-pre-wrap break-words">{row.mod_comment || ''}</span>
                            </td>
                            <td className="min-w-72 px-4 py-3 text-sm text-on-surface">
                              <span className="whitespace-pre-wrap break-words">{row.open_comment || ''}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
