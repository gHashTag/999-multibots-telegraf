import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// A Telegram inline button keeps spinning until the callback query is answered.
// These autofixer-config action handlers used to call answerCbQuery ONLY in
// their catch (error) path, so on success the button spun forever (silence after
// a press reads as broken). Each must answer on the success/try path too. Guard
// source-level (repo style, like mountOrder/protected-routes).
const SRC = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    '..',
    'commands',
    'autofixer',
    'autofixer-config.scene.ts'
  ),
  'utf8'
)
const HANDLERS = ['configure_fix_types', 'back_to_main_config', 'save_and_exit']

describe('autofixer-config action handlers answer the callback on success', () => {
  for (const name of HANDLERS) {
    it(`${name} calls answerCbQuery before its catch (no hanging spinner)`, () => {
      const start = SRC.indexOf(`action('${name}'`)
      expect(
        start,
        `handler ${name} not found (matcher stale?)`
      ).toBeGreaterThan(-1)
      const catchIdx = SRC.indexOf('} catch', start)
      expect(catchIdx).toBeGreaterThan(start)
      const tryBlock = SRC.slice(start, catchIdx)
      expect(
        tryBlock.includes('answerCbQuery'),
        `${name} must answerCbQuery on the success path, not only in catch`
      ).toBe(true)
    })
  }
})
