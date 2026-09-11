import { NextRequest, NextResponse } from 'next/server'
import { canAccessAgentInsight } from '@/lib/agentInsightAccess'
import {
  AgentInsightGenerationError,
  generateAgentInsight,
} from '@/lib/agentInsightGenerator'
import {
  AgentInsightNotFoundError,
  getAgentInsightData,
} from '@/lib/agentInsightService'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'

const noStoreHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedDbUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: noStoreHeaders })
    }
    if (!canAccessAgentInsight(user.role)) {
      return NextResponse.json({ error: 'Agent Insight access required' }, { status: 403, headers: noStoreHeaders })
    }

    const body = await request.json().catch(() => ({})) as { agentName?: unknown }
    const agentName = typeof body.agentName === 'string' ? body.agentName.trim() : ''
    if (!agentName || agentName.length > 200) {
      return NextResponse.json({ error: 'A valid roster agent name is required' }, { status: 400, headers: noStoreHeaders })
    }

    const data = await getAgentInsightData(agentName)
    const insight = await generateAgentInsight({ data })
    return NextResponse.json({ insight }, { headers: noStoreHeaders })
  } catch (error) {
    if (error instanceof AgentInsightNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404, headers: noStoreHeaders })
    }
    if (error instanceof AgentInsightGenerationError) {
      console.error(`Agent Insight generation error (${error.reason}):`, error.message)
      return NextResponse.json({ error: 'AI coaching insight is temporarily unavailable' }, { status: 503, headers: noStoreHeaders })
    }
    console.error('Agent Insight AI API error:', error)
    return NextResponse.json({ error: 'Failed to generate AI coaching insight' }, { status: 500, headers: noStoreHeaders })
  }
}
