'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'

const IT_TICKET_SUBMITTED_EVENT = 'mpg:it-ticket-submitted'
const TOAST_DURATION_MS = 5000

export function showITTicketSuccessToast(message: string) {
  window.dispatchEvent(
    new CustomEvent<string>(IT_TICKET_SUBMITTED_EVENT, { detail: message })
  )
}

export default function ITTicketSuccessToast() {
  const [message, setMessage] = useState<string | null>(null)
  const dismissTimer = useRef<number | null>(null)

  const dismissToast = () => {
    if (dismissTimer.current) {
      window.clearTimeout(dismissTimer.current)
      dismissTimer.current = null
    }
    setMessage(null)
  }

  useEffect(() => {
    const handleTicketSubmitted = (event: Event) => {
      const nextMessage = (event as CustomEvent<string>).detail

      if (dismissTimer.current) {
        window.clearTimeout(dismissTimer.current)
      }

      setMessage(nextMessage)
      dismissTimer.current = window.setTimeout(() => {
        setMessage(null)
        dismissTimer.current = null
      }, TOAST_DURATION_MS)
    }

    window.addEventListener(IT_TICKET_SUBMITTED_EVENT, handleTicketSubmitted)

    return () => {
      window.removeEventListener(IT_TICKET_SUBMITTED_EVENT, handleTicketSubmitted)
      if (dismissTimer.current) window.clearTimeout(dismissTimer.current)
    }
  }, [])

  if (!message) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-4 right-4 top-24 z-[60] flex items-center gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-emerald-700 shadow-lg sm:left-auto sm:right-6 sm:max-w-sm"
    >
      <CheckCircle2 size={20} className="shrink-0" />
      <span className="flex-1 text-sm font-medium">{message}</span>
      <button
        type="button"
        onClick={dismissToast}
        className="rounded-full p-1 text-emerald-700 transition-colors hover:bg-emerald-100"
        aria-label="Close notification"
      >
        <X size={18} />
      </button>
    </div>
  )
}
