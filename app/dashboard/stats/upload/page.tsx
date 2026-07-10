'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/lib/authStore'
import {
  formatStatsDate,
  getStatsMonthOptions,
  getStatsPeriodLabel,
  getStatsRangeFromDate,
  getStatsWeekDateOptions,
  getStatsWeekNumber,
  getStatsWeekRange,
  getStatsWeekRangeDates,
  getStatsWeekRangeLabel,
} from '@/lib/statsUtils'
import {
  Upload,
  AlertCircle,
  CheckCircle,
  Loader2,
  FileText,
  X,
} from 'lucide-react'

export default function StatsUploadPage() {
  const { user } = useAuthStore()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const [uploadResult, setUploadResult] = useState<{
    imported: number
    failed: number
    message: string
  } | null>(null)
  const [selectedWeek, setSelectedWeek] = useState(() => getStatsWeekNumber())
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1)
  const [periodType, setPeriodType] = useState<'weekly' | 'monthly'>('weekly')
  const [selectedEndDate, setSelectedEndDate] = useState(() =>
    formatStatsDate(getStatsWeekRangeDates(getStatsWeekNumber(), getStatsWeekRange()).endDate)
  )
  const selectedRange = useMemo(
    () => getStatsRangeFromDate(selectedWeek, selectedEndDate),
    [selectedWeek, selectedEndDate]
  )
  const selectedDateRange = useMemo(
    () => getStatsPeriodLabel(periodType, periodType === 'monthly' ? selectedMonth : selectedWeek),
    [periodType, selectedMonth, selectedWeek]
  )
  const weekDateOptions = useMemo(() => getStatsWeekDateOptions(selectedWeek), [selectedWeek])
  const periodOptions = useMemo(() => getStatsMonthOptions(), [])
  const weekStart = useMemo(() => getStatsWeekRangeDates(selectedWeek, 1).startDate, [selectedWeek])
  const weekEnd = useMemo(() => getStatsWeekRangeDates(selectedWeek, 7).endDate, [selectedWeek])

  useEffect(() => {
    if (!weekDateOptions.includes(selectedEndDate)) {
      setSelectedEndDate(weekDateOptions[weekDateOptions.length - 1])
    }
  }, [selectedWeek, selectedEndDate, weekDateOptions])

  // Check authorization
  const userRole = user?.role?.toLowerCase()
  const isAuthorized =
    userRole === 'admin' ||
    userRole === 'manager' ||
    userRole === 'team leader' ||
    userRole === 'supervisor'

  if (!isAuthorized) {
    return (
      <div className="space-y-6 pb-8">
        <div className="flex gap-3 rounded-lg border border-error/30 bg-error/10 p-4">
          <AlertCircle size={20} className="mt-0.5 flex-shrink-0 text-error" />
          <div>
            <p className="font-medium text-error">Access Denied</p>
            <p className="text-sm text-error/80">
              Only Team Leaders, Supervisors, Managers, and Admins can upload stats data.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true)
    } else if (e.type === 'dragleave') {
      setIsDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)

    const files = e.dataTransfer.files
    if (files && files[0]) {
      const droppedFile = files[0]
      if (droppedFile.name.endsWith('.csv')) {
        setFile(droppedFile)
        setError('')
      } else {
        setError('Please upload a CSV file')
      }
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setError('')
    }
  }

  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Please select a file first')
      return
    }

    if (periodType === 'weekly' && (!Number.isInteger(selectedWeek) || selectedWeek < 1)) {
      setError('Please select a valid stats week')
      return
    }

    if (periodType === 'monthly' && (!Number.isInteger(selectedMonth) || selectedMonth < 1 || selectedMonth > 12)) {
      setError('Please select a valid stats month')
      return
    }

    if (periodType === 'weekly' && (!Number.isInteger(selectedRange) || selectedRange < 1 || selectedRange > 7)) {
      setError('Please select a valid stats range end date')
      return
    }

    try {
      setIsLoading(true)
      setError('')
      setSuccess('')

      // Read file content
      const csvContent = await file.text()

      // Call import API
      const response = await fetch('/api/stats/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvContent,
          periodType,
          week: selectedWeek,
          month: selectedMonth,
          range: selectedRange,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to import stats')
      }

      const result = await response.json()
      setUploadResult({
        imported: result.imported,
        failed: result.failed,
        message: result.message,
      })
      setSuccess(result.message)
      setFile(null)
    } catch (err: any) {
      setError(err.message || 'Failed to upload file')
      console.error('Upload error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [file, periodType, selectedMonth, selectedWeek, selectedRange])

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <p className="text-label-md font-semibold uppercase text-primary-container">
          Stats Management
        </p>
        <h1 className="font-hanken text-headline-lg font-bold text-on-surface">
          Upload Stats Data
        </h1>
        <p className="mt-2 max-w-3xl text-on-surface-variant">
          Import agent performance metrics from a CSV file. The file must include a Name column. If Supervisor is missing, the uploader is used as the team leader.
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex gap-3 rounded-lg border border-error/30 bg-error/10 p-4">
          <AlertCircle size={20} className="mt-0.5 flex-shrink-0 text-error" />
          <div>
            <p className="font-medium text-error">Error</p>
            <p className="text-sm text-error/80">{error}</p>
          </div>
        </div>
      )}

      {/* Success Alert */}
      {success && (
        <div className="flex gap-3 rounded-lg border border-success/30 bg-success/10 p-4">
          <CheckCircle size={20} className="mt-0.5 flex-shrink-0 text-success" />
          <div>
            <p className="font-medium text-success">Success</p>
            <p className="text-sm text-success/80">{success}</p>
            {uploadResult && (
              <div className="mt-2 space-y-1 text-sm">
                <p>✓ Imported: <span className="font-medium">{uploadResult.imported} records</span></p>
                {uploadResult.failed > 0 && (
                  <p>✗ Failed: <span className="font-medium text-error">{uploadResult.failed} records</span></p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import Period */}
      <div className="rounded-lg border border-outline-variant/60 bg-surface-dim p-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h3 className="font-semibold text-on-surface">Import Period</h3>
          <div className="inline-flex rounded-full border border-outline-variant bg-surface p-1">
            <button
              type="button"
              onClick={() => setPeriodType('weekly')}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${periodType === 'weekly' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant'}`}
            >
              Weekly
            </button>
            <button
              type="button"
              onClick={() => setPeriodType('monthly')}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${periodType === 'monthly' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant'}`}
            >
              Monthly
            </button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="statsPeriod" className="mb-2 block text-sm font-medium text-on-surface">
              {periodType === 'monthly' ? 'Month' : 'Week'}
            </label>
            {periodType === 'monthly' ? (
              <select
                id="statsPeriod"
                value={selectedMonth}
                onChange={e => setSelectedMonth(Number(e.target.value))}
                className="w-full rounded-lg border border-outline bg-surface px-4 py-2.5 text-on-surface outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {periodOptions.map(month => (
                  <option key={month} value={month}>
                    {new Intl.DateTimeFormat('en-PH', { month: 'long' }).format(new Date(new Date().getFullYear(), month - 1, 1))}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="statsPeriod"
                type="number"
                min="1"
                value={selectedWeek}
                onChange={e => setSelectedWeek(Number(e.target.value))}
                className="w-full rounded-lg border border-outline bg-surface px-4 py-2.5 text-on-surface outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
              />
            )}
          </div>

          {periodType === 'weekly' && (
            <div>
              <label htmlFor="statsRangeEndDate" className="mb-2 block text-sm font-medium text-on-surface">
                Range End Date
              </label>
              <select
                id="statsRangeEndDate"
                value={selectedEndDate}
                onChange={e => setSelectedEndDate(e.target.value)}
                className="w-full rounded-lg border border-outline bg-surface px-4 py-2.5 text-on-surface outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {weekDateOptions.map(date => {
                  const parsedDate = new Date(`${date}T00:00:00`)
                  const label = new Intl.DateTimeFormat('en-PH', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  }).format(parsedDate)
                  const isWeekStart = date === formatStatsDate(weekStart)
                  const isWeekEnd = date === formatStatsDate(weekEnd)
                  return (
                    <option key={date} value={date}>
                      {label}{isWeekStart ? ' (week start)' : ''}{isWeekEnd ? ' (week end)' : ''}
                    </option>
                  )
                })}
              </select>
            </div>
          )}

          <div>
            <p className="mb-2 block text-sm font-medium text-on-surface">Selected Import Range</p>
            <div className="rounded-lg bg-surface px-4 py-2.5 text-on-surface">
              {periodType === 'monthly' ? `${new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' }).format(new Date(new Date().getFullYear(), selectedMonth - 1, 1))}` : `Week ${selectedWeek}`} • {selectedDateRange}
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm text-on-surface-variant">
          {periodType === 'monthly'
            ? 'Monthly imports follow the same CSV format as weekly uploads and overwrite the selected month.'
            : 'Weeks start on Sunday. Importing an existing week overwrites all stats for that week.'}
        </p>
      </div>

      {/* File Upload Area */}
      <div className="rounded-lg border-2 border-dashed border-outline-variant bg-surface-dim p-8 transition">
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`cursor-pointer rounded-lg p-8 text-center transition ${
            isDragActive
              ? 'border border-primary bg-primary/5'
              : 'border border-transparent'
          }`}
        >
          {!file ? (
            <>
              <div className="mb-4 flex justify-center">
                <div className="rounded-full bg-primary-container/20 p-4">
                  <Upload size={32} className="text-primary-container" />
                </div>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-on-surface">
                {isDragActive ? 'Drop your file here' : 'Drag and drop your CSV file'}
              </h3>
              <p className="mb-4 text-on-surface-variant">
                or click to select a file from your computer
              </p>
              <label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <span className="inline-block rounded-lg bg-primary-container px-6 py-2 font-medium text-on-primary-container transition hover:opacity-90">
                  Select File
                </span>
              </label>
              <p className="mt-4 text-sm text-on-surface-variant">
                Accepted format: CSV (.csv)
              </p>
            </>
          ) : (
            <>
              <div className="mb-4 flex justify-center">
                <div className="rounded-full bg-success/20 p-4">
                  <FileText size={32} className="text-success" />
                </div>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-on-surface">
                File Selected
              </h3>
              <p className="mb-4 text-on-surface-variant break-all">{file.name}</p>
              <p className="mb-6 text-sm text-on-surface-variant">
                {(file.size / 1024).toFixed(2)} KB
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <button
                  onClick={handleUpload}
                  disabled={isLoading}
                  className="flex items-center justify-center gap-2 rounded-lg bg-success px-6 py-2 font-medium text-on-success transition hover:opacity-90 disabled:opacity-50"
                >
                  {isLoading && <Loader2 size={18} className="animate-spin" />}
                  {isLoading ? 'Uploading...' : 'Upload File'}
                </button>
                <button
                  onClick={() => {
                    setFile(null)
                    setSuccess('')
                    setUploadResult(null)
                  }}
                  disabled={isLoading}
                  className="flex items-center justify-center gap-2 rounded-lg border border-outline bg-surface px-6 py-2 font-medium text-on-surface transition hover:bg-surface-dim disabled:opacity-50"
                >
                  <X size={18} />
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* CSV Format Info */}
      <div className="space-y-4 rounded-lg border border-outline-variant/60 bg-surface-dim p-6">
        <h3 className="font-semibold text-on-surface">CSV Format Requirements</h3>
        <p className="text-sm text-on-surface-variant">
          Your CSV file must include the following columns in this exact order:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/60">
                <th className="px-4 py-2 text-left font-medium text-on-surface">Column Header</th>
                <th className="px-4 py-2 text-left font-medium text-on-surface">Format</th>
                <th className="px-4 py-2 text-left font-medium text-on-surface">Example</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-outline-variant/30">
                <td className="px-4 py-2 text-on-surface">Supervisor</td>
                <td className="px-4 py-2 text-on-surface-variant">Text, optional</td>
                <td className="px-4 py-2 font-mono text-on-surface">Charlene Esparza</td>
              </tr>
              <tr className="border-b border-outline-variant/30">
                <td className="px-4 py-2 text-on-surface">Name</td>
                <td className="px-4 py-2 text-on-surface-variant">Text</td>
                <td className="px-4 py-2 font-mono text-on-surface">John Smith</td>
              </tr>
              <tr className="border-b border-outline-variant/30">
                <td className="px-4 py-2 text-on-surface">ACW</td>
                <td className="px-4 py-2 text-on-surface-variant">MM:SS</td>
                <td className="px-4 py-2 font-mono text-on-surface">01:32</td>
              </tr>
              <tr className="border-b border-outline-variant/30">
                <td className="px-4 py-2 text-on-surface">AHT</td>
                <td className="px-4 py-2 text-on-surface-variant">MM:SS</td>
                <td className="px-4 py-2 font-mono text-on-surface">08:29</td>
              </tr>
              <tr className="border-b border-outline-variant/30">
                <td className="px-4 py-2 text-on-surface">CSAT_Score</td>
                <td className="px-4 py-2 text-on-surface-variant">Percentage</td>
                <td className="px-4 py-2 font-mono text-on-surface">87.50%</td>
              </tr>
              <tr className="border-b border-outline-variant/30">
                <td className="px-4 py-2 text-on-surface">NPS_Score</td>
                <td className="px-4 py-2 text-on-surface-variant">Number</td>
                <td className="px-4 py-2 font-mono text-on-surface">88.89</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-4 py-2 text-sm text-on-surface-variant">
                  ... plus 14 more columns (AHT, Hold, Talk Time, DSAT, NPS_Score, Promoter (*), MOD, MOD (*), FCR, FCR (*), Surveys Answered, Calls Touched, Tickets Solved, Transactions, Productive Hours, TPH)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Help Section */}
      <div className="space-y-3 rounded-lg border border-outline-variant/60 bg-surface-dim p-6">
        <h3 className="font-semibold text-on-surface">Help & Tips</h3>
        <ul className="space-y-2 text-sm text-on-surface-variant">
          <li className="flex gap-3">
            <span className="flex-shrink-0 font-bold text-primary-container">•</span>
            <span>Empty cells will be treated as NULL values in the database</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 font-bold text-primary-container">•</span>
            <span>File size should not exceed 10MB</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 font-bold text-primary-container">•</span>
            <span>Time formats must be MM:SS (e.g., 01:32 for 1 minute 32 seconds)</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 font-bold text-primary-container">•</span>
            <span>Percentages must include the % symbol (e.g., 87.50%)</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 font-bold text-primary-container">•</span>
            <span>Agent names should match existing users in the database</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
