/**
 * THE MANAGER AGENT MAKES NO MEDIA (client-facing.ts TEXT_ONLY_TOOLS).
 *
 * Owner, 2026-09-30: the Manager Agent is a text model for the CRM -- no
 * content, no reels. The package card says so; a `text_only` turn must not
 * even be offered a media tool, on any surface, while every other turn keeps
 * what it had.
 */
import { describe, expect, it } from 'vitest'
import {
  CLIENT_SURFACE_TOOLS,
  TEXT_ONLY_DENY_REASON,
  TEXT_ONLY_TOOLS,
  clientSurfaceDenial,
  textOnlyDenial,
} from './client-facing'
import { TOOLS_BY_NAME } from './tools'

const MEDIA = [
  'image_generate',
  'image_edit',
  'audio_generate',
  'video_generate',
  'reel_render',
  'crm_deliver_photo',
]

describe('a text-only turn', () => {
  it('keeps only words, money and the open web', () => {
    for (const name of TEXT_ONLY_TOOLS) {
      expect(TOOLS_BY_NAME.has(name), name).toBe(true)
      expect(CLIENT_SURFACE_TOOLS.has(name), name).toBe(true)
    }
    for (const name of MEDIA) expect(TEXT_ONLY_TOOLS.has(name)).toBe(false)
  })

  it('denies every media tool on the business surface, with the reason', () => {
    const d = textOnlyDenial(
      true,
      clientSurfaceDenial('business', {}, TOOLS_BY_NAME.keys()),
      TOOLS_BY_NAME.keys()
    )
    for (const name of MEDIA) {
      if (!TOOLS_BY_NAME.has(name)) continue
      expect(d.denyTools?.has(name), name).toBe(true)
      expect(d.denyReasons?.get(name)).toBe(TEXT_ONLY_DENY_REASON)
    }
    const open = [...TOOLS_BY_NAME.keys()].filter(n => !d.denyTools?.has(n))
    expect(new Set(open)).toEqual(
      new Set([...TEXT_ONLY_TOOLS].filter(n => TOOLS_BY_NAME.has(n)))
    )
  })

  it('a client-surface reason is kept where it was already denied', () => {
    const d = textOnlyDenial(
      true,
      clientSurfaceDenial('business', {}, TOOLS_BY_NAME.keys()),
      TOOLS_BY_NAME.keys()
    )
    const crossChat = [...TOOLS_BY_NAME.keys()].find(
      n => !CLIENT_SURFACE_TOOLS.has(n)
    )!
    expect(d.denyReasons?.get(crossChat)).not.toBe(TEXT_ONLY_DENY_REASON)
  })

  it('changes nothing when the turn is not text only', () => {
    const base = clientSurfaceDenial('business', {}, TOOLS_BY_NAME.keys())
    for (const flag of [undefined, false]) {
      const d = textOnlyDenial(flag, base, TOOLS_BY_NAME.keys())
      expect(d.denyTools).toBe(base.denyTools)
      expect(d.denyReasons).toBe(base.denyReasons)
    }
  })
})
