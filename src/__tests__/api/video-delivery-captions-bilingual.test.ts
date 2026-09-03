/**
 * Video-delivery captions must be bilingual, not hardcoded Russian.
 *
 * Follows #1140, which localized the completion keyboard. The "video ready" /
 * "file too large" / model / duration captions in the KIE-AI and AI-Reels
 * delivery webhooks were hardcoded Russian string literals, so an English user
 * received Russian delivery text alongside the (already localized) keyboard.
 * They now branch on the same per-function
 * `isRu = (await getUserLanguageFromDB(id)) !== 'en'`. This asserts each file
 * carries the English variants — those strings exist only because a bilingual
 * branch was added, so reverting any caption to Russian-only removes its
 * English fragment and turns this red.
 *
 * NOT covered: the error messages (send-failure / link-failure / create-failure)
 * stay Russian-only — several expose internal jargon
 * ("Template 2 (Inngest + Render Server)") and need a product-copy pass, which is
 * out of scope for this i18n change.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const KIE = fs.readFileSync(
  'src/api_server/routes/kie-ai-webhook.routes.ts',
  'utf8'
)
const REELS = fs.readFileSync(
  'src/api_server/routes/ai-reels-callback.routes.ts',
  'utf8'
)

describe('video-delivery captions are bilingual', () => {
  it('kie-ai carries the English caption variants', () => {
    for (const en of [
      'Your video is ready!',
      '⏱ Duration:',
      '🎬 Model:',
      'Generated with AI',
      'File too large',
    ]) {
      expect(
        KIE,
        `kie-ai is missing English caption fragment: ${en}`
      ).toContain(en)
    }
  })

  it('ai-reels carries the English caption variants', () => {
    for (const en of [
      'Your AI Reels video is ready!',
      'Download the video:',
      'Created with Template 2',
      'Video too large for Telegram',
    ]) {
      expect(
        REELS,
        `ai-reels is missing English caption fragment: ${en}`
      ).toContain(en)
    }
  })

  it('the delivered-video caption branches on the per-user language flag', () => {
    expect(KIE).toMatch(/caption: isRu/)
    expect(REELS).toMatch(/caption: isRu/)
  })
})
