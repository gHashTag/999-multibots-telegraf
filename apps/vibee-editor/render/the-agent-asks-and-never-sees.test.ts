/**
 * Owner, 2026-09-22: "the agent, knowing something has to be entered, should
 * show the input it needs, and do everything else once it has the passwords".
 * The agent asks; the person types through their own door; the agent learns
 * that it came -- how long, into what -- and never the text.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  askForInput,
  pendingInput,
  markTyped,
  waitForTyped,
  inputRequestView,
  asKind,
  resetInputRequestsForTests,
  INPUT_REQUEST_TTL_MS,
} from './src/browser/input-request'
import { stepOf } from './src/browser/journal'

const WHO = '9000000031'
const ask = (id = 'r1', now = 1000) =>
  askForInput(
    WHO,
    {
      id,
      kind: 'password',
      why: 'to sign in to the mail',
      host: 'accounts.example.com',
      label: 'Password',
    },
    now
  )

beforeEach(() => resetInputRequestsForTests())

describe('the request on the person screen', () => {
  it('is open until the person types, then answered with length and field only', () => {
    ask()
    expect(pendingInput(WHO, 2000)?.id).toBe('r1')
    markTyped(WHO, { chars: 12, field: 'password', enter: true }, 3000)
    expect(pendingInput(WHO, 3001)).toBeNull()
  })

  it('goes stale, and a stale one is not answered', () => {
    ask('r1', 0)
    expect(pendingInput(WHO, INPUT_REQUEST_TTL_MS + 1)).toBeNull()
    markTyped(
      WHO,
      { chars: 3, field: 'text', enter: false },
      INPUT_REQUEST_TTL_MS + 1
    )
  })

  it('the view carries the agent words and the place, nothing else', () => {
    const v = inputRequestView(ask())
    expect(Object.keys(v!).sort()).toEqual([
      'host',
      'id',
      'kind',
      'label',
      'why',
    ])
  })

  it('an unknown kind is plain text', () => {
    expect(asKind('ssn')).toBe('text')
    expect(asKind('code')).toBe('code')
  })
})

describe('the agent waits in the same turn', () => {
  it('learns THAT it was typed, and goes on', async () => {
    const r = ask('r2', Date.now())
    let slept = 0
    const got = await waitForTyped(WHO, r.id, 60_000, 10, async () => {
      slept += 1
      if (slept === 2)
        markTyped(WHO, { chars: 9, field: 'password', enter: true })
    })
    expect(got).toMatchObject({ chars: 9, field: 'password', enter: true })
    expect(JSON.stringify(got)).not.toMatch(/text|value/)
  })

  it('gives up when time is up, without an answer', async () => {
    const r = ask('r3', Date.now())
    expect(await waitForTyped(WHO, r.id, 0)).toBeNull()
  })

  it('stops waiting when a newer request replaced it', async () => {
    const r = ask('r4', Date.now())
    ask('r5', Date.now())
    expect(await waitForTyped(WHO, r.id, 60_000, 1, async () => {})).toBeNull()
  })
})

describe('the journal of the ask', () => {
  it('keeps what was asked and whether it came, never a typed value', () => {
    const step = stepOf(
      'browser_ask_input',
      { kind: 'password', why: 'to sign in' },
      { result: { typed: true, chars: 12 } },
      5
    )
    expect(step.detail).toEqual({
      kind: 'password',
      what: 'to sign in',
      typed: true,
      chars: 12,
    })
  })
})
