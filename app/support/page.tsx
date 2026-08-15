'use client'

import { ShieldX } from 'lucide-react'
import AgentSupportView from '@/components/support/AgentSupportView'
import ManagerSupportView from '@/components/support/ManagerSupportView'
import { useRequireAuth } from '@/lib/useRequireAuth'
import { isAgentRole } from '@/lib/support'

export default function SupportPage() {
  const { user, isReady } = useRequireAuth()
  if (!isReady || !user) return null
  if (!user.role?.trim()) return <div className="flex min-h-[70vh] items-center justify-center text-center"><div><ShieldX size={38} className="mx-auto mb-3 text-error" /><h1 className="font-hanken text-2xl font-bold">Support access pending</h1><p className="mt-2 text-on-surface-variant">Ask an administrator to assign your account role.</p></div></div>
  return isAgentRole(user.role) ? <AgentSupportView email={user.email} /> : <ManagerSupportView />
}
