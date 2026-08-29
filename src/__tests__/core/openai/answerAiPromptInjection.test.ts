/**
 * answerAi builds a system prompt and sends it to four providers (Grok, Z.AI,
 * DeepSeek, OpenAI). It used to embed `JSON.stringify(userData)` — whose
 * first_name / last_name / username / company / position / designation are
 * attacker-controlled Telegram profile fields — directly into the role:'system'
 * message of every provider. A crafted first_name there is prompt injection
 * (JSON.stringify escapes for JSON validity, not for instruction), and in group
 * chats the reply is public, so it can steer the group-visible persona. This is
 * the same anti-pattern the businessBot #1129 fix forbids.
 *
 * The fix: keep only the trusted language directive in the system prompt; move
 * the user context, with each field sanitized (control chars stripped, capped),
 * into the user turn where the model does not treat it as an instruction.
 *
 * Source-level seam test (answerAi is a long multi-provider I/O function).
 * Mutation — putting userData back in the system prompt, or dropping the
 * sanitizer — fails it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'core',
  'openai',
  'requests.ts'
)

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () => stripComments(fs.readFileSync(SRC, 'utf8'))

describe('answerAi does not inject untrusted profile data into the system prompt', () => {
  it('never stringifies raw userData (only the sanitized copy)', () => {
    const s = code()
    expect(
      /JSON\.stringify\(\s*userData\s*\)/.test(s),
      'raw userData is still serialized into a prompt'
    ).toBe(false)
    expect(
      /JSON\.stringify\(\s*safeUserData/.test(s),
      'the sanitized safeUserData copy is not used'
    ).toBe(true)
  })

  it('keeps only the language directive in the system prompt (no user context)', () => {
    const s = code()
    const m = s.match(/const initialPrompt = `[^`]*`/)
    expect(m, 'no initialPrompt').not.toBeNull()
    expect(
      /communicate with/.test(m![0]),
      'the system prompt still carries the user context'
    ).toBe(false)
    expect(/Respond in the language/.test(m![0])).toBe(true)
  })

  it('sanitizes each profile field (strip control chars, cap length)', () => {
    const s = code()
    expect(/sanitizeField/.test(s), 'no sanitizeField helper').toBe(true)
    // strips unicode control chars and bounds the length
    expect(/\\p\{C\}/u.test(s), 'sanitizer does not strip control chars').toBe(
      true
    )
    expect(/\.slice\(0, \d+\)/.test(s), 'sanitizer does not cap length').toBe(
      true
    )
  })

  it('carries the user context in the user turn, not role:system', () => {
    const s = code()
    // the context lives in userMessage, which every provider sends as role:'user'
    expect(/const userMessage = `You communicate with:/.test(s)).toBe(true)
    const userTurns = (s.match(/content: userMessage,/g) || []).length
    expect(userTurns, 'expected all four providers to use userMessage').toBe(4)
    // and no raw prompt-only user content slipped through
    expect((s.match(/content: prompt,/g) || []).length).toBe(0)
  })
})
