import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true })

  // Clear the webex_auth cookie
  response.cookies.delete('webex_auth')

  return response
}
