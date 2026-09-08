/**
 * A customer's message in the owner's private chat must not reach stdout.
 *
 * `Telegraf.log(scrubbedLog)` prints every update as pretty-printed JSON. For a
 * business_message that is the customer's text verbatim -- name, chat id and
 * words -- in Railway's log stream. The business service deliberately logs only
 * textLength; the update dump undid that. scrubbedLog now blanks `text` and
 * `caption` values inside business updates and leaves every other update as it
 * was (a plain message keeps its text: those logs are relied on for debugging).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { scrubBusinessText, scrubbedLog } from '@/utils/scrubCallbackSecrets'

const business = (text: string) =>
  JSON.stringify(
    {
      update_id: 1,
      business_message: {
        message_id: 7,
        business_connection_id: 'c1',
        chat: { id: 555, first_name: 'Customer', type: 'private' },
        from: { id: 555, first_name: 'Customer' },
        text,
      },
    },
    null,
    2
  )

afterEach(() => vi.restoreAllMocks())

describe('business text never reaches the log', () => {
  it('blanks text and caption inside a business update, keeps the keys and the rest', () => {
    const out = scrubBusinessText(
      business('Хочу фото за 5 звёзд, "срочно" \\ ok')
    )
    expect(out).not.toContain('Хочу фото')
    expect(out).not.toContain('срочно')
    expect(out).toMatch(/"text": "<\d+ chars hidden>"/)
    expect(out).toContain('"first_name": "Customer"')
    expect(out).toContain('"business_connection_id": "c1"')
    expect(() => JSON.parse(out)).not.toThrow()
  })

  it('leaves a plain message update untouched', () => {
    const plain = JSON.stringify(
      {
        update_id: 2,
        message: { message_id: 1, chat: { id: 1 }, text: 'hello there' },
      },
      null,
      2
    )
    expect(scrubBusinessText(plain)).toBe(plain)
  })

  it('scrubbedLog applies it to what Telegraf.log hands over', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    scrubbedLog(business('secret words'))
    const printed = String(log.mock.calls[0][0])
    expect(printed).not.toContain('secret words')
    expect(printed).toContain('chars hidden')
  })
})
