import { NextRequest, NextResponse } from 'next/server'
import { canAccessAgentInsight } from '@/lib/agentInsightAccess'
import {
  AgentInsightNotFoundError,
  getAgentInsightData,
} from '@/lib/agentInsightService'
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

    const agentName = request.nextUrl.searchParams.get('agentName')?.trim() || ''
    if (!agentName || agentName.length > 200) {
      return NextResponse.json({ error: 'A valid roster agent name is required' }, { status: 400, headers: noStoreHeaders })
    }

    const insight = await getAgentInsightData(agentName)
    return NextResponse.json(insight, { headers: noStoreHeaders })
  } catch (error) {
    if (error instanceof AgentInsightNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404, headers: noStoreHeaders })
    }
    console.error('Agent Insight API error:', error)
    return NextResponse.json({ error: 'Failed to load Agent Insight data' }, { status: 500, headers: noStoreHeaders })
  }
}
