'use client'

import { useEffect, useMemo, useRef, useState, type WheelEvent as ReactWheelEvent } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  AlertTriangle,
  FileCheck2,
  GripVertical,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import type { ImportedAgent } from '@/lib/agentsImport'
import { normalizeAgentName } from '@/lib/agentsImport'

export type ReconciliationExistingAgent = {
  name: string
  email: string | null
  team_leader: string | null
  role: string | null
  start_shift: string | null
  end_shift: string | null
}

export type ReconciliationPlan = {
  manualMatches: Array<{
    incoming: ImportedAgent
    existingName: string
  }>
  newAgents: ImportedAgent[]
  deleteNames: string[]
}

type NewAgentSlot = {
  id: string
  agent: ImportedAgent | null
}

type AgentReconciliationModalProps = {
  fileName: string
  totalRows: number
  automaticMatchCount: number
  unmatchedNew: ImportedAgent[]
  missingOld: ReconciliationExistingAgent[]
  isSubmitting: boolean
  onClose: () => void
  onFinalize: (plan: ReconciliationPlan) => void
}

const getDraggableId = (agent: ImportedAgent) => `incoming:${normalizeAgentName(agent.name)}`

const AgentDetails = ({ agent }: { agent: Partial<ReconciliationExistingAgent> & { name: string } }) => (
  <div className="min-w-0">
    <p className="truncate font-semibold text-on-surface" title={agent.name}>
      {agent.name}
    </p>
    <p className="mt-1 truncate text-xs text-on-surface-variant">
      {[agent.email, agent.role, agent.team_leader].filter(Boolean).join(' · ') || 'No additional details'}
    </p>
    {(agent.start_shift || agent.end_shift) && (
      <p className="mt-1 text-xs text-on-surface-variant">
        {agent.start_shift || '—'}–{agent.end_shift || '—'}
      </p>
    )}
  </div>
)

const RaisedAgentCardVisual = ({
  agent,
  className = '',
}: {
  agent: ImportedAgent
  className?: string
}) => (
  <div
    className={`flex min-h-28 items-center gap-3 rounded-xl border border-white/30 bg-surface-container-high p-4 shadow-[0_5px_0_rgba(0,0,0,0.20),0_10px_20px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.35)] ${className}`}
  >
    <GripVertical className="shrink-0 text-primary" size={20} aria-hidden="true" />
    <AgentDetails agent={agent} />
  </div>
)

