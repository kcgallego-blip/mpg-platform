'use client'

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/supabase'
import {
  AlertTriangle,
  FileUp,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

type AgentRow = Database['public']['Tables']['agents']['Row']
type AgentInsert = Database['public']['Tables']['agents']['Insert']
type AgentField = keyof AgentInsert
type AgentFormField = Exclude<AgentField, 'name'>

type CsvAgent = { name: string } & Partial<Record<AgentField, string | null>>

type ImportPreview = {
  fileName: string
  rows: CsvAgent[]
  missing: AgentRow[]
}

type AgentFormState = Record<AgentField, string>

const agentFormFields: AgentFormField[] = [
  'team_leader',
  'setting',
  'role',
  'off_1',
  'off_2',
  'start_shift',
  'end_shift',
  'comments',
]

const fieldLabels: Record<AgentField, string> = {
  name: 'Agent Name',
  team_leader: 'Team Leader',
  setting: 'Setting',
  role: 'Role',
  off_1: 'Day OFF 1',
  off_2: 'Day OFF 2',
  start_shift: 'Start Shift',
  end_shift: 'End Shift',
  comments: 'Comments',
}

const emptyForm: AgentFormState = {
  name: '',
  team_leader: '',
  setting: '',
  role: '',
  off_1: '',
  off_2: '',
  start_shift: '',
  end_shift: '',
  comments: '',
}

const csvHeaderMap: Record<string, AgentField> = {
  agentname: 'name',
  name: 'name',
  supervisor: 'team_leader',
  teamleader: 'team_leader',
  leader: 'team_leader',
  setting: 'setting',
  role: 'role',
  dayoff1: 'off_1',
  dayoffone: 'off_1',
  dayoff2: 'off_2',
  dayofftwo: 'off_2',
  startshift: 'start_shift',
  endshift: 'end_shift',
  comments: 'comments',
  comment: 'comments',
}

const normalizeHeader = (header: string) =>
  header
    .trim()
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')

const normalizeName = (value: string | null | undefined) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const getNameTokens = (value: string | null | undefined) =>
  Array.from(new Set(normalizeName(value).split(/\s+/).filter(Boolean)))

const getLevenshteinDistance = (first: string, second: string) => {
  if (first === second) return 0
  if (first.length === 0) return second.length
  if (second.length === 0) return first.length

  const matrix: number[][] = []

  for (let i = 0; i <= second.length; i += 1) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= first.length; j += 1) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= second.length; i += 1) {
    for (let j = 1; j <= first.length; j += 1) {
      if (second.charAt(i - 1) === first.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }

  return matrix[second.length][first.length]
}

const getSimilarity = (first: string, second: string) => {
  if (!first && !second) return 100
  if (!first || !second) return 0

  const distance = getLevenshteinDistance(first, second)
  const maxLength = Math.max(first.length, second.length)
  return Math.round(((maxLength - distance) / maxLength) * 100)
}

const getFuzzyNameScore = (agentName: string, query: string) => {
  const normalizedAgent = normalizeName(agentName)
  const normalizedQuery = normalizeName(query)

  if (!normalizedAgent || !normalizedQuery) return 0
  if (normalizedAgent === normalizedQuery) return 100

  const agentTokens = getNameTokens(agentName)
  const queryTokens = getNameTokens(query)
  const agentMeaningfulTokens = agentTokens.filter(token => token.length > 1)
  const queryMeaningfulTokens = queryTokens.filter(token => token.length > 1)

  if (normalizedAgent.includes(normalizedQuery) || normalizedQuery.includes(normalizedAgent)) {
    return 92
  }

  const agentTokenSet = new Set(agentTokens)
  const queryTokenSet = new Set(queryTokens)
  const meaningfulAgentTokenSet = new Set(agentMeaningfulTokens)
  const matchedMeaningfulTokens = queryMeaningfulTokens.filter(token => meaningfulAgentTokenSet.has(token))
  const matchedQueryTokens = queryTokens.filter(token => agentTokenSet.has(token))
  const matchedAgentTokens = agentTokens.filter(token => queryTokenSet.has(token))

  const queryFirst = queryTokens[0]
  const queryLast = queryTokens[queryTokens.length - 1]
  const agentFirst = agentTokens[0]
  const agentLast = agentTokens[agentTokens.length - 1]

  // Match on first and last token (handles reduced/expanded names)
  if (
    queryFirst &&
    queryLast &&
    agentTokenSet.has(queryFirst) &&
    agentTokenSet.has(queryLast)
  ) {
    return 90
  }

  // Query has fewer tokens; check if all query meaningful tokens are in agent
  if (queryMeaningfulTokens.length > 0 && matchedMeaningfulTokens.length === queryMeaningfulTokens.length) {
    return 88
  }

  // Agent has fewer tokens; check if all agent meaningful tokens are in query (DB has full name, CSV reduced)
  if (agentMeaningfulTokens.length > 0 && agentMeaningfulTokens.every(token => queryTokenSet.has(token))) {
    return 86
  }

  // First + last match with one side having extra middle/second token
  if (queryFirst === agentFirst && queryLast === agentLast) {
    return 84
  }

  // First matches and last of either matches with prefix (handles "Raliegh Ann" vs "Raliegh Ann Sarmiento")
  if (queryFirst === agentFirst) {
    const queryLastPrefix = getSimilarity(queryLast || '', agentLast || '')
    const agentLastPrefix = getSimilarity(agentLast || '', queryLast || '')
    if ((queryLast && queryLastPrefix >= 85) || (agentLast && agentLastPrefix >= 85)) {
      return 82
    }
  }

  if (queryLast === agentLast) {
    const queryFirstPrefix = getSimilarity(queryFirst || '', agentFirst || '')
    const agentFirstPrefix = getSimilarity(agentFirst || '', queryFirst || '')
    if ((queryFirst && queryFirstPrefix >= 85) || (agentFirst && agentFirstPrefix >= 85)) {
      return 80
    }
  }

  // Handle single-name queries against multi-token agent names (DB: "Carlos", query: "Carlos Santos")
  if (queryTokens.length === 1 && queryTokenSet.has(agentFirst) && agentTokens.length > 1) {
    return 78
  }

  // Handle multi-name queries against single-token agent names
  if (agentTokens.length === 1 && queryTokens.length > 1 && queryTokenSet.has(agentFirst)) {
    return 76
  }

  if (matchedQueryTokens.length > 0 || matchedAgentTokens.length > 0) {
    const overlapRatio = Math.max(
      matchedQueryTokens.length / Math.max(queryTokens.length, 1),
      matchedAgentTokens.length / Math.max(agentTokens.length, 1)
    )

    if (overlapRatio >= 0.75) return 76
    if (overlapRatio >= 0.6) return 70
    if (overlapRatio >= 0.5) return 65
  }

  const fullSimilarity = getSimilarity(normalizedAgent, normalizedQuery)
  if (fullSimilarity >= 86) return fullSimilarity

  const lastSimilarity = getSimilarity(agentLast || '', queryLast || '')
  if (lastSimilarity >= 88 && queryFirst === agentFirst) return Math.min(84, lastSimilarity)

  return 0
}

const parseCsvLine = (line: string) => {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const nextChar = line[index + 1]

    if (char === '"' && nextChar === '"') {
      current += '"'
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  values.push(current.trim())
  return values
}

const parseCsvAgents = (csvContent: string): CsvAgent[] => {
  const lines = csvContent
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one agent row')
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader)
  const rows: CsvAgent[] = []
  const seenNames = new Set<string>()

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const values = parseCsvLine(lines[lineIndex])
    const record: Partial<Record<AgentField, string | null>> = {}

    headers.forEach((header, index) => {
      const field = csvHeaderMap[header]
      if (!field) return

      const value = values[index]?.trim()
      record[field] = value === undefined || value === '' ? null : value
    })

    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (!name) continue

    const normalizedName = normalizeName(name)
    if (seenNames.has(normalizedName)) {
      throw new Error(`Duplicate agent name in CSV: ${name}`)
    }

    seenNames.add(normalizedName)
    record.name = name
    rows.push(record as CsvAgent)
  }

  if (rows.length === 0) {
    throw new Error('CSV must include an Agent Name column with at least one agent')
  }

  return rows
}

