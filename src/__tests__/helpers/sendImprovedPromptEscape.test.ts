import { describe, it, expect, vi } from 'vitest'
import { sendImprovedPrompt } from '@/helpers/sendLongMessage'

// The improve-prompt wizard sends the LLM-improved prompt inside a MarkdownV2
// code block with parse_mode: 'MarkdownV2'. A raw backtick or backslash in the
// prompt breaks the code fence -> Telegram rejects the message ("can't parse
// entities") -> the improved prompt never reaches the user. This ratchet locks
// that sendImprovedPrompt escapes those two characters before embedding.
describe('sendImprovedPrompt escapes code-fence-breaking chars (MarkdownV2)', () => {
  it('escapes backticks and backslashes in the embedded prompt', async () => {
    const reply = vi.fn().mockResolvedValue(undefined)
    const ctx: any = { from: { id: 1 }, reply }
    await sendImprovedPrompt(ctx, 'a `code` and a \\ slash', true, {
      parse_mode: 'MarkdownV2',
    })
    expect(reply).toHaveBeenCalledTimes(1)
    const sent: string = reply.mock.calls[0][0]
    // no RAW backtick survives except the code fences themselves
    const body = sent.split('```')[1] ?? ''
    expect(body.includes('`code`')).toBe(false) // raw backtick pair gone
    expect(body).toContain('\\`code\\`') // escaped form present
    expect(body).toContain('\\\\ slash') // backslash doubled
  })
})
