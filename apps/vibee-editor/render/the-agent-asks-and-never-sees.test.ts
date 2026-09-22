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
  optionsFor,
  markChosen,
  waitForAnswer,
} from './src/browser/input-request'
import { askText } from './src/browser/agent-tools'
import { handleBrowser, type BrowserDeps } from './src/browser/routes'
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
      'options',
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

describe('a choice, and something only the person can do (owner: "buttons for every case")', () => {
  const choose = (id = 'c1', now = Date.now()) =>
    askForInput(
      WHO,
      {
        id,
        kind: 'choice',
        why: 'Skip or save the home address?',
        host: 'gds.example.com',
        label: '',
        options: optionsFor('choice', ['Skip', 'Save']),
      },
      now
    )

  it('a choice needs two real options; action brings its own two', () => {
    expect(optionsFor('choice', [' Skip ', 'Save', 'Save', '', 7])).toEqual([
      'Skip',
      'Save',
    ])
    expect(() => optionsFor('choice', ['only one'])).toThrow('at least two')
    expect(optionsFor('action', undefined)).toEqual(['done', 'cannot'])
    expect(optionsFor('password', ['x', 'y'])).toEqual([])
    expect(optionsFor('choice', ['a', 'b', 'c', 'd', 'e'])).toHaveLength(4)
  })

  it('the person presses only an offered option, only once, and the agent gets it', async () => {
    const r = choose()
    expect(markChosen(WHO, r.id, 'Delete everything')).toBe(false)
    expect(markChosen(WHO, 'other-id', 'Skip')).toBe(false)
    expect(markChosen(WHO, r.id, 'Skip')).toBe(true)
    expect(markChosen(WHO, r.id, 'Save')).toBe(false)
    expect(pendingInput(WHO)).toBeNull()
    expect((await waitForAnswer(WHO, r.id, 0))?.chosen?.option).toBe('Skip')
  })

  it('typing does not answer a choice', () => {
    const r = choose()
    markTyped(WHO, { chars: 4, field: 'text', enter: false })
    expect(pendingInput(WHO)?.id).toBe(r.id)
  })

  it('a stale choice cannot be pressed', () => {
    const r = choose('c2', 0)
    expect(markChosen(WHO, r.id, 'Skip', INPUT_REQUEST_TTL_MS + 1)).toBe(false)
  })

  it('Telegram says what kind of help is needed', () => {
    expect(askText('choice', 'Skip or save?', 'gds.example.com')).toMatch(
      /решение/
    ) // cyrillic-ok: asserting text
    expect(askText('action', 'Confirm on your phone', '')).toMatch(/Готово/) // cyrillic-ok: asserting text
    expect(askText('password', 'Sign in', 'accounts.example.com')).toMatch(
      /пароль/
    ) // cyrillic-ok: asserting text
  })

  describe('POST /api/browser/choose', () => {
    const d = (actor: 'person' | 'agent', body: unknown): BrowserDeps => ({
      getPool: async () => ({ query: async () => ({ rows: [] }) }) as never,
      identity: () => WHO,
      driver: { name: 'fake' } as never,
      newToken: () => 't',
      actor: () => actor,
      readBody: async () => JSON.stringify(body),
    })
    const post = (actor: 'person' | 'agent', body: unknown) =>
      handleBrowser(
        { url: '/api/browser/choose', method: 'POST' },
        d(actor, body)
      )

    it('REFUSES an agent key: the agent cannot answer its own question', async () => {
      const r = choose()
      expect((await post('agent', { id: r.id, option: 'Skip' })).status).toBe(
        403
      )
      expect(pendingInput(WHO)?.id).toBe(r.id)
    })

    it('takes the person press once; an unknown option or a second press is 409', async () => {
      const r = choose()
      expect((await post('person', { id: r.id, option: 'Nope' })).status).toBe(
        409
      )
      expect((await post('person', { id: r.id, option: 'Save' })).status).toBe(
        200
      )
      expect((await post('person', { id: r.id, option: 'Skip' })).status).toBe(
        409
      )
    })
  })
})
