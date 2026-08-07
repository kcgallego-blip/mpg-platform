export type TicketStatus = 'Open' | 'Pending' | 'Solved'

export type TicketHistoryEntry = {
  timestamp: string
  action: string
  actor: string
}

export type TicketNote = {
  timestamp: string
  note: string
  author: string
}

export function createSubmissionHistory(
  submitter: string,
  timestamp = new Date().toISOString()
): TicketHistoryEntry[] {
  const actor = submitter.trim() || 'Unknown user'

  return [
    {
      timestamp,
      action: `Ticket submitted by ${actor}. Status: Open.`,
      actor,
    },
  ]
}

function parseAuditValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      return [value]
    }
  }

  return []
}

export function parseTicketHistory(value: unknown): TicketHistoryEntry[] {
  return parseAuditValue(value)
    .map((entry): TicketHistoryEntry | null => {
      if (typeof entry === 'string') {
        return {
          timestamp: '',
          action: entry,
          actor: 'System',
        }
      }

      if (!entry || typeof entry !== 'object') return null

      const record = entry as Record<string, unknown>
      const action =
        typeof record.action === 'string'
          ? record.action
          : typeof record.event === 'string'
            ? record.event
            : ''

      if (!action) return null

      return {
        timestamp: typeof record.timestamp === 'string' ? record.timestamp : '',
        action,
        actor: typeof record.actor === 'string' ? record.actor : 'System',
      }
    })
    .filter((entry): entry is TicketHistoryEntry => entry !== null)
}

export function parseTicketNotes(value: unknown): TicketNote[] {
  return parseAuditValue(value)
    .map((entry): TicketNote | null => {
      if (typeof entry === 'string') {
        return {
          timestamp: '',
          note: entry,
          author: 'Unknown',
        }
      }

      if (!entry || typeof entry !== 'object') return null

      const record = entry as Record<string, unknown>
      const note =
        typeof record.note === 'string'
          ? record.note
          : typeof record.content === 'string'
            ? record.content
            : ''

      if (!note) return null

      return {
        timestamp: typeof record.timestamp === 'string' ? record.timestamp : '',
        note,
        author:
          typeof record.author === 'string'
            ? record.author
            : typeof record.actor === 'string'
              ? record.actor
              : 'Unknown',
      }
    })
    .filter((note): note is TicketNote => note !== null)
}

export function normalizeTicketStatus(status: string | null | undefined): TicketStatus {
  const normalized = status?.trim().toLowerCase()

  if (normalized === 'pending') return 'Pending'
  if (['solved', 'resolved', 'completed', 'finished'].includes(normalized || '')) {
    return 'Solved'
  }

  return 'Open'
}

export function formatAuditTimestamp(timestamp: string): string {
  if (!timestamp) return 'Time unavailable'

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}
