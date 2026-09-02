import { describe, expect, it } from 'vitest'

import { KIE_WEB_MODELS, kieServerModelId } from './kieProvider'

describe('Kie web provider catalogue', () => {
  it('offers one reviewed model for every paid media stage', () => {
    expect(KIE_WEB_MODELS.image.map(model => model.id)).toContain(
      'kie/google/nano-banana'
    )
    expect(KIE_WEB_MODELS.video.map(model => model.id)).toContain(
      'kie/grok-imagine/text-to-video'
    )
    expect(KIE_WEB_MODELS.audio.map(model => model.id)).toContain(
      'kie/elevenlabs/text-to-speech-multilingual-v2'
    )
    expect(KIE_WEB_MODELS.lipsync.map(model => model.id)).toContain(
      'kie/veed/fabric-1'
    )
  })

  it('strips only the explicit provider namespace', () => {
    expect(kieServerModelId('kie/google/nano-banana')).toBe(
      'google/nano-banana'
    )
    expect(kieServerModelId('fal-ai/flux/dev')).toBeNull()
    expect(kieServerModelId('kie/')).toBeNull()
  })
})
