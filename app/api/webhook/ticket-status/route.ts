import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const webexMessageId = searchParams.get('webex_message_id')

  if (!webexMessageId) {
    return NextResponse.json(
      { error: 'webex_message_id is required' },
      { status: 400 }
    )
  }

  const webhookUrl = process.env.WEBHOOK_URL
  if (!webhookUrl) {
    console.error('WEBHOOK_URL environment variable not set')
    return NextResponse.json(
      { error: 'Webhook URL not configured' },
      { status: 500 }
    )
  }

  try {
    const webhookEndpoint = `${webhookUrl}/api/ticket/status?webex_message_id=${encodeURIComponent(webexMessageId)}`
    console.log('Forwarding to webhook:', webhookEndpoint)

    const response = await fetch(webhookEndpoint, {
      method: 'POST',
    })

    if (response.ok) {
      return NextResponse.json({ success: true })
    } else {
      console.warn('Webhook returned non-ok status:', response.status)
      return NextResponse.json(
        { error: 'Webhook failed', status: response.status },
        { status: response.status }
      )
    }
  } catch (error) {
    console.error('Webhook forward failed:', error)
    return NextResponse.json(
      { error: 'Failed to call webhook' },
      { status: 500 }
    )
  }
}
