import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  ACTIONS,
  ACTION_PREFIX,
  isKnownAction,
  standardButtons,
  parseAgentButtons,
  buttonsForAnswer,
} from '@/navigation/helpers/actionButtons'

/**
 * Every button that is rendered has a handler behind it.
 *
 * Owner: "always send the answers with buttons so the user can react without
 * writing text", and "teach the agent to send buttons and react to presses".
 *
 * The failure this guards is the same one the capability preflight guards, one
 * interaction later: offering something that cannot happen. A button whose
 * press reaches no handler is a control that does nothing, and a model asked
 * to propose buttons will invent ids cheerfully.
 */

const REPO = path.resolve(__dirname, '..', '..', '..')
const commands = fs.readFileSync(
  path.join(REPO, 'src/navigation/registerCommands.ts'),
  'utf8'
)

describe('a rendered button always has somewhere to land', () => {
  it('has actions to check at all', () => {
    // Every assertion below iterates ACTIONS, and an empty list satisfies all
    // of them while rendering nothing.
    expect(ACTIONS.length, 'no actions are defined').toBeGreaterThan(2)
  })

  it('registers a handler for every action it offers', () => {
    // The direction that matters: an action with no handler is a dead button.
    // The handlers are registered with a template literal, so the source text
    // holds `${ACTION_PREFIX}topup` rather than the expanded `act:topup`.
    // Matching only the expanded form reported every live handler as missing --
    // the matcher was wrong, not the code.
    const registered = (id: string) =>
      commands.includes('${ACTION_PREFIX}' + id) ||
      commands.includes(`${ACTION_PREFIX}${id}`)
    const unhandled = ACTIONS.filter(a => !registered(a.id)).map(a => a.id)
    expect(
      unhandled,
      'these actions are offered as buttons and nothing answers the press:\n' +
        unhandled.join('\n')
    ).toEqual([])
  })

  it('does not claim a handler that is not there', () => {
    // Negative control for the check above -- a substring test that always
    // matched would pass every id, including invented ones.
    expect(
      commands.includes('${ACTION_PREFIX}definitely_not_wired') ||
        commands.includes(`${ACTION_PREFIX}definitely_not_wired`)
    ).toBe(false)
  })

  it('puts top-up first, because that is the step a paying person wants', () => {
    const rows = standardButtons(true).reply_markup.inline_keyboard
    const first = rows[0][0] as { text: string; callback_data?: string }
    expect(first.callback_data).toBe(`${ACTION_PREFIX}topup`)
    expect(first.text, 'the label must say what it does').toMatch(
      new RegExp('Пополнить')
    )
  })

  it('drops a button the agent invented, and keeps the ones that work', () => {
    // The whole reason the parser exists. A model told to offer buttons will
    // propose `act:make_me_a_movie`; rendering it would hand the person a
    // control that does nothing.
    const answer =
      'Готов сделать. [[Пополнить|act:topup]] [[Снять кино|act:make_me_a_movie]]'
    const { text, buttons } = parseAgentButtons(answer, true)
    expect(buttons.length, 'only the known action survives').toBe(1)
    expect((buttons[0][0] as { callback_data?: string }).callback_data).toBe(
      `${ACTION_PREFIX}topup`
    )
    expect(isKnownAction('make_me_a_movie')).toBe(false)
    // Both markers leave the visible text, including the rejected one:
    // otherwise the person reads bracket soup at the end of the answer.
    expect(text, 'markers must not reach the person').not.toMatch(
      new RegExp('\\[\\[')
    )
    expect(text).toBe('Готов сделать.')
  })

  it('still offers the standard set when the agent proposed nothing', () => {
    // There must always be something to press: that is the requirement.
    const { text, markup } = buttonsForAnswer('Просто ответ.', true)
    expect(text).toBe('Просто ответ.')
    const flat = markup.reply_markup.inline_keyboard.flat() as Array<{
      callback_data?: string
    }>
    expect(
      flat.some(b => b.callback_data === `${ACTION_PREFIX}topup`),
      'top-up must be offered under every answer'
    ).toBe(true)
  })

  it('offers the app through an inline web_app button, never a reply key', () => {
    // A Mini App launched from a REPLY button receives neither signature nor
    // user -- that is why the reply keyboard was removed. An inline web_app
    // button carries the signed launch, so this is the door that works.
    const flat = standardButtons(
      true
    ).reply_markup.inline_keyboard.flat() as Array<{
      web_app?: { url: string }
    }>
    const app = flat.find(b => b.web_app)
    expect(app, 'the app button must be a web_app button').toBeTruthy()
    expect(app!.web_app!.url).toMatch(new RegExp('^https://'))
  })

  it('offers payment right after /start', () => {
    // Owner: "proactively offer to pay, right after /start, so it is clear
    // what to do". Structural, because the handler is not exported.
    expect(commands, '/start must end with an offer to top up').toMatch(
      new RegExp('offerToStart\\(ctx\\)')
    )
    expect(commands).toMatch(new RegExp('async function offerToStart'))
  })
})
