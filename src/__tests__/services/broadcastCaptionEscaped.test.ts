/**
 * broadcast.service sends photo/video captions with parse_mode 'MarkdownV2' on
 * the raw announcement text. Any unescaped MarkdownV2 special char (a plain '.'
 * or '-' is enough) makes Telegram reject the send with a 400 "can't parse
 * entities" — for EVERY recipient (the caption is shared), so the whole
 * broadcast delivers nothing. (#1201 removed the destructive consequence of
 * that 400; this closes the root by making the caption always parse.)
 *
 * The fix escapes the caption with escapeMarkdownV2 at both MarkdownV2 sites.
 * Part 1 proves the helper actually escapes the common breakers; part 2 is a
 * source-level seam pinning that broadcast uses it (no raw caption remains).
 * Mutation — dropping the escape at a caption site — fails part 2.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { escapeMarkdownV2 } from '@/helpers/escapeMarkdown'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'services',
  'plan_b',
  'broadcast.service.ts'
)

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () => stripComments(fs.readFileSync(SRC, 'utf8'))

describe('broadcast MarkdownV2 captions are escaped (no parse-fail wipeout)', () => {
  it('premise: escapeMarkdownV2 escapes the common MarkdownV2 breakers', () => {
    // a plain sentence with a dot and a hyphen would otherwise 400
    expect(escapeMarkdownV2('Hi. New drop-2!')).toBe('Hi\\. New drop\\-2\\!')
  })

  it('escapes both MarkdownV2 caption sites (no raw caption: messageText)', () => {
    const s = code()
    const escaped = (s.match(/caption: escapeMarkdownV2\(messageText\)/g) || [])
      .length
    const raw = (s.match(/caption: messageText\b/g) || []).length
    // both MarkdownV2 sites (photo + video) must escape; none may pass raw text
    expect(escaped, 'a MarkdownV2 caption is not escaped').toBe(2)
    expect(raw, 'a raw (unescaped) caption remains').toBe(0)
    expect(
      /import \{[^}]*escapeMarkdownV2[^}]*\} from '@\/helpers\/escapeMarkdown'/.test(
        s
      ),
      'escapeMarkdownV2 is not imported'
    ).toBe(true)
  })
})
