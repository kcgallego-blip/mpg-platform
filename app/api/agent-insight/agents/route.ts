import { NextRequest, NextResponse } from 'next/server'
import { canAccessAgentInsight } from '@/lib/agentInsightAccess'
import { getAgentInsightRoster } from '@/lib/agentInsightService'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'

const noStoreHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedDbUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: noStoreHeaders })
    }
    if (!canAccessAgentInsight(user.role)) {
      return NextResponse.json({ error: 'Agent Insight access required' }, { status: 403, headers: noStoreHeaders })
    }

    const agents = await getAgentInsightRoster()
    return NextResponse.json({ agents }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('Agent Insight roster API error:', error)
    return NextResponse.json({ error: 'Failed to load the agent roster' }, { status: 500, headers: noStoreHeaders })
  }
}
