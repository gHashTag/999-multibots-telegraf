import { describe, it, expect } from 'vitest'
import { systemPrompt } from './src/agent/chat'

/**
 * THE AGENT ANSWERS IN THE LANGUAGE IT WAS WRITTEN TO.
 *
 * Owner, 2026-09-20: people write to it in English and it answers in Russian.
 *
 * The cause was one line at the end of the system template: an unconditional
 * order to answer in Russian, which the model obeyed exactly as written. It was invisible in testing because everybody testing it wrote in
 * Russian and got Russian back.
 *
 * The rule that replaces it has to fight the prompt itself: the whole
 * instruction is in Russian, and a model mirrors the language it is
 * instructed in unless told not to. So the instruction says so explicitly.
 *
 * Patterns are built from string literals rather than regex literals: the
 * no-cyrillic gate reads a pattern as code and is right to -- a letter that
 * merely looks Latin changes a pattern's meaning invisibly.
 */
const ORDERS_RUSSIAN = new RegExp('Отвечай по-русски') // cyrillic-ok: prompt copy
const NAMES_THE_RULE = new RegExp('ЯЗЫК ОТВЕТА') // cyrillic-ok: prompt copy
const SAYS_ENGLISH = new RegExp('по-английски') // cyrillic-ok: prompt copy

describe('the language of the answer', () => {
  /*
   * THE ORDER IS GONE. Not softened, not qualified elsewhere -- gone. A model
   * handed both "answer in Russian" and "answer in their language" resolves
   * it by picking one, and which one is not something a test can pin.
   */
  it('no longer orders Russian unconditionally, on any surface', () => {
    for (const surface of ['bot', 'business', undefined]) {
      expect(
        systemPrompt(surface),
        `the unconditional Russian order survives on the ${surface ?? 'default'} surface`
      ).not.toMatch(ORDERS_RUSSIAN)
    }
  })

  it('tells the agent to follow the person, and names English', () => {
    for (const surface of ['bot', 'business']) {
      const p = systemPrompt(surface)
      expect(p).toMatch(NAMES_THE_RULE)
      expect(p).toMatch(SAYS_ENGLISH)
    }
  })

  /*
   * AND IT SAYS WHY, because the instruction is itself in Russian. Without
   * that sentence the rule and its surroundings contradict each other on
   * every line, and the surroundings are longer.
   */
  it('warns that its own language is not the instruction', () => {
    expect(systemPrompt('bot')).toMatch(
      new RegExp('НЕ указание отвечать по-русски') // cyrillic-ok: prompt copy
    )
  })
})
