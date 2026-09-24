import { describe, it, expect } from 'vitest'
import {
  stepOf,
  scenarioOf,
  carriesASecret,
  runScenario,
  stepInWords,
  SCENARIOS,
  MAX_STEPS,
  type ScenarioIo,
} from './scenarios'

function io(over: Partial<ScenarioIo> = {}): ScenarioIo & { said: string[] } {
  const said: string[] = []
  return {
    said,
    open: async url => void said.push(`open ${url}`),
    press: async words => {
      said.push(`press ${words}`)
      return words
    },
    type: async text => void said.push(`type ${text.length}`),
    ask: async (kind, why) => {
      said.push(`ask ${kind}`)
      return true
    },
    read: async () => 'the page says Google and other things',
    wait: async ms => void said.push(`wait ${ms}`),
    ...over,
  }
}

describe('what counts as a step', () => {
  it('only https for open, and only the kinds we can ask for', () => {
    expect(stepOf({ do: 'open', url: 'https://x.com/home' })).toEqual({
      do: 'open',
      url: 'https://x.com/home',
    })
    expect(stepOf({ do: 'open', url: 'javascript:alert(1)' })).toBeNull()
    expect(stepOf({ do: 'ask', kind: 'nope', why: 'x' })).toBeNull()
    expect(stepOf({ do: 'ask', kind: 'password', why: 'Apple ID' })).toEqual({
      do: 'ask',
      kind: 'password',
      why: 'Apple ID',
    })
  })

  it('a wait is bounded, and rubbish is not a step', () => {
    expect(stepOf({ do: 'wait', ms: 10 ** 9 })).toEqual({
      do: 'wait',
      ms: 30_000,
    })
    expect(stepOf({ do: 'dance' })).toBeNull()
    expect(stepOf(null)).toBeNull()
  })

  it('a scenario needs an id and at least one step, and is bounded', () => {
    expect(
      scenarioOf({ id: '', steps: [{ do: 'press', words: 'x' }] })
    ).toBeNull()
    expect(scenarioOf({ id: 'a', steps: [] })).toBeNull()
    const many = Array.from({ length: 50 }, () => ({ do: 'wait', ms: 10 }))
    expect(scenarioOf({ id: 'a', steps: many })?.steps).toHaveLength(MAX_STEPS)
  })
})

describe('a secret is never in a scenario', () => {
  it('refuses to run one that carries a password', () => {
    const bad = {
      id: 'bad',
      name: 'bad',
      steps: [{ do: 'type' as const, text: 'my password is hunter2' }],
    }
    expect(carriesASecret(bad)).toBe(true)
  })

  it('and says so instead of running half of it', async () => {
    const world = io()
    const out = await runScenario(
      {
        id: 'bad',
        name: 'bad',
        steps: [
          { do: 'open', url: 'https://x.com/home' },
          { do: 'type', text: 'пароль: 12345' },
        ],
      },
      world
    )
    expect(out.ok).toBe(false)
    expect(out.failed).toContain('секрет')
    expect(world.said).toEqual([])
  })

  it('asking the person for one is fine: the answer never comes back here', async () => {
    const world = io()
    const out = await runScenario(
      {
        id: 'ok',
        name: 'ok',
        steps: [{ do: 'ask', kind: 'password', why: 'Apple ID' }],
      },
      world
    )
    expect(out.ok).toBe(true)
    expect(world.said).toEqual(['ask password'])
  })
})

describe('a step that fails stops the run', () => {
  it('stops at the press that found nothing, and names it', async () => {
    const out = await runScenario(
      {
        id: 'x',
        name: 'x',
        steps: [
          { do: 'open', url: 'https://x.com/home' },
          { do: 'press', words: 'Continue with Google' },
          { do: 'press', words: 'never here' },
          { do: 'type', text: 'this must not happen' },
        ],
      },
      io({
        press: async words => {
          if (words === 'never here') throw new Error('nothing says that')
          return words
        },
      })
    )
    expect(out.ok).toBe(false)
    expect(out.done).toBe(2)
    expect(out.failed).toContain('never here')
    expect(out.lines.at(-1)).toContain('✗')
  })

  it('an expectation the page does not meet is a failure, not a warning', async () => {
    const out = await runScenario(
      {
        id: 'x',
        name: 'x',
        steps: [{ do: 'expect', words: 'Apple' }],
      },
      io()
    )
    expect(out.ok).toBe(false)
    expect(out.failed).toContain('этого там нет')
  })

  it('a person who does not answer stops it too', async () => {
    const out = await runScenario(
      {
        id: 'x',
        name: 'x',
        steps: [{ do: 'ask', kind: 'code', why: 'the code from your phone' }],
      },
      io({ ask: async () => false })
    )
    expect(out.ok).toBe(false)
    expect(out.failed).toContain('не ответил')
  })
})

describe('what it does is what it says', () => {
  it('every step reads as one plain line', () => {
    expect(stepInWords({ do: 'press', words: 'Post' })).toBe('нажать «Post»')
    expect(stepInWords({ do: 'wait', ms: 6000 })).toBe('подождать 6 с')
    expect(stepInWords({ do: 'type', text: 'abc' })).toContain('3 симв.')
  })

  it('the scenarios we ship are themselves valid, and carry no secret', () => {
    for (const s of SCENARIOS) {
      expect(scenarioOf(s)).not.toBeNull()
      expect(carriesASecret(s)).toBe(false)
    }
  })
})