const buildAgentPayload = (row: CsvAgent): AgentInsert => {
  const payload: Record<string, string | null> = { name: row.name }

  agentFormFields.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(row, field)) {
      const value = row[field]
      payload[field] = typeof value === 'string' ? value : null
    }
  })

  return payload as AgentInsert
}

const agentToForm = (agent: AgentRow): AgentFormState => ({
  name: agent.name,
  team_leader: agent.team_leader || '',
  setting: agent.setting || '',
  role: agent.role || '',
  off_1: agent.off_1 || '',
  off_2: agent.off_2 || '',
  start_shift: agent.start_shift || '',
  end_shift: agent.end_shift || '',
  comments: agent.comments || '',
})

const formToPayload = (form: AgentFormState): AgentInsert => {
  const payload: Record<string, string | null> = {
    name: form.name.trim(),
  }

  agentFormFields.forEach(field => {
    payload[field] = form[field].trim() || null
  })

  return payload as AgentInsert
}

const formatValue = (value: string | null | undefined) => value || '-'

export default function AgentsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [formState, setFormState] = useState<AgentFormState>(emptyForm)
  const [savingAgent, setSavingAgent] = useState(false)

  const fetchAgents = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { data, error: dbError } = await supabase
        .from('agents')
        .select('*')
        .order('name', { ascending: true })

      if (dbError) throw dbError

      const nextAgents = (data || []) as AgentRow[]
      setAgents(nextAgents)
      return nextAgents
    } catch (err: any) {
      console.error('Failed to load agents:', err)
      setError(err.message || 'Failed to load agents')
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  const filteredAgents = useMemo(() => {
    const query = searchQuery.trim()
    if (!query) return agents

    return agents
      .map(agent => ({
        agent,
        score: getFuzzyNameScore(agent.name, query),
      }))
      .filter(({ score }) => score >= 65)
      .sort((first, second) => {
        if (second.score !== first.score) return second.score - first.score
        return first.agent.name.localeCompare(second.agent.name)
      })
      .map(({ agent }) => agent)
  }, [agents, searchQuery])

  const updateImportPreviewMissing = useCallback((nextAgents: AgentRow[]) => {
    setImportPreview(current => {
      if (!current) return current

      const csvNames = new Set(current.rows.map(row => normalizeName(row.name)))
      return {
        ...current,
        missing: nextAgents.filter(agent => !csvNames.has(normalizeName(agent.name))),
      }
    })
  }, [])

  const openAgentForm = (agent?: AgentRow) => {
    setEditingName(agent?.name || null)
    setFormState(agent ? agentToForm(agent) : emptyForm)
    setFormModalOpen(true)
  }

  const closeAgentForm = () => {
    setFormModalOpen(false)
    setEditingName(null)
    setFormState(emptyForm)
  }

  const handleDeleteAgent = async (agent: AgentRow, skipConfirm = false) => {
    if (!skipConfirm && !window.confirm(`Delete ${agent.name} permanently?`)) return

    try {
      const { error: deleteError } = await supabase
        .from('agents')
        .delete()
        .eq('name', agent.name)

      if (deleteError) throw deleteError

      const nextAgents = await fetchAgents()
      updateImportPreviewMissing(nextAgents)
      setSuccessMessage(`${agent.name} was deleted permanently`)
    } catch (err: any) {
      console.error('Failed to delete agent:', err)
      setError(err.message || 'Failed to delete agent')
    }
  }

  const handleSaveAgent = async () => {
    const nextName = formState.name.trim()
    if (!nextName) {
      setError('Agent name is required')
      return
    }

    const duplicate = agents.find(agent => normalizeName(agent.name) === normalizeName(nextName))
    if (duplicate && (!editingName || normalizeName(duplicate.name) !== normalizeName(editingName))) {
      setError(`An agent named ${nextName} already exists`)
      return
    }

    setSavingAgent(true)
    setError(null)

    try {
      const payload = formToPayload(formState)

      if (editingName && normalizeName(editingName) !== normalizeName(nextName)) {
        const { error: insertError } = await supabase.from('agents').insert(payload).select().single()
        if (insertError) throw insertError

        const { error: deleteError } = await supabase
          .from('agents')
          .delete()
          .eq('name', editingName)

        if (deleteError) throw deleteError
      } else if (editingName) {
        const { error: updateError } = await supabase
          .from('agents')
          .update(payload)
          .eq('name', editingName)
          .select()
          .single()

        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase.from('agents').insert(payload).select().single()
        if (insertError) throw insertError
      }

      const nextAgents = await fetchAgents()
      updateImportPreviewMissing(nextAgents)
      setSuccessMessage(editingName ? 'Agent updated' : 'Agent created')
      closeAgentForm()
    } catch (err: any) {
      console.error('Failed to save agent:', err)
      setError(err.message || 'Failed to save agent')
    } finally {
      setSavingAgent(false)
    }
  }

  const handleImportCsv = async (csvContent: string, fileName: string) => {
    const rows = parseCsvAgents(csvContent)
    const csvNames = new Set(rows.map(row => normalizeName(row.name)))
    const missing = agents.filter(agent => !csvNames.has(normalizeName(agent.name)))

    setImportPreview({
      fileName,
      rows,
      missing,
    })
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setError(null)
      setSuccessMessage(null)
      const fileName = file.name.toLowerCase()

      let csvContent: string
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const arrayBuffer = await file.arrayBuffer()
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        const jsonSheet = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 })
        const lines: string[] = []
        jsonSheet.forEach((row) => {
          if (Array.isArray(row)) {
            lines.push(row.map(cell => String(cell ?? '')).join(','))
          }
        })
        csvContent = lines.join('\n')
      } else {
        csvContent = await file.text()
      }

      await handleImportCsv(csvContent, file.name)
    } catch (err: any) {
      console.error('Failed to import file:', err)
      setError(err.message || 'Failed to import file')
    } finally {
      event.target.value = ''
    }
  }

  const handleApplyImport = async () => {
    if (!importPreview) return

    setIsImporting(true)
    setError(null)

    try {
      const batchSize = 50
      let imported = 0

      for (let index = 0; index < importPreview.rows.length; index += batchSize) {
        const batch = importPreview.rows.slice(index, index + batchSize)
        const payloadBatch = batch.map(buildAgentPayload)
        const { error: upsertError } = await supabase
          .from('agents')
          .upsert(payloadBatch, { onConflict: 'name' })
          .select()

        if (upsertError) throw upsertError
        imported += batch.length
      }

      const nextAgents = await fetchAgents()
      updateImportPreviewMissing(nextAgents)
      setImportPreview(null)
      setSuccessMessage(`Imported ${imported} agents from ${importPreview.fileName}`)
    } catch (err: any) {
      console.error('Failed to apply CSV import:', err)
      setError(err.message || 'Failed to import agents')
    } finally {
      setIsImporting(false)
    }
  }

  const handleDeleteAllMissing = async () => {
    if (!importPreview?.missing.length) return
    if (!window.confirm(`Delete ${importPreview.missing.length} agents permanently?`)) return

    try {
      const { error: deleteError } = await supabase
        .from('agents')
        .delete()
        .in('name', importPreview.missing.map(agent => agent.name))

      if (deleteError) throw deleteError

      const nextAgents = await fetchAgents()
      updateImportPreviewMissing(nextAgents)
      setSuccessMessage(`Deleted ${importPreview.missing.length} agents permanently`)
    } catch (err: any) {
      console.error('Failed to delete missing agents:', err)
      setError(err.message || 'Failed to delete missing agents')
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-hanken text-display-lg font-bold text-on-surface mb-2">
            Agents
          </h1>
          <p className="text-on-surface-variant">
            Manage agent roles, schedules, comments, and team leaders.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 px-lg py-md rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors"
          >
            <Upload size={20} />
            Import File
          </button>
          <button
            type="button"
            onClick={() => openAgentForm()}
            className="flex items-center justify-center gap-2 px-lg py-md rounded-lg bg-primary-container text-on-primary-container hover:opacity-90 transition-colors"
          >
            <Plus size={20} />
            Add Agent
          </button>
          <button
            type="button"
            onClick={() => fetchAgents()}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-lg py-md rounded-lg glass-effect text-on-surface font-medium transition-all hover:bg-surface-container-high disabled:opacity-50"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={handleFileChange}
      />

      {error && (
        <div className="p-6 rounded-xl bg-error/10 text-error text-center">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="p-6 rounded-xl bg-success/10 text-success text-center">
          {successMessage}
        </div>
      )}

      <div className="glass-effect rounded-xl p-6 backdrop-blur-glass-lg">
        <div className="relative">
          <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Fuzzy search by agent name..."
            className="w-full pl-10 pr-4 py-3 rounded-lg bg-surface-container-low/50 border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-outline-variant/30 border-t-primary rounded-full animate-spin"></div>
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="text-center py-20 text-on-surface-variant">
          {searchQuery ? 'No agents found matching the fuzzy search' : 'No agents found'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl">
          <table className="w-full min-w-[1100px]">
            <thead className="bg-surface-container-low">
              <tr>
                {['name', 'role', 'team_leader', 'off_1', 'off_2', 'start_shift', 'end_shift', 'comments'].map(field => (
                  <th key={field} className="px-4 py-3 text-left text-label-sm font-semibold text-on-surface-variant">
                    {fieldLabels[field as AgentField]}
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-label-sm font-semibold text-on-surface-variant">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {filteredAgents.map((agent) => (
                <tr key={agent.name} className="hover:bg-surface-container-high/50 transition-colors">
                  <td className="px-4 py-3 text-sm text-on-surface">
                    <span className="block max-w-[16rem] truncate" title={agent.name}>{agent.name}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface">{formatValue(agent.role)}</td>
                  <td className="px-4 py-3 text-sm text-on-surface">{formatValue(agent.team_leader)}</td>
                  <td className="px-4 py-3 text-sm text-on-surface">{formatValue(agent.off_1)}</td>
                  <td className="px-4 py-3 text-sm text-on-surface">{formatValue(agent.off_2)}</td>
                  <td className="px-4 py-3 text-sm text-on-surface">{formatValue(agent.start_shift)}</td>
                  <td className="px-4 py-3 text-sm text-on-surface">{formatValue(agent.end_shift)}</td>
                  <td className="px-4 py-3 text-sm text-on-surface">
                    <span className="block max-w-[18rem] truncate" title={agent.comments || ''}>
                      {formatValue(agent.comments)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openAgentForm(agent)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-colors text-xs font-medium"
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAgent(agent)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-error/10 hover:bg-error/20 text-error transition-colors text-xs font-medium"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {importPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setImportPreview(null)}>
          <div className="bg-surface rounded-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="font-hanken text-headline-md font-bold text-on-surface mb-1">
                  Review Import
                </h3>
                <p className="text-on-surface-variant text-sm">
                  {importPreview.fileName} contains {importPreview.rows.length} agent rows.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                className="text-on-surface-variant hover:text-on-surface"
              >
                <X size={20} />
              </button>
            </div>

            {importPreview.missing.length > 0 && (
              <div className="mb-5 p-4 rounded-xl bg-error/10 border border-error/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="text-error shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="font-medium text-error mb-2">
                      {importPreview.missing.length} database agent{importPreview.missing.length === 1 ? '' : 's'} not present in this CSV.
                    </p>
                    <p className="text-sm text-on-surface-variant mb-3">
                      Choose Delete to permanently remove them, or Edit to manually modify and keep them.
                    </p>
                    <div className="space-y-2">
                      {importPreview.missing.map(agent => (
                        <div key={agent.name} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg bg-surface p-3 border border-outline-variant/30">
                          <div>
                            <p className="font-medium text-on-surface">{agent.name}</p>
                            <p className="text-xs text-on-surface-variant">
                              {formatValue(agent.role)} · {formatValue(agent.team_leader)} · {formatValue(agent.start_shift)}-{formatValue(agent.end_shift)}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => openAgentForm(agent)}
                              className="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-colors text-xs font-medium"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAgent(agent)}
                              className="px-3 py-1.5 rounded-lg bg-error/10 hover:bg-error/20 text-error transition-colors text-xs font-medium"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleDeleteAllMissing}
                      className="mt-3 w-full px-4 py-2 rounded-lg bg-error text-on-error hover:bg-error/90 transition-colors text-sm font-medium"
                    >
                      Delete All Missing Agents
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                disabled={isImporting}
                className="px-4 py-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyImport}
                disabled={isImporting}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isImporting ? <RefreshCw size={18} className="animate-spin" /> : <FileUp size={18} />}
                {isImporting ? 'Importing...' : 'Apply Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {formModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setFormModalOpen(false)}>
          <div className="bg-surface rounded-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="font-hanken text-headline-md font-bold text-on-surface mb-1">
                  {editingName ? 'Edit Agent' : 'Add Agent'}
                </h3>
                <p className="text-on-surface-variant text-sm">
                  {editingName ? 'Update this agent record.' : 'Create a new agent record.'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeAgentForm}
                className="text-on-surface-variant hover:text-on-surface"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(Object.keys(fieldLabels) as AgentField[]).map(field => (
                <label key={field} className="block">
                  <span className="block text-label-sm font-semibold text-on-surface-variant mb-2">
                    {fieldLabels[field]}
                  </span>
                  {field === 'comments' ? (
                    <textarea
                      value={formState[field]}
                      onChange={(event) => setFormState(current => ({ ...current, [field]: event.target.value }))}
                      className="w-full min-h-24 px-4 py-3 rounded-lg bg-surface-container-low/50 border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                      placeholder={fieldLabels[field]}
                    />
                  ) : (
                    <input
                      type="text"
                      value={formState[field]}
                      onChange={(event) => setFormState(current => ({ ...current, [field]: event.target.value }))}
                      className="w-full px-4 py-3 rounded-lg bg-surface-container-low/50 border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      placeholder={fieldLabels[field]}
                      autoFocus={field === 'name'}
                    />
                  )}
                </label>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end mt-6">
              <button
                type="button"
                onClick={closeAgentForm}
                disabled={savingAgent}
                className="px-4 py-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAgent}
                disabled={savingAgent || !formState.name.trim()}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Save size={18} />
                {savingAgent ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
