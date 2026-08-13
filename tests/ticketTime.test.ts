import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  convertTwelveHourTimeToDatabaseTime,
  getCurrentManilaTime,
  normalizeDatabaseTime,
} from '../lib/ticketTime.ts'

describe('ticket completion time', () => {
  it('defaults to the current Philippine time in 12-hour format', () => {
    assert.deepEqual(getCurrentManilaTime(new Date('2026-08-12T00:05:00.000Z')), {
      time: '8:05',
      meridiem: 'AM',
    })
    assert.deepEqual(getCurrentManilaTime(new Date('2026-08-12T08:45:00.000Z')), {
      time: '4:45',
      meridiem: 'PM',
    })
  })

  it('converts 12-hour user input to the database time format', () => {
    assert.equal(convertTwelveHourTimeToDatabaseTime('12:00', 'AM'), '00:00:00')
    assert.equal(convertTwelveHourTimeToDatabaseTime('12:00', 'PM'), '12:00:00')
    assert.equal(convertTwelveHourTimeToDatabaseTime(' 4:07 ', 'PM'), '16:07:00')
  })

  it('rejects invalid user and API time values', () => {
    assert.equal(convertTwelveHourTimeToDatabaseTime('0:15', 'AM'), null)
    assert.equal(convertTwelveHourTimeToDatabaseTime('13:15', 'PM'), null)
    assert.equal(convertTwelveHourTimeToDatabaseTime('9:60', 'AM'), null)
    assert.equal(normalizeDatabaseTime('16:07'), '16:07:00')
    assert.equal(normalizeDatabaseTime('24:00:00'), null)
    assert.equal(normalizeDatabaseTime('4:07 PM'), null)
  })
})
