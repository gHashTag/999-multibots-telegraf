import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * SAVING THE NUMBER MUST LEAD SOMEWHERE.
 *
 * The owner: "make it so a confirmation comes to me and I approve -- as
 * automatic as possible".
 *
 * What Telegram allows is the ceiling here. MTProto has no "approve this
 * sign-in" call: the login code must be typed into the client that requested
 * it. So the automation worth building is everything AROUND that -- one tap to
 * share the number, one tap to land on the right screen -- and the code stays
 * with the person.
 *
 * Before this, saving the number replied "saved" and stopped. The person was
 * left holding a fact and had to find the mini app, the profile and the right
 * tab unaided, which is the opposite of automatic.
 */
const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'commands', 'sharePhoneCommand.ts'),
  'utf8'
)
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(
  /^\s*\/\/.*$/gm,
  ''
)

describe('sharing the number leads to the connect screen', () => {
  it('offers a web_app button, not a bare link', () => {
    /*
     * `webApp` and not `url`: only a web_app launch carries the Telegram
     * signature, and the profile refuses to open without one -- it says so
     * outright ("we do not know whose profile to show"). A plain link would
     * land the person on that refusal.
     */
    expect(CODE).toContain('Markup.button.webApp(')
  })

  it('lands on the tab the connect screen actually lives on', () => {
    // ProfileTabs reads `tab` from the address; ConnectTelegram is rendered
    // under 'agent'. Any other landing means hunting for it.
    expect(CODE).toContain('tab=agent')
  })

  it('the button is offered after saving AND to somebody already saved', () => {
    /*
     * Two call sites on purpose. Somebody whose number is already stored
     * presses /phone, is asked to share it again, and previously had nowhere
     * to go -- the screen is the only thing they still need.
     */
    /*
     * `connectButton(isRu)` and not `connectButton(` -- the loose pattern
     * counted the FUNCTION DECLARATION as well, so three matches meant two
     * call sites, and deleting one still left two. The mutation that removed a
     * call site survived on exactly that off-by-one.
     */
    const calls = CODE.match(/connectButton\(isRu\)/g) ?? []
    expect(calls.length).toBeGreaterThanOrEqual(2)
  })

  it('does NOT request the login code on the person behalf', () => {
    /*
     * The line that is deliberately not crossed. Pressing "get code" for
     * somebody starts access to their entire correspondence, and the connect
     * screen states the same rule in its own comment. The bot opens the
     * screen; the person asks for the code.
     */
    expect(CODE).not.toContain('/api/tg/connect/start')
    expect(CODE).not.toContain('connect/code')
  })

  it('still refuses a contact that is not the sender own', () => {
    // Pre-existing protection, re-pinned here because this file now has more
    // reasons to be edited: writing somebody else's number would let a
    // stranger point the connect code at a phone they control.
    expect(CODE).toContain('user_id')
    expect(CODE.replace(/\s+/g, ' ')).toContain(
      'String(contact.user_id) === String(ctx.from?.id)'
    )
  })
})
