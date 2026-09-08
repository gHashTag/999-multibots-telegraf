import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sliceFrom } = require('../../../scripts/lib/anchored-slice.cjs')

/*
 * The end of the free demo is the one moment in this funnel where a person has
 * just been shown what the product does and told what it costs. The offer made
 * there used to be a REPLY keyboard, and the showMainMenu() call a few lines
 * below sends a greeting carrying remove_keyboard -- deliberately, because it
 * is what clears a stale wizard keyboard. So the offer was wiped within a
 * second of appearing.
 *
 * Two properties, and the second is the one a keyboard argument alone does not
 * give you: the button must also be answerable AFTER the scene is left, which
 * this path does twice before showing the menu. A scene-scoped handler would
 * be swallowed there, so the callback has to be registered at bot level.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const SCENE = 'src/scenes/avatarTransformScene/index.ts'
const COMMANDS = 'src/navigation/registerCommands.ts'
/*
 * Comments are DELETED here, not blanked. The usual trick -- replace a comment
 * with spaces so line numbers survive -- inflates every distance measured in
 * characters, and the first version of this test failed on its own subject
 * because the twenty-line note above the fix pushed the code past the window.
 */
const strip = (t: string) =>
  t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^([^'"`\n]*?)\/\/.*$/gm, (_m, k) => k)

/** The reply that carries limitMessage, source text only, comments removed. */
function limitReply(): string {
  const src = strip(read(SCENE))
  const at = src.indexOf('ctx.reply(limitMessage')
  expect(at, 'the free-demo limit reply must still exist').toBeGreaterThan(-1)
  return src.slice(at, at + 900)
}

describe('the offer at the end of the free demo survives the menu that follows', () => {
  it('is an inline keyboard, not a reply keyboard the next message removes', () => {
    const block = limitReply()
    expect(block).toContain('Markup.inlineKeyboard')
    expect(block).not.toContain('Markup.keyboard')
  })

  it('still offers the subscription, not just a generic top-up', () => {
    expect(limitReply()).toMatch(/Оформить подписку|Subscribe/) // cyrillic-ok: the UI copy under test
  })

  it('the menu that follows is what would have wiped a reply keyboard', () => {
    // The premise, pinned: if showMainMenu stopped removing the keyboard this
    // test would be guarding a rule whose reason had gone.
    const menu = strip(read('src/navigation/helpers/menuKeyboard.ts'))
    expect(menu).toContain('removeKeyboard')
    const scene = strip(read(SCENE))
    const reply = scene.indexOf('ctx.reply(limitMessage')
    const menuCall = scene.indexOf('showMainMenu(ctx)', reply)
    expect(
      menuCall,
      'showMainMenu must still follow this reply'
    ).toBeGreaterThan(reply)
    expect(menuCall - reply).toBeLessThan(900)
  })

  it('the callback is answerable after the scene is left, so it is bot-level', () => {
    const scene = strip(read(SCENE))
    const block = limitReply()
    const cb = /'([a-z_]+)'\s*\)\s*,?\s*\]/.exec(
      sliceFrom(block, 'Markup.button.callback')
    )
    expect(cb, 'the offer must carry a callback id').not.toBeNull()
    const id = cb![1]

    // This path leaves the scene before the menu is shown, so a scene-scoped
    // handler would never see the press.
    expect(sliceFrom(scene, 'ctx.reply(limitMessage')).toContain(
      'scene.leave()'
    )

    const commands = strip(read(COMMANDS))
    // The terminator is the point. Without the closing quote this matched a
    // RENAMED registration by prefix -- go_to_subscription_scene_x contains
    // go_to_subscription_scene -- and the mutant survived a green run.
    const botLevel = new RegExp(`bot\\.action\\(\\s*'${id}'`).test(commands)
    expect(
      botLevel,
      `${id} must be registered with bot.action, not only inside a scene`
    ).toBe(true)
  })
})
