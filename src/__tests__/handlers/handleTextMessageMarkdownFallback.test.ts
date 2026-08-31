import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// handleTextMessage sends the answerAi (LLM) response with parse_mode:
// 'MarkdownV2'. LLM text is not reliably valid MarkdownV2, so an unescaped
// special makes Telegram 400 and the outer catch replaces the real answer with
// a generic error. The reply MUST have a plain-text fallback (.catch) so the
// answer still reaches the user -- the aiChatWizard sibling already does this.
// This guards that the fallback stays (source-level, like mountOrder/protected-routes).
describe('handleTextMessage MarkdownV2 reply has a plain-text fallback', () => {
  const src = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      'handlers',
      'handleTextMessage',
      'index.ts'
    ),
    'utf8'
  )

  it('finds the MarkdownV2 reply of the LLM response (matcher not stale)', () => {
    expect(src).toMatch(
      /responseText[\s\S]{0,80}parse_mode:\s*['"]MarkdownV2['"]/
    )
  })

  it('that reply is chained with a .catch fallback that re-sends as plain text', () => {
    // the reply call and its .catch, then a bare ctx.reply(responseText) inside
    const guarded =
      /\.reply\(responseText,\s*\{\s*parse_mode:\s*['"]MarkdownV2['"]\s*\}\s*\)\s*\.catch\(/.test(
        src
      ) &&
      /\.catch\(async\s*\(\)\s*=>\s*\{[\s\S]{0,120}reply\(responseText\)/.test(
        src
      )
    expect(
      guarded,
      'answerAi MarkdownV2 reply must .catch and re-send responseText without parse_mode'
    ).toBe(true)
  })
})
