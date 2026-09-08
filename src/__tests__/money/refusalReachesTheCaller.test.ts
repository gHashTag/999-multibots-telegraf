import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * WHEN THE REFUSAL IS RETURNED, THE BUTTON HAS TO BE OFFERED BY THE CALLER.
 *
 * Six of the seventeen remaining money refusals do not send anything: they hand
 * `{ success: false, error: <text> }` upward and somebody else decides what to
 * do with it. A keyboard argument at the refusal site is meaningless there --
 * there is no send to attach it to.
 *
 * The video-price helpers are the tractable half: three callers in the whole
 * tree, two of which show the text to a person. So the helper now says WHICH
 * failure it was, and those two consult it.
 *
 * THE DISCRIMINATOR IS THE POINT. The same `error` field carries "unknown
 * model" and a database hiccup. Attaching a top-up button to those is worse
 * than attaching none -- it would send somebody to pay for a problem money
 * cannot fix. `insufficientFunds` is what separates them.
 *
 * AND THE COUNT CANNOT SEE THIS. refusalOffersAWayToPay follows a message to a
 * send in the SAME file; here the send is two files away. The ceiling did not
 * move -- 17 before and after -- so this file is the ratchet for this repair,
 * named rather than counted. That limit is stated in the census too.
 */

const REPO = path.resolve(__dirname, '..', '..', '..')

/** Blank comments: a prose mention must not pass as a call. */
const code = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/^([^'"`\n]*?)\/\/.*$/gm, (_m, keep) => keep)

const read = (rel: string) =>
  code(fs.readFileSync(path.join(REPO, rel), 'utf8'))

describe('a refusal that is returned still reaches somebody with a button', () => {
  it('the helper says which failure it was', () => {
    const src = read('src/modules/videoGenerator/helpers/priceHelper.ts')
    expect(
      (src.match(/insufficientFunds:\s*true/g) || []).length,
      'both refusal branches must flag themselves'
    ).toBe(2)

    // And the copy stops naming a destination, because the destination is now
    // a button under the message.
    expect(
      /главном меню|in the main menu/.test(src), // cyrillic-ok: the UI copy under test
      'the copy must not point at the main menu in words any more'
    ).toBe(false)
  })

  it('both callers that show it to a person consult the flag', () => {
    const CALLERS = [
      'src/modules/videoGenerator/generateImageToVideo.ts',
      'src/scenes/morphingWizard/index.ts',
    ]
    for (const rel of CALLERS) {
      const src = read(rel)
      expect(
        /balanceResult\.insufficientFunds\s*\?/.test(src),
        `${rel} must offer the button only when the failure was about money`
      ).toBe(true)
      expect(
        src.includes('standardButtons('),
        `${rel} must lead to the shared top-up keyboard`
      ).toBe(true)
      // generateImageToVideo answers into chatId, which may be a group, and
      // Telegram rejects a web_app button outside a private chat.
      if (rel.includes('generateImageToVideo'))
        expect(
          /standardButtons\(isRu,\s*\{\s*app:\s*false\s*\}\)/.test(src),
          'a send that may reach a group must omit the app button'
        ).toBe(true)
    }
  })

  it('the button is decided BEFORE the message goes out', () => {
    // A flag consulted after the send decides nothing. Position, not presence.
    for (const rel of [
      'src/modules/videoGenerator/generateImageToVideo.ts',
      'src/scenes/morphingWizard/index.ts',
    ]) {
      const src = read(rel)
      const send = src.search(
        /await (?:telegramInstance\.sendMessage|ctx\.reply)\(/
      )
      const flag = src.indexOf('balanceResult.insufficientFunds')
      expect(send, `${rel}: no send found`).toBeGreaterThan(-1)
      expect(flag, `${rel}: flag never consulted`).toBeGreaterThan(send)
      // ...and inside that call, not after it: the closing paren comes later.
      const close = src.indexOf(')\n', flag)
      expect(
        close,
        `${rel}: the flag must sit inside the send call`
      ).toBeGreaterThan(flag)
    }
  })

  it('the third caller is a webhook with nobody to answer', () => {
    /*
     * kie-ai-webhook calls the same helper and does NOT show the text to
     * anybody -- it logs `notCharged(...)`. Named so the next reader does not
     * "fix" it by attaching a keyboard to a log line.
     */
    const src = read('src/api_server/routes/kie-ai-webhook.routes.ts')
    expect(src).toContain('checkBalanceVideoOperationHelper')
    expect(
      /balanceResult\.insufficientFunds/.test(src),
      'a webhook has no chat to put a button in'
    ).toBe(false)
  })
})
