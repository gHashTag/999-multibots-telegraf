/**
 * THE PERSON'S OWN DRIVING IS NOT FILMED.
 *
 * 2026-10-03, read against ChatGPT agent ("no screenshots while you control
 * the browser"): our film ticker kept taking the whole screen every two
 * seconds for TICK_IDLE_MS after the agent's last step, whoever was driving.
 * A person who took the wheel in that window to open their mail or sign in
 * was filmed, and the frames went into the agent's report.
 */
import { describe, it, expect } from 'vitest'
import { tickMayFilm } from './src/browser/agent-tools'
import { WHEEL_LEASE_MS } from './src/browser/sessions'

const NOW = Date.parse('2026-10-03T01:30:00Z')
const live = {
  state: 'live',
  endpoint: 'pod.internal:8080',
  personWheelUntilMs: null,
} as const

describe('the film ticker and the wheel', () => {
  it('films while the agent holds the wheel', () => {
    expect(tickMayFilm(live, NOW)).toBe('film')
  })

  it('stops the moment the person holds it', () => {
    expect(
      tickMayFilm({ ...live, personWheelUntilMs: NOW + WHEEL_LEASE_MS }, NOW)
    ).toBe('stop')
  })

  it('films again once the lease has run out', () => {
    expect(tickMayFilm({ ...live, personWheelUntilMs: NOW - 1 }, NOW)).toBe(
      'film'
    )
  })

  it('skips, without stopping, when there is nothing to film yet', () => {
    expect(tickMayFilm(null, NOW)).toBe('skip')
    expect(tickMayFilm({ ...live, state: 'starting' }, NOW)).toBe('skip')
    expect(tickMayFilm({ ...live, endpoint: null }, NOW)).toBe('skip')
  })
})
