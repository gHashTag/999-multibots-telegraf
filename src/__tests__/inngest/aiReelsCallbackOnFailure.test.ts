/**
 * The ai-reels-callback Inngest function runs with retries: 3 but had no
 * onFailure handler. When all retries are exhausted (e.g. the rendered video
 * URL is permanently unreachable, or Telegram keeps rejecting the send), the
 * function fails SILENTLY: the user who paid for the AI Reels gets no video and
 * no error, and no admin is notified. Every sibling Inngest function
 * (welcomeAvatarGeneration, morphImages, kieAiWebhookMonitor, ...) declares
 * onFailure: createInngestFailureHandler(...); this callback was the anomaly.
 *
 * Source-level seam test (the config is a createFunction literal with heavy
 * runtime deps). Mutation — removing the onFailure declaration — fails it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'inngest_app',
  'functions',
  'ai-reels-callback.ts'
)

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () => stripComments(fs.readFileSync(SRC, 'utf8'))

describe('ai-reels-callback declares an onFailure handler', () => {
  it('imports and wires createInngestFailureHandler in the function config', () => {
    const s = code()
    expect(
      /import \{[^}]*createInngestFailureHandler[^}]*\} from '@\/inngest_app\/client'/.test(
        s
      ),
      'createInngestFailureHandler is not imported'
    ).toBe(true)
    // the onFailure sits inside the createFunction config, before the event trigger
    const cfg = s.match(/createFunction\(\s*\{[\s\S]*?\},/)
    expect(cfg, 'no createFunction config block').not.toBeNull()
    expect(
      /onFailure:\s*createInngestFailureHandler\(/.test(cfg![0]),
      'the config does not declare onFailure: createInngestFailureHandler(...)'
    ).toBe(true)
  })
})
