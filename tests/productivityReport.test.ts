import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PRODUCTIVITY_SHIFT_HOURS,
  aggregateProductivityReport,
} from '../lib/productivityReport.ts'
import { generateProductivityReportPdf } from '../lib/productivityReportPdf.ts'

const ticket = (
  ticket_num: number,
  agent: string,
  status: string,
  created_at: string
) => ({
  ticket_num,
  agent,
  status,
  created_at,
  shift_date: '2026-07-27',
})

describe('aggregateProductivityReport', () => {
  it('joins display names and computes pooled team, status, ranking, and hourly metrics', () => {
    const report = aggregateProductivityReport({
      shiftDate: '2026-07-27',
      generatedAt: '2026-07-28T02:00:00.000Z',
      scopeLabel: 'All teams',
      namesByEmail: new Map([
        ['alice@example.com', 'Alice Rivera'],
        ['bob@example.com', 'Bob Santos'],
      ]),
      tickets: [
        ticket(1, 'alice@example.com', 'Solved', '2026-07-27T10:10:00.000Z'),
        ticket(2, 'alice@example.com', 'Pending', '2026-07-27T13:05:00.000Z'),
        ticket(3, 'bob@example.com', 'open', '2026-07-27T11:00:00.000Z'),
        ticket(4, 'bob@example.com', 'resolved', '2026-07-27T12:00:00.000Z'),
      ],
    })

    assert.equal(report.team.totalTickets, 4)
    assert.equal(report.team.agents, 2)
    assert.equal(report.team.statusCounts.Solved, 2)
    assert.equal(report.team.statusCounts.Pending, 1)
    assert.equal(report.team.statusCounts.Open, 1)
    assert.equal(report.team.activeDurationMinutes, 220)
    assert.equal(report.team.averageTph, 1.1)

    const alice = report.agents.find((agent) => agent.email === 'alice@example.com')
    assert.ok(alice)
    assert.equal(alice.name, 'Alice Rivera')
    assert.equal(alice.resolutionRate, 50)
    assert.equal(alice.hourlyCounts['18'], 1)
    assert.equal(alice.hourlyCounts['21'], 1)

    assert.equal(report.performers.topByTph[0].name, 'Bob Santos')
    assert.equal(report.performers.resolutionLeaders[0].name, 'Bob Santos')
    assert.deepEqual(
      report.hourlyVolume.map((hour) => hour.hour),
      PRODUCTIVITY_SHIFT_HOURS
    )
  })

  it('detects only 2+ zero-hour runs inside the first-to-last ticket window', () => {
    const report = aggregateProductivityReport({
      shiftDate: '2026-07-27',
      generatedAt: '2026-07-28T02:00:00.000Z',
      scopeLabel: 'All teams',
      namesByEmail: new Map([['alice@example.com', 'Alice Rivera']]),
      tickets: [
        // Asia/Manila: 6:10 PM and 9:05 PM. Only 7 PM and 8 PM are zero.
        ticket(1, 'alice@example.com', 'Solved', '2026-07-27T10:10:00.000Z'),
        ticket(2, 'alice@example.com', 'Solved', '2026-07-27T13:05:00.000Z'),
      ],
    })

    assert.equal(report.downtime.length, 1)
    assert.equal(report.downtime[0].windows.length, 1)
    assert.equal(report.downtime[0].windows[0].hours, 2)
    assert.equal(report.downtime[0].windows[0].start, '2026-07-27T11:00:00.000Z')
    assert.equal(report.downtime[0].windows[0].end, '2026-07-27T13:00:00.000Z')
  })

  it('handles active windows that cross midnight without treating the date boundary as a break', () => {
    const report = aggregateProductivityReport({
      shiftDate: '2026-07-27',
      generatedAt: '2026-07-28T02:00:00.000Z',
      scopeLabel: 'Night team',
      namesByEmail: new Map(),
      tickets: [
        // Asia/Manila: 11:05 PM and 2:01 AM on the following calendar day.
        ticket(1, 'night.agent@example.com', 'Open', '2026-07-27T15:05:00.000Z'),
        ticket(2, 'night.agent@example.com', 'Solved', '2026-07-27T18:01:00.000Z'),
      ],
    })

    assert.equal(report.agents[0].hourlyCounts['23'], 1)
    assert.equal(report.agents[0].hourlyCounts['02'], 1)
    assert.equal(report.agents[0].downtime[0].hours, 2)
    assert.equal(report.agents[0].name, 'Night Agent')
  })

  it('renders a valid PDF buffer for populated report data', async () => {
    const report = aggregateProductivityReport({
      shiftDate: '2026-07-27',
      generatedAt: '2026-07-28T02:00:00.000Z',
      scopeLabel: 'All teams',
      namesByEmail: new Map([['alice@example.com', 'Alice Rivera']]),
      tickets: [
        ticket(1, 'alice@example.com', 'Solved', '2026-07-27T10:10:00.000Z'),
        ticket(2, 'alice@example.com', 'Pending', '2026-07-27T13:05:00.000Z'),
      ],
    })

    const pdf = await generateProductivityReportPdf(report)

    assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-')
    assert.ok(pdf.byteLength > 5_000)
  })
})
