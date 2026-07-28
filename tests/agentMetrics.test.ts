import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { calculateAgentMetrics } from '../lib/tphProductivity.ts'

const makeTickets = (ticketCount: number, rawDurationMinutes: number) => {
  const start = Date.parse('2026-01-01T00:00:00.000Z')
  const end = start + rawDurationMinutes * 60 * 1000

  return Array.from({ length: ticketCount }, (_, index) => ({
    created_at: new Date(index === ticketCount - 1 ? end : start).toISOString(),
  }))
}

describe('calculateAgentMetrics', () => {
  it('does not deduct time below 2 hours', () => {
    const metrics = calculateAgentMetrics(makeTickets(10, 90))

    assert.equal(metrics.rawDurationMinutes, 90)
    assert.equal(metrics.deductionMinutes, 0)
    assert.equal(metrics.netDurationMinutes, 90)
    assert.equal(metrics.formattedNetDuration, '1h 30m')
    assert.equal(metrics.tph, 6.7)
  })

  it('deducts one 15-minute break from 2 hours to below 4 hours', () => {
    const metrics = calculateAgentMetrics(makeTickets(10, 180))

    assert.equal(metrics.rawDurationMinutes, 180)
    assert.equal(metrics.deductionMinutes, 15)
    assert.equal(metrics.netDurationMinutes, 165)
    assert.equal(metrics.formattedNetDuration, '2h 45m')
    assert.equal(metrics.tph, 3.6)
  })

  it('deducts lunch and one break from 4 hours to below 6 hours', () => {
    const metrics = calculateAgentMetrics(makeTickets(10, 300))

    assert.equal(metrics.rawDurationMinutes, 300)
    assert.equal(metrics.deductionMinutes, 75)
    assert.equal(metrics.netDurationMinutes, 225)
    assert.equal(metrics.formattedNetDuration, '3h 45m')
    assert.equal(metrics.tph, 2.7)
  })

  it('deducts lunch and two breaks at 6 hours and above', () => {
    const metrics = calculateAgentMetrics(makeTickets(10, 420))

    assert.equal(metrics.rawDurationMinutes, 420)
    assert.equal(metrics.deductionMinutes, 90)
    assert.equal(metrics.netDurationMinutes, 330)
    assert.equal(metrics.formattedNetDuration, '5h 30m')
    assert.equal(metrics.tph, 1.8)
  })

  it('handles empty and zero-elapsed ticket sets without division errors', () => {
    assert.deepEqual(calculateAgentMetrics([]), {
      rawDurationMinutes: 0,
      deductionMinutes: 0,
      netDurationMinutes: 0,
      formattedNetDuration: '0h 0m',
      tph: 0,
    })

    const singleTicketMetrics = calculateAgentMetrics(makeTickets(1, 0))
    assert.equal(singleTicketMetrics.netDurationMinutes, 1)
    assert.equal(singleTicketMetrics.tph, 60)
  })
})
