import { describe, it, expect } from 'vitest'
import {
  healthAction,
  parkedProviders,
} from '@/services/provider-health-monitor'

/*
 * `logger.error` STOPPED BEING A LOG LINE AND BECAME A PUSH NOTIFICATION.
 *
 * The health monitor logged "Provider X is DOWN" on EVERY poll -- 288 times a
 * day for a provider that has been down for weeks. Harmless while `error` only
 * reached a file. The moment the owner's channel was switched on (#2235/#2236),
 * winston began forwarding every `error` to their private chat, and the owner
 * got a notification every five minutes about a condition they already knew.
 *
 * The monitor's OWN alert was already correct -- it fires on the transition
 * only. The flood came from a second, undesigned channel shouting past it. So
 * nothing here adds deduplication; it stops the console line from paging.
 */
describe('a repeating error log is now a pager', () => {
  it('pages once when a provider goes down', () => {
    expect(healthAction({ available: true }, { available: false })).toBe('page')
    expect(healthAction(undefined, { available: false })).toBe('page')
  })

  it('says nothing new while it stays down -- the record, not the alarm', () => {
    expect(healthAction({ available: false }, { available: false })).toBe(
      'still'
    )
  })

  it('says so when it comes back, and stays quiet while it is fine', () => {
    expect(healthAction({ available: false }, { available: true })).toBe(
      'recovered'
    )
    expect(healthAction({ available: true }, { available: true })).toBe('ok')
  })

  it('a provider the owner parked is not watched, and the list is explicit', () => {
    // The owner was asked whether ElevenLabs is still needed and answered "not
    // now, maybe later". So the calling code stays and the alarm stops -- a
    // decision that lives in the deploy, because it is the kind that changes.
    expect([
      ...parkedProviders({ HEALTH_SKIP_PROVIDERS: 'elevenlabs' }),
    ]).toEqual(['elevenlabs'])
    expect([
      ...parkedProviders({ HEALTH_SKIP_PROVIDERS: ' ElevenLabs , zai ' }),
    ]).toEqual(['elevenlabs', 'zai'])
  })

  it('nothing is parked by default: silence must be chosen, never inherited', () => {
    expect(parkedProviders({}).size).toBe(0)
    expect(parkedProviders({ HEALTH_SKIP_PROVIDERS: '' }).size).toBe(0)
    expect(parkedProviders({ HEALTH_SKIP_PROVIDERS: ' , , ' }).size).toBe(0)
  })

  it('an unknown provider that is UP is not announced as a recovery', () => {
    // The first poll of a healthy provider must not look like good news.
    expect(healthAction(undefined, { available: true })).toBe('ok')
  })
})
