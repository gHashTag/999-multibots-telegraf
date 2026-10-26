/**
 * STRIP AGENT MARKUP (telegram-sender.ts).
 *
 * Production, 26.10.2026: the owner's chat received a raw `<think>` reasoning
 * block and a `<tool_call>` dump as a client-facing message. The model's
 * scaffolding must never reach a person: every send strips it in one place.
 */
import { describe, expect, it } from 'vitest'
import { stripAgentMarkup } from './telegram-sender'

describe('stripAgentMarkup', () => {
  it('a think block never reaches a person', () => {
    expect(
      stripAgentMarkup('before<think>secret reasoning</think> after')
    ).toBe('before after')
  })

  it('an unclosed think block does not leak the reasoning', () => {
    expect(stripAgentMarkup('<think>reasoning without an end')).toBe('')
  })

  it('a tool_call dump is stripped', () => {
    expect(
      stripAgentMarkup(
        'Текст\n<tool_call>\n{"name":"crm_deliver_photo"}\n</tool_call>'
      )
    ).toBe('Текст')
  })

  it('an unclosed think tag swallows to the end (nothing leaks)', () => {
    expect(stripAgentMarkup('ok<think>ok</think')).toBe('ok')
  })

  it('clean text passes untouched', () => {
    expect(stripAgentMarkup('Обычный ответ клиенту')).toBe(
      'Обычный ответ клиенту'
    )
  })
})
