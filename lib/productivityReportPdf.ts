import PDFDocument from 'pdfkit'
import { PRODUCTIVITY_SHIFT_HOURS } from './productivityReport.ts'
import type { ProductivityAgentReport, ProductivityReport } from './productivityReport.ts'

const COLORS = {
  ink: '#172033',
  muted: '#64748B',
  line: '#D7DEE9',
  paper: '#FFFFFF',
  panel: '#F5F7FB',
  primary: '#3056D3',
  primaryLight: '#E9EEFF',
  green: '#16845B',
  amber: '#B86E00',
  red: '#C43D4B',
}

const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 42,
}

const contentWidth = PAGE.width - PAGE.margin * 2

const formatHour = (hour: string) => {
  const value = Number(hour)
  const suffix = value >= 12 ? 'PM' : 'AM'
  const twelveHour = value % 12 || 12
  return `${twelveHour} ${suffix}`
}

const formatTimestamp = (timestamp: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(timestamp))

const formatDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

const heatColor = (count: number, max: number) => {
  if (count <= 0) return '#EEF1F6'
  const ratio = Math.min(1, count / Math.max(1, max))
  if (ratio < 0.34) return '#FFCBC5'
  if (ratio < 0.67) return '#FFD98E'
  return '#65C99A'
}

type TableColumn<T> = {
  label: string
  width: number
  align?: 'left' | 'center' | 'right'
  value: (row: T) => string
}