const RaisedAgentCard = ({ agent }: { agent: ImportedAgent }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: getDraggableId(agent),
    data: { agent },
  })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab touch-none transition-opacity active:cursor-grabbing ${
        isDragging ? 'opacity-30' : 'opacity-100'
      }`}
    >
      <RaisedAgentCardVisual agent={agent} />
    </div>
  )
}

const OldAgentTarget = ({
  agent,
  incoming,
  onUndo,
}: {
  agent: ReconciliationExistingAgent
  incoming: ImportedAgent | null
  onUndo: () => void
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: `existing:${agent.name}`,
    data: { kind: 'existing', existingName: agent.name },
  })

  return (
    <div
      ref={setNodeRef}
      className={`min-h-28 rounded-xl border p-4 shadow-[inset_0_4px_9px_rgba(0,0,0,0.22),inset_0_-1px_0_rgba(255,255,255,0.12)] transition-colors ${
        isOver
          ? 'border-primary bg-primary/15 ring-2 ring-primary/30'
          : incoming
            ? 'border-success/40 bg-success/10'
            : 'border-outline-variant/60 bg-surface-container-low'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <AgentDetails agent={agent} />
        </div>
        {!incoming && <Trash2 className="mt-1 shrink-0 text-error/70" size={18} aria-label="Will be deleted" />}
      </div>

      {incoming && (
        <div className="mt-4 rounded-lg border border-success/30 bg-surface p-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-success">Mapped replacement</p>
              <AgentDetails agent={incoming} />
            </div>
            <button
              type="button"
              onClick={onUndo}
              className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
              aria-label={`Unmap ${incoming.name}`}
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const NewAgentDropSlot = ({ slot, onUndo }: { slot: NewAgentSlot; onUndo: () => void }) => {
  const { isOver, setNodeRef } = useDroppable({
    id: slot.id,
    data: { kind: 'new', slotId: slot.id },
    disabled: Boolean(slot.agent),
  })

  if (slot.agent) {
    return (
      <div className="rounded-xl border border-primary/40 bg-primary/10 p-4 shadow-[0_3px_0_rgba(0,0,0,0.14)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-primary">New database agent</p>
            <AgentDetails agent={slot.agent} />
          </div>
          <button
            type="button"
            onClick={onUndo}
            className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface hover:text-on-surface"
            aria-label={`Remove new-agent designation for ${slot.agent.name}`}
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-32 flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition-all ${
        isOver
          ? 'scale-[1.01] border-primary bg-primary/15 text-primary ring-2 ring-primary/20'
          : 'border-outline-variant bg-surface-container-low/50 text-on-surface-variant'
      }`}
    >
      <Plus size={38} strokeWidth={1.8} aria-hidden="true" />
      <p className="mt-2 text-sm font-semibold">Drop here to add a new agent</p>
    </div>
  )
}

export default function AgentReconciliationModal({
  fileName,
  totalRows,
  automaticMatchCount,
  unmatchedNew,
  missingOld,
  isSubmitting,
  onClose,
  onFinalize,
}: AgentReconciliationModalProps) {
  const slotCounter = useRef(1)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const [availableAgents, setAvailableAgents] = useState(unmatchedNew)
  const [mappedByExistingName, setMappedByExistingName] = useState<Record<string, ImportedAgent>>({})
  const [newAgentSlots, setNewAgentSlots] = useState<NewAgentSlot[]>([
    { id: 'new-agent-slot-0', agent: null },
  ])
  const [activeAgent, setActiveAgent] = useState<ImportedAgent | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  )

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [])

  const deleteNames = useMemo(
    () => missingOld.filter(agent => !mappedByExistingName[agent.name]).map(agent => agent.name),
    [mappedByExistingName, missingOld]
  )
  const newAgentCount = newAgentSlots.filter(slot => slot.agent).length
  const hasReconciliationItems = unmatchedNew.length > 0 || missingOld.length > 0

  const returnAgentToLeft = (agent: ImportedAgent) => {
    setAvailableAgents(current =>
      current.some(item => getDraggableId(item) === getDraggableId(agent)) ? current : [...current, agent]
    )
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveAgent((event.active.data.current?.agent as ImportedAgent | undefined) || null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveAgent(null)
    const incoming = event.active.data.current?.agent as ImportedAgent | undefined
    const target = event.over?.data.current as
      | { kind?: 'existing' | 'new'; existingName?: string; slotId?: string }
      | undefined

    if (!incoming || !target?.kind) return

    if (target.kind === 'existing' && target.existingName) {
      const replacedAgent = mappedByExistingName[target.existingName]
      setMappedByExistingName(current => ({ ...current, [target.existingName as string]: incoming }))
      setAvailableAgents(current => current.filter(agent => getDraggableId(agent) !== getDraggableId(incoming)))
      if (replacedAgent) returnAgentToLeft(replacedAgent)
      return
    }

    if (target.kind === 'new' && target.slotId) {
      setNewAgentSlots(current => [
        ...current.map(slot => (slot.id === target.slotId ? { ...slot, agent: incoming } : slot)),
        { id: `new-agent-slot-${slotCounter.current++}`, agent: null },
      ])
      setAvailableAgents(current => current.filter(agent => getDraggableId(agent) !== getDraggableId(incoming)))
    }
  }

  const unmapExisting = (existingName: string) => {
    const incoming = mappedByExistingName[existingName]
    if (!incoming) return
    returnAgentToLeft(incoming)
    setMappedByExistingName(current => {
      const next = { ...current }
      delete next[existingName]
      return next
    })
  }

  const unmapNewAgent = (slotId: string) => {
    const slot = newAgentSlots.find(item => item.id === slotId)
    if (!slot?.agent) return
    returnAgentToLeft(slot.agent)
    setNewAgentSlots(current => current.filter(item => item.id !== slotId))
  }

  const finalize = () => {
    onFinalize({
      manualMatches: Object.entries(mappedByExistingName).map(([existingName, incoming]) => ({
        existingName,
        incoming,
      })),
      newAgents: newAgentSlots.flatMap(slot => (slot.agent ? [slot.agent] : [])),
      deleteNames,
    })
  }

  const handleModalWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer || scrollContainer.contains(event.target as Node)) return

    event.preventDefault()
    scrollContainer.scrollTop += event.deltaY
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overscroll-none bg-black/60 p-3 sm:p-5"
      onWheel={handleModalWheel}
    >
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant/30 p-5 sm:p-6">
          <div>
            <h2 className="font-hanken text-headline-md font-bold text-on-surface">Reconcile Agent Import</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {fileName} · {totalRows} rows · {automaticMatchCount} automatically matched
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:opacity-50"
            aria-label="Close reconciliation"
          >
            <X size={20} />
          </button>
        </div>

        <DndContext
          sensors={sensors}
          autoScroll
          onDragStart={handleDragStart}
          onDragCancel={() => setActiveAgent(null)}
          onDragEnd={handleDragEnd}
        >
          <div
            ref={scrollContainerRef}
            className="min-h-0 flex-1 overscroll-y-contain overflow-y-auto p-5 sm:p-6"
          >
            {!hasReconciliationItems ? (
              <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-success/30 bg-success/10 p-8 text-center">
                <FileCheck2 className="text-success" size={48} />
                <h3 className="mt-4 text-lg font-bold text-on-surface">All agents matched</h3>
                <p className="mt-2 max-w-lg text-sm text-on-surface-variant">
                  The imported schedule aligns with the current database. Finalize to update schedule-owned fields.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <section aria-labelledby="unmatched-new-heading">
                  <div className="mb-4">
                    <h3 id="unmatched-new-heading" className="font-bold text-on-surface">
                      Unmatched New Agents ({availableAgents.length})
                    </h3>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      Drag every raised card to an existing agent or a plus zone.
                    </p>
                  </div>
                  <div className="space-y-4 rounded-xl border border-outline-variant/30 bg-surface-container-low/30 p-4">
                    {availableAgents.length > 0 ? (
                      availableAgents.map(agent => <RaisedAgentCard key={getDraggableId(agent)} agent={agent} />)
                    ) : (
                      <div className="rounded-xl border border-success/30 bg-success/10 p-8 text-center text-sm font-medium text-success">
                        Every imported agent has been assigned.
                      </div>
                    )}
                  </div>
                </section>

                <section aria-labelledby="missing-old-heading">
                  <div className="mb-4">
                    <h3 id="missing-old-heading" className="font-bold text-on-surface">
                      Missing Old Agents ({missingOld.length})
                    </h3>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      Drop a raised card onto a depressed target to map a replacement. Targets left empty will be permanently deleted.
                    </p>
                  </div>
                  <div className="space-y-4">
                    {missingOld.map(agent => (
                      <OldAgentTarget
                        key={agent.name}
                        agent={agent}
                        incoming={mappedByExistingName[agent.name] || null}
                        onUndo={() => unmapExisting(agent.name)}
                      />
                    ))}
                    <div className="pt-2">
                      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-on-surface-variant">
                        Add completely new agents
                      </p>
                      <div className="space-y-4">
                        {newAgentSlots.map(slot => (
                          <NewAgentDropSlot
                            key={slot.id}
                            slot={slot}
                            onUndo={() => unmapNewAgent(slot.id)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}
          </div>

          <DragOverlay>
            {activeAgent ? (
              <RaisedAgentCardVisual agent={activeAgent} className="w-[min(24rem,80vw)] rotate-2" />
            ) : null}
          </DragOverlay>
        </DndContext>

        <div className="border-t border-outline-variant/30 bg-surface-container-low/40 p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-on-surface-variant">
            <span>{automaticMatchCount + Object.keys(mappedByExistingName).length} updates</span>
            <span>{newAgentCount} new</span>
            <span className={deleteNames.length > 0 ? 'font-semibold text-error' : ''}>
              {deleteNames.length} permanent deletion{deleteNames.length === 1 ? '' : 's'}
            </span>
          </div>
          {deleteNames.length > 0 && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-error/25 bg-error/10 p-3 text-xs text-error">
              <AlertTriangle className="mt-0.5 shrink-0" size={16} />
              Finalizing permanently deletes every empty existing-agent target.
            </div>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={finalize}
              disabled={isSubmitting || availableAgents.length > 0}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              title={availableAgents.length > 0 ? 'Assign every imported agent before finalizing' : undefined}
            >
              {isSubmitting ? <RefreshCw className="animate-spin" size={18} /> : <FileCheck2 size={18} />}
              {isSubmitting ? 'Finalizing…' : 'Submit / Finalize'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
