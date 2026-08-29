/**
 * Video-completion messages must derive the user's language, not hardcode Russian.
 *
 * The KIE-AI and AI-Reels callbacks deliver a finished video and then send a
 * "What's next?" completion keyboard via getVideoCompletionMessage(isRu) /
 * createVideoCompletionKeyboard(isRu). Those flags were hardcoded `true`, so an
 * English-speaking user got Russian buttons. The language is derivable in every
 * one of these webhooks from the recipient's telegram id, so each call now reads
 * (await getUserLanguageFromDB(id)) !== 'en' — this defaults to Russian when the
 * language is unknown (helper returns null), matching prior behaviour; only an
 * explicit 'en' user sees a changed result. Same i18n-stub class as the
 * HeroValidationService fix (#1134).
 *
 * NOT covered here: the video-ready captions above these calls are still
 * hardcoded Russian string literals — a separate, pre-existing monolingual-copy
 * issue left untouched (surgical scope).
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const FILES = [
  'src/api_server/routes/kie-ai-webhook.routes.ts',
  'src/api_server/routes/ai-reels-callback.routes.ts',
]

describe('video-completion language is derived, not hardcoded', () => {
  for (const f of FILES) {
    const src = fs.readFileSync(f, 'utf8')

    it(`${f}: no literal true/false fed to the completion helpers`, () => {
      const literals = [
        ...src.matchAll(/getVideoCompletionMessage\(\s*(?:true|false)\s*\)/g),
        ...src.matchAll(
          /createVideoCompletionKeyboard\(\s*(?:true|false)\s*\)/g
        ),
      ]
      expect(
        literals.map(m => m[0]),
        'a completion helper is fed a hardcoded language literal'
      ).toEqual([])
    })

    it(`${f}: no hardcoded isRu language stub`, () => {
      const stubs = [...src.matchAll(/const\s+isRu\w*\s*=\s*(?:true|false)\b/g)]
      expect(
        stubs.map(m => m[0]),
        'a language flag is hardcoded instead of derived from the user'
      ).toEqual([])
    })

    it(`${f}: derives the language via getUserLanguageFromDB`, () => {
      expect(src, 'completion language must be looked up per user').toMatch(
        /getUserLanguageFromDB\(/
      )
    })
  }
})