export const generateProductivityReportPdf = (report: ProductivityReport): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: {
        top: PAGE.margin,
        bottom: PAGE.margin,
        left: PAGE.margin,
        right: PAGE.margin,
      },
      bufferPages: true,
      info: {
        Title: `Productivity Report - ${report.shiftDate}`,
        Author: 'Masterpiece Group Analytics',
        Subject: `Team productivity report for ${report.shiftDate}`,
        Keywords: 'productivity, TPH, tickets, downtime, performance',
      },
    })
    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    const addPage = (continued = false) => {
      doc.addPage()
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(COLORS.primary)
        .text('MPG  /  PRODUCTIVITY INTELLIGENCE', PAGE.margin, 28)
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(COLORS.muted)
        .text(continued ? `Shift ${report.shiftDate}  ·  Continued` : report.scopeLabel, PAGE.margin, 28, {
          align: 'right',
          width: contentWidth,
        })
      doc
        .moveTo(PAGE.margin, 45)
        .lineTo(PAGE.width - PAGE.margin, 45)
        .lineWidth(0.7)
        .strokeColor(COLORS.line)
        .stroke()
      doc.y = 58
    }

    const ensureSpace = (height: number) => {
      if (doc.y + height > PAGE.height - 55) addPage(true)
    }

    const sectionTitle = (title: string, subtitle?: string) => {
      ensureSpace(subtitle ? 45 : 30)
      const top = doc.y
      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor(COLORS.ink)
        .text(title, PAGE.margin, top)
      if (subtitle) {
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor(COLORS.muted)
          .text(subtitle, PAGE.margin, top + 18, { width: contentWidth })
      }
      const dividerY = top + (subtitle ? 34 : 21)
      doc
        .moveTo(PAGE.margin, dividerY)
        .lineTo(PAGE.width - PAGE.margin, dividerY)
        .lineWidth(0.6)
        .strokeColor(COLORS.line)
        .stroke()
      doc.y = dividerY + 10
    }

    const drawTable = <T,>(columns: TableColumn<T>[], rows: T[], emptyLabel = 'No data') => {
      const rowHeight = 22
      const headerHeight = 24

      const drawHeader = () => {
        ensureSpace(headerHeight + rowHeight)
        const top = doc.y
        doc.rect(PAGE.margin, top, contentWidth, headerHeight).fill(COLORS.ink)
        let x = PAGE.margin
        columns.forEach((column) => {
          doc
            .font('Helvetica-Bold')
            .fontSize(7.5)
            .fillColor(COLORS.paper)
            .text(column.label, x + 5, top + 8, {
              width: column.width - 10,
              align: column.align || 'left',
              lineBreak: false,
            })
          x += column.width
        })
        doc.y = top + headerHeight
      }

      drawHeader()
      if (rows.length === 0) {
        const top = doc.y
        doc
          .rect(PAGE.margin, top, contentWidth, rowHeight)
          .fill(COLORS.panel)
          .font('Helvetica-Oblique')
          .fontSize(8)
          .fillColor(COLORS.muted)
          .text(emptyLabel, PAGE.margin + 6, top + 7, { width: contentWidth - 12 })
        doc.y = top + rowHeight + 8
        return
      }

      rows.forEach((row, rowIndex) => {
        if (doc.y + rowHeight > PAGE.height - 55) {
          addPage(true)
          drawHeader()
        }
        const top = doc.y
        doc
          .rect(PAGE.margin, top, contentWidth, rowHeight)
          .fill(rowIndex % 2 === 0 ? COLORS.paper : COLORS.panel)
        let x = PAGE.margin
        columns.forEach((column) => {
          doc
            .font('Helvetica')
            .fontSize(7.5)
            .fillColor(COLORS.ink)
            .text(column.value(row), x + 5, top + 7, {
              width: column.width - 10,
              align: column.align || 'left',
              lineBreak: false,
              ellipsis: true,
            })
          x += column.width
        })
        doc
          .moveTo(PAGE.margin, top + rowHeight)
          .lineTo(PAGE.width - PAGE.margin, top + rowHeight)
          .lineWidth(0.35)
          .strokeColor(COLORS.line)
          .stroke()
        doc.y = top + rowHeight
      })
      doc.y += 8
    }

    const drawRankList = (
      title: string,
      agents: ProductivityAgentReport[],
      metric: (agent: ProductivityAgentReport) => string,
      x: number,
      y: number,
      width: number
    ) => {
      doc.roundedRect(x, y, width, 94, 5).fill(COLORS.panel)
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(COLORS.muted)
        .text(title.toUpperCase(), x + 10, y + 9, { width: width - 20 })
      agents.forEach((agent, index) => {
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor(COLORS.ink)
          .text(`${index + 1}. ${agent.name}`, x + 10, y + 29 + index * 19, {
            width: width - 62,
            ellipsis: true,
            lineBreak: false,
          })
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor(COLORS.primary)
          .text(metric(agent), x + width - 54, y + 29 + index * 19, {
            width: 44,
            align: 'right',
            lineBreak: false,
          })
      })
      if (agents.length === 0) {
        doc
          .font('Helvetica-Oblique')
          .fontSize(8)
          .fillColor(COLORS.muted)
          .text('No agents', x + 10, y + 34)
      }
    }

    addPage()

    doc
      .font('Helvetica-Bold')
      .fontSize(25)
      .fillColor(COLORS.ink)
      .text('Team Productivity Report', PAGE.margin, 72)
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(COLORS.muted)
      .text(`${formatDate(report.shiftDate)}  ·  ${report.scopeLabel}`, PAGE.margin, 106)
      .text(`Generated ${formatTimestamp(report.generatedAt)} (Asia/Manila)`, PAGE.margin, 121)
    doc.y = 155

    const cards = [
      ['TICKETS', String(report.team.totalTickets)],
      ['AGENTS', String(report.team.agents)],
      ['TEAM TPH', report.team.averageTph.toFixed(1)],
      ['ACTIVE TIME', report.team.activeDuration],
    ]
    const cardGap = 8
    const cardWidth = (contentWidth - cardGap * 3) / 4
    const cardsTop = doc.y
    cards.forEach(([label, value], index) => {
      const x = PAGE.margin + index * (cardWidth + cardGap)
      doc.roundedRect(x, cardsTop, cardWidth, 64, 6).fill(index === 2 ? COLORS.primary : COLORS.panel)
      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .fillColor(index === 2 ? COLORS.primaryLight : COLORS.muted)
        .text(label, x + 10, cardsTop + 11, { width: cardWidth - 20 })
      doc
        .font('Helvetica-Bold')
        .fontSize(index === 3 ? 15 : 20)
        .fillColor(index === 2 ? COLORS.paper : COLORS.ink)
        .text(value, x + 10, cardsTop + 30, { width: cardWidth - 20, lineBreak: false })
    })
    doc.y = cardsTop + 84

    sectionTitle('Status breakdown')
    const statusEntries = Object.entries(report.team.statusCounts).sort(
      ([first], [second]) => first.localeCompare(second)
    )
    const statusMax = Math.max(1, ...statusEntries.map(([, count]) => count))
    statusEntries.forEach(([status, count]) => {
      ensureSpace(25)
      const top = doc.y
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(COLORS.ink)
        .text(status, PAGE.margin, top + 2, { width: 75 })
      doc.roundedRect(PAGE.margin + 80, top, 360, 12, 3).fill(COLORS.panel)
      doc
        .roundedRect(PAGE.margin + 80, top, Math.max(3, (count / statusMax) * 360), 12, 3)
        .fill(COLORS.primary)
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(COLORS.ink)
        .text(String(count), PAGE.margin + 448, top + 2, { width: 55, align: 'right' })
      doc.y = top + 20
    })
    if (statusEntries.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(8).fillColor(COLORS.muted).text('No tickets found.')
      doc.y += 8
    }

    sectionTitle(
      'Performance leaders',
      'Volume and TPH rankings are independent; bottom lists include the lowest active agents.'
    )
    ensureSpace(210)
    let rankY = doc.y
    const rankWidth = (contentWidth - 10) / 2
    drawRankList(
      'Top 3 · Volume',
      report.performers.topByVolume,
      (agent) => `${agent.totalTickets}`,
      PAGE.margin,
      rankY,
      rankWidth
    )
    drawRankList(
      'Bottom 3 · Volume',
      report.performers.bottomByVolume,
      (agent) => `${agent.totalTickets}`,
      PAGE.margin + rankWidth + 10,
      rankY,
      rankWidth
    )
    rankY += 104
    drawRankList(
      'Top 3 · TPH',
      report.performers.topByTph,
      (agent) => agent.tph.toFixed(1),
      PAGE.margin,
      rankY,
      rankWidth
    )
    drawRankList(
      'Bottom 3 · TPH',
      report.performers.bottomByTph,
      (agent) => agent.tph.toFixed(1),
      PAGE.margin + rankWidth + 10,
      rankY,
      rankWidth
    )
    doc.y = rankY + 112

    sectionTitle(
      'Resolution leaders',
      'Ranked by solved ticket volume, then solved share of solved + pending tickets.'
    )
    drawTable(
      [
        { label: 'AGENT', width: 230, value: (agent) => agent.name },
        { label: 'SOLVED', width: 80, align: 'right', value: (agent) => String(agent.solvedTickets) },
        { label: 'PENDING', width: 80, align: 'right', value: (agent) => String(agent.pendingTickets) },
        {
          label: 'RESOLUTION',
          width: contentWidth - 390,
          align: 'right',
          value: (agent) => `${agent.resolutionRate.toFixed(1)}%`,
        },
      ],
      report.performers.resolutionLeaders
    )

    sectionTitle('Peak vs. off-peak productivity', 'Team ticket volume by Asia/Manila shift hour.')
    ensureSpace(175)
    const chartTop = doc.y + 8
    const chartHeight = 115
    const chartBottom = chartTop + chartHeight
    const maxHourly = Math.max(1, ...report.hourlyVolume.map((hour) => hour.tickets))
    const barGap = 4
    const barWidth = (contentWidth - barGap * (report.hourlyVolume.length - 1)) / report.hourlyVolume.length
    report.hourlyVolume.forEach((hour, index) => {
      const height = (hour.tickets / maxHourly) * chartHeight
      const x = PAGE.margin + index * (barWidth + barGap)
      doc
        .roundedRect(x, chartBottom - height, barWidth, Math.max(1, height), 2)
        .fill(hour.tickets === maxHourly ? COLORS.primary : '#91A6E8')
      doc
        .font('Helvetica')
        .fontSize(5.5)
        .fillColor(COLORS.muted)
        .text(hour.hour, x - 2, chartBottom + 6, { width: barWidth + 4, align: 'center' })
    })
    doc.y = chartBottom + 27
    const peakLabel = report.peakHours
      .map((hour) => `${formatHour(hour.hour)} (${hour.tickets})`)
      .join('  ·  ')
    const offPeakLabel = report.offPeakHours
      .map((hour) => `${formatHour(hour.hour)} (${hour.tickets})`)
      .join('  ·  ')
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.green).text(`PEAK  ${peakLabel}`)
    doc.moveDown(0.3)
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.amber).text(`OFF-PEAK  ${offPeakLabel}`)
    doc.y += 12

    sectionTitle(
      'Performance distribution',
      `High ≥ ${report.tierThresholds.highTph.toFixed(1)} TPH · Meeting ≥ ${report.tierThresholds.meetingTph.toFixed(1)} TPH · thresholds are 120% / 80% of team TPH.`
    )
    ensureSpace(90)
    const tierData = [
      ['High', report.tiers.High.length, COLORS.green],
      ['Meeting Expectations', report.tiers['Meeting Expectations'].length, COLORS.primary],
      ['Underperforming', report.tiers.Underperforming.length, COLORS.red],
    ] as const
    const tierWidth = (contentWidth - 16) / 3
    const tiersTop = doc.y
    tierData.forEach(([label, count, color], index) => {
      const x = PAGE.margin + index * (tierWidth + 8)
      doc.roundedRect(x, tiersTop, tierWidth, 58, 5).fill(COLORS.panel)
      doc.circle(x + 20, tiersTop + 28, 7).fill(color)
      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor(COLORS.ink)
        .text(String(count), x + 35, tiersTop + 13, { width: 30 })
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(COLORS.muted)
        .text(label, x + 35, tiersTop + 34, { width: tierWidth - 45 })
    })
    doc.y = tiersTop + 76

    sectionTitle(
      'Consecutive zero-ticket hours',
      'Only gaps of 2+ whole hourly buckets between each agent’s first and last ticket are shown.'
    )
    const downtimeRows = report.downtime.flatMap((agent) =>
      agent.windows.map((window) => ({
        name: agent.name,
        start: formatTimestamp(window.start),
        end: formatTimestamp(window.end),
        hours: window.hours,
      }))
    )
    drawTable(
      [
        { label: 'AGENT', width: 190, value: (row) => row.name },
        { label: 'START', width: 125, value: (row) => row.start },
        { label: 'END', width: 125, value: (row) => row.end },
        {
          label: 'HOURS',
          width: contentWidth - 440,
          align: 'right',
          value: (row) => String(row.hours),
        },
      ],
      downtimeRows,
      'No qualifying downtime windows detected.'
    )

    sectionTitle('Hourly heatmap', 'Counts by agent and shift hour; gray cells indicate zero tickets.')
    const nameWidth = 116
    const totalWidth = 35
    const cellWidth = (contentWidth - nameWidth - totalWidth) / PRODUCTIVITY_SHIFT_HOURS.length
    const maxAgentHour = Math.max(
      1,
      ...report.agents.flatMap((agent) => Object.values(agent.hourlyCounts))
    )

    const drawHeatHeader = () => {
      ensureSpace(42)
      const top = doc.y
      doc.rect(PAGE.margin, top, contentWidth, 27).fill(COLORS.ink)
      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .fillColor(COLORS.paper)
        .text('AGENT', PAGE.margin + 4, top + 10, { width: nameWidth - 8 })
      PRODUCTIVITY_SHIFT_HOURS.forEach((hour, index) => {
        doc
          .font('Helvetica-Bold')
          .fontSize(5)
          .fillColor(COLORS.paper)
          .text(hour, PAGE.margin + nameWidth + index * cellWidth, top + 10, {
            width: cellWidth,
            align: 'center',
          })
      })
      doc
        .font('Helvetica-Bold')
        .fontSize(6)
        .fillColor(COLORS.paper)
        .text('TOTAL', PAGE.margin + nameWidth + cellWidth * PRODUCTIVITY_SHIFT_HOURS.length, top + 10, {
          width: totalWidth,
          align: 'center',
        })
      doc.y = top + 27
    }

    drawHeatHeader()
    report.agents.forEach((agent, rowIndex) => {
      if (doc.y + 20 > PAGE.height - 55) {
        addPage(true)
        drawHeatHeader()
      }
      const top = doc.y
      doc.rect(PAGE.margin, top, nameWidth, 20).fill(rowIndex % 2 ? COLORS.panel : COLORS.paper)
      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor(COLORS.ink)
        .text(agent.name, PAGE.margin + 4, top + 7, {
          width: nameWidth - 8,
          lineBreak: false,
          ellipsis: true,
        })
      PRODUCTIVITY_SHIFT_HOURS.forEach((hour, index) => {
        const count = agent.hourlyCounts[hour] || 0
        const x = PAGE.margin + nameWidth + index * cellWidth
        doc.rect(x + 0.5, top + 1, cellWidth - 1, 18).fill(heatColor(count, maxAgentHour))
        doc
          .font('Helvetica-Bold')
          .fontSize(5.5)
          .fillColor(COLORS.ink)
          .text(String(count), x, top + 7, { width: cellWidth, align: 'center' })
      })
      const totalX = PAGE.margin + nameWidth + cellWidth * PRODUCTIVITY_SHIFT_HOURS.length
      doc.rect(totalX, top, totalWidth, 20).fill(COLORS.primaryLight)
      doc
        .font('Helvetica-Bold')
        .fontSize(6)
        .fillColor(COLORS.primary)
        .text(String(agent.totalTickets), totalX, top + 7, { width: totalWidth, align: 'center' })
      doc.y = top + 20
    })
    if (report.agents.length === 0) {
      const top = doc.y
      doc
        .font('Helvetica-Oblique')
        .fontSize(8)
        .fillColor(COLORS.muted)
        .text('No agent activity for this shift.', PAGE.margin, top + 8)
      doc.y = top + 28
    }
    doc.y += 12

    sectionTitle('Agent detail')
    drawTable(
      [
        { label: 'AGENT', width: 156, value: (agent) => agent.name },
        {
          label: 'TICKETS',
          width: 55,
          align: 'right',
          value: (agent) => String(agent.totalTickets),
        },
        { label: 'TPH', width: 50, align: 'right', value: (agent) => agent.tph.toFixed(1) },
        { label: 'ACTIVE', width: 70, align: 'right', value: (agent) => agent.activeDuration },
        {
          label: 'SOLVED / PENDING',
          width: 90,
          align: 'right',
          value: (agent) => `${agent.solvedTickets} / ${agent.pendingTickets}`,
        },
        {
          label: 'TIER',
          width: contentWidth - 421,
          value: (agent) => agent.tier,
        },
      ],
      report.agents
    )

    const range = doc.bufferedPageRange()
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index)
      doc
        .moveTo(PAGE.margin, PAGE.height - 39)
        .lineTo(PAGE.width - PAGE.margin, PAGE.height - 39)
        .lineWidth(0.5)
        .strokeColor(COLORS.line)
        .stroke()
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(COLORS.muted)
        .text(
          'Confidential · Internal management report',
          PAGE.margin,
          PAGE.height - 30,
          { width: contentWidth / 2 }
        )
      doc.text(`Page ${index + 1} of ${range.count}`, PAGE.margin, PAGE.height - 30, {
        width: contentWidth,
        align: 'right',
      })
    }

    doc.end()
  })
