/**
 * broadcast.service sendToAllUsers sends the same caption to every recipient
 * with parse_mode 'MarkdownV2' on raw, unescaped text. Its per-recipient catch
 * used to hard-delete the user from the `users` table on `errorCode === 403 ||
 * errorCode === 400`, filtered ONLY by telegram_id (no bot_name). The dominant
 * 400 during a broadcast is "Bad Request: can't parse entities" — a property of
 * the shared caption that fires identically for EVERY recipient — so one
 * unescaped special char would wipe the whole audience's rows across ALL bots.
 *
 * The fix: delete ONLY on a genuine chat-gone error (403, or a 400 whose
 * description says the chat is gone — never a bare 400), and scope the delete by
 * bot_name so one bot's failure cannot touch other bots' rows.
 *
 * Source-level seam test (sendToAllUsers has heavy bot/supabase deps). Mutation
 * — deleting on a bare 400 again, or dropping the bot_name scope — fails it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

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

describe('broadcast does not mass-delete users on a parse-error 400', () => {
  it('never deletes on a bare 400 (guards deletion behind a chat-gone check)', () => {
    const s = code()
    // the delete must be gated on a named "gone" condition, not a raw 400
    expect(
      /if \(errorCode === 403 \|\| errorCode === 400\)/.test(s),
      'delete still fires on a bare 400 (mass-delete on parse error)'
    ).toBe(false)
    expect(
      /const chatGone =/.test(s),
      'no chat-gone gate before the delete'
    ).toBe(true)
    // a 400 only counts as gone when the description says so
    expect(
      /errorCode === 400 &&[\s\S]{0,120}(chat not found|deactivated|blocked)/.test(
        s
      ),
      'a 400 is treated as gone without checking the description'
    ).toBe(true)
  })

  it('scopes the delete by bot_name so it cannot cross bots', () => {
    const s = code()
    /*
     * THIS GUARD WAS READING WHICHEVER DELETE CAME FIRST.
     *
     * Two problems sat here. `const del = s.indexOf(".from('users')\n          .delete()")`
     * was computed and never used, and its anchor no longer matched anything --
     * the real chain is indented twenty spaces, not ten. A reader saw that line
     * and believed the region was pinned to the users table.
     *
     * It was not: the slice used `s.indexOf('.delete()')`, the FIRST delete
     * anywhere in the file. That works today only because the subject contains
     * exactly one. Add a delete to any other table above it and this guard --
     * which exists to stop a broadcast wiping rows across bots -- quietly starts
     * checking the wrong chain and passes.
     *
     * So the anchor is now the users delete itself, whitespace-tolerant, and
     * sliceFrom throws when it is gone instead of handing back the last
     * character of the file.
     */
    const at = s.search(/\.from\('users'\)\s*\.delete\(\)/)
    expect(
      at,
      'the users delete chain was not found -- re-anchor this check'
    ).toBeGreaterThan(-1)
    const chain = s.slice(at, at + 240)
    expect(
      /\.eq\('telegram_id'/.test(chain),
      'delete is not filtered by telegram_id'
    ).toBe(true)
    expect(
      /\.eq\('bot_name'/.test(chain),
      'delete is not scoped by bot_name (can delete other bots rows)'
    ).toBe(true)
  })

  it('there is exactly one delete chain, which is what the check above assumed', () => {
    // Said out loud rather than relied on. If a second delete appears, this
    // fails and whoever adds it has to decide which one the guard should read,
    // instead of the guard silently picking the first.
    const s = code()
    expect((s.match(/\.delete\(\)/g) || []).length).toBe(1)
  })
})
