import { describe, it, expect } from 'vitest'
import {
  AGENT_CHAT_CODES,
  agentChatText,
  type AgentChatEvent,
} from './agentChatText'

/**
 * A failed agent turn is reported in the reader's language: English gets no
 * Cyrillic anywhere, a Russian reader keeps the server's Russian words.
 */
const NO_ANSWER = 'модель не ответила: groq empty; cerebras empty' // cyrillic-ok: server text
const STEP_LIMIT = 'достигнут предел 24 витков вызова инструментов' // cyrillic-ok: server text

const EVERY: AgentChatEvent[] = [
  {
    kind: 'refused',
    status: 401,
    code: 'sign_in',
    error: 'не удалось определить пользователя',
  }, // cyrillic-ok: server text
  {
    kind: 'refused',
    status: 400,
    code: 'bad_request',
    error: 'тело запроса не разобрано как JSON',
  }, // cyrillic-ok: server text
  { kind: 'refused', status: 403, code: 'not_seller', error: 'not a seller' },
  { kind: 'refused', status: 418, code: 'newer_server', error: 'чайник' }, // cyrillic-ok: server text
  { kind: 'refused', status: 502 },
  { kind: 'failed', code: 'no_answer', text: NO_ANSWER },
  { kind: 'failed', code: 'internal', text: 'TypeError: x is undefined' },
  { kind: 'failed', text: 'ошибка без кода' }, // cyrillic-ok: server text
  { kind: 'stepLimit', code: 'step_limit', steps: 24, text: STEP_LIMIT },
  { kind: 'stepLimit', code: 'step_limit' },
  { kind: 'silent' },
  { kind: 'retrying' },
  { kind: 'stopped' },
  { kind: 'unreachable', detail: 'TypeError: Failed to fetch' },
]

const CYRILLIC = /\p{Script=Cyrillic}/u

describe('agentChatText', () => {
  it('has no Cyrillic in English, for every event', () => {
    for (const e of EVERY) {
      const text = agentChatText(e, 'en')
      expect(text, JSON.stringify(e)).not.toMatch(CYRILLIC)
      expect(text.length, JSON.stringify(e)).toBeGreaterThan(0)
    }
  })

  it('is Russian for a Russian reader, for every event', () => {
    for (const e of EVERY) {
      expect(agentChatText(e, 'ru'), JSON.stringify(e)).toMatch(CYRILLIC)
    }
  })

  it('every code has a sentence in both languages', () => {
    for (const [code, pair] of Object.entries(AGENT_CHAT_CODES)) {
      expect(pair.en, code).not.toMatch(CYRILLIC)
      expect(pair.ru, code).toMatch(CYRILLIC)
    }
  })

  it('a Russian reader keeps the provider list the owner debugs with', () => {
    expect(
      agentChatText(
        { kind: 'failed', code: 'no_answer', text: NO_ANSWER },
        'ru'
      )
    ).toBe(NO_ANSWER)
    expect(
      agentChatText(
        { kind: 'failed', code: 'no_answer', text: NO_ANSWER },
        'en'
      )
    ).toBe(AGENT_CHAT_CODES.no_answer.en)
  })

  it('the thread gate words its refusals in English, so a Russian reader gets the sentence', () => {
    expect(
      agentChatText(
        {
          kind: 'refused',
          status: 403,
          code: 'not_seller',
          error: 'not a seller',
        },
        'ru'
      )
    ).toBe(AGENT_CHAT_CODES.not_seller.ru)
  })

  it('an unknown code falls back to readable server words, never to a guess', () => {
    expect(
      agentChatText(
        { kind: 'refused', status: 409, code: 'new', error: 'busy' },
        'en'
      )
    ).toBe('busy')
    expect(agentChatText({ kind: 'refused', status: 502 }, 'en')).toContain(
      '502'
    )
  })

  it('the step limit names the count in English and keeps the old sentence in Russian', () => {
    expect(
      agentChatText(
        { kind: 'stepLimit', code: 'step_limit', steps: 24, text: STEP_LIMIT },
        'en'
      )
    ).toContain('24')
    expect(
      agentChatText(
        { kind: 'stepLimit', code: 'step_limit', steps: 24, text: STEP_LIMIT },
        'ru'
      )
    ).toBe(`Не уложился в шаги: ${STEP_LIMIT}. Попробуй задачу поменьше.`) // cyrillic-ok: the old sentence
  })

  it('points at the retry button by its real label', () => {
    expect(agentChatText({ kind: 'unreachable', detail: 'x' }, 'ru')).toContain(
      '«Повторить»'
    ) // cyrillic-ok: the chat.retry label
    expect(agentChatText({ kind: 'unreachable', detail: 'x' }, 'en')).toContain(
      '"Retry"'
    )
  })
})
