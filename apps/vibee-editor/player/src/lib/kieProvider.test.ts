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
    // Была `kie/veed/fabric-1` — модель, которую сервер НЕ ДОПУСКАЕТ: у неё
    // нет себестоимости в прайсе KieAI, а допуск отсеивает такие целиком.
    // Липсинк из веба поэтому не работал ни разу: списание проходило, следом
    // летело «Kie.ai model is not enabled for lipsync», возврат и 500.
    expect(KIE_WEB_MODELS.lipsync.map(model => model.id)).toContain(
      'kie/infinitalk/from-audio'
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
