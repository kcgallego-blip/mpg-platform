import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { PRODUCTIVITY_REPORT_ROLES } from '@/lib/productivityReport'
import { getProductivityReportEnabled } from '@/lib/featureSettings'
import { getProductivityReport } from '@/lib/productivityReportService'
import { generateProductivityReportPdf } from '@/lib/productivityReportPdf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const isValidDateKey = (value: string) => {
  if (!DATE_KEY_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedDbUser(request)

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (
      !user.role ||
      !(PRODUCTIVITY_REPORT_ROLES as readonly string[]).includes(user.role)
    ) {
      return NextResponse.json(
        { error: 'Productivity reports are available only to management roles' },
        { status: 403 }
      )
    }

    if (!(await getProductivityReportEnabled())) {
      return NextResponse.json(
        { error: 'Productivity PDF reports are currently disabled' },
        { status: 403 }
      )
    }

    const shiftDate = request.nextUrl.searchParams.get('shiftDate') || ''
    if (!isValidDateKey(shiftDate)) {
      return NextResponse.json(
        { error: 'shiftDate must be a valid date in YYYY-MM-DD format' },
        { status: 400 }
      )
    }

    const report = await getProductivityReport({
      shiftDate,
    })
    const pdf = await generateProductivityReportPdf(report)
    const filename = `productivity-report-${shiftDate}.pdf`

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdf.byteLength),
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('Productivity PDF report error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to generate productivity report' },
      { status: 500 }
    )
  }
}
