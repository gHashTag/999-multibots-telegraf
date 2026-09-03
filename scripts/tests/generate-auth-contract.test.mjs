import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildGenerateAuthHeaders,
  generationErrorMessage,
} from '../../apps/vibee-editor/player/src/lib/generationAuth.ts'
import {
  generationOwnerId,
  mayBypassGenerationBilling,
} from '../../apps/vibee-editor/render/src/generation-identity.ts'
import { reconcileVoiceSelection } from '../../apps/vibee-editor/player/src/lib/voiceSelection.ts'

test('Telegram proof has precedence and is never combined with another credential', () => {
  assert.deepEqual(
    buildGenerateAuthHeaders({
      initData: 'signed-telegram',
      accessToken: 'server-session',
      devAgentKey: 'dev-agent',
    }),
    { 'X-Telegram-Init-Data': 'signed-telegram' }
  )
})

test('the browser and native app reuse their server-signed session', () => {
  assert.deepEqual(
    buildGenerateAuthHeaders({
      initData: '',
      accessToken: 'server-session',
      devAgentKey: '',
    }),
    { Authorization: 'Bearer server-session' }
  )
})

test('the development agent key is only the last local fallback', () => {
  assert.deepEqual(
    buildGenerateAuthHeaders({
      initData: '',
      accessToken: '',
      devAgentKey: 'dev-agent',
    }),
    { 'X-Agent-Key': 'dev-agent' }
  )
})

test('an unauthenticated production browser sends no invented identity', () => {
  assert.deepEqual(
    buildGenerateAuthHeaders({
      initData: '',
      accessToken: '',
      devAgentKey: '',
    }),
    {}
  )
})

test('generation failures are actionable constants, never raw JSON bodies', () => {
  assert.equal(
    generationErrorMessage(401, 'Image generation failed'),
    'Войдите через Telegram или подтверждённую сессию и повторите.'
  )
  assert.equal(
    generationErrorMessage(402, 'Image generation failed'),
    'Недостаточно токенов для этой генерации.'
  )
  assert.equal(
    generationErrorMessage(503, 'Image generation failed'),
    'Генерация временно недоступна. Попробуйте позже.'
  )
  assert.equal(
    generationErrorMessage(500, 'Image generation failed'),
    'Image generation failed'
  )
})

test('Image, Video, Voice and Avatar all use the same credential boundary', () => {
  const source = readFileSync(
    new URL(
      '../../apps/vibee-editor/player/src/lib/generateApi.ts',
      import.meta.url
    ),
    'utf8'
  )
  assert.match(source, /getAppAccessToken\(\)/)
  assert.equal(source.match(/\.\.\.authHeaders\(\)/g)?.length, 4)
})

test('Script generation uses the shared server-session credential boundary', () => {
  const source = readFileSync(
    new URL(
      '../../apps/vibee-editor/player/src/atoms/script.ts',
      import.meta.url
    ),
    'utf8'
  )
  assert.match(source, /import \{ authHeaders \} from '@\/lib\/apiFetch'/)
  assert.match(source, /headers: authHeaders\(\)/)
})

test('billing uses the identity from a verified server session', () => {
  assert.equal(
    generationOwnerId({ via: 'session', telegramId: '4242' }, null),
    '4242'
  )
})

test('Telegram billing uses only the separately verified initData id', () => {
  assert.equal(generationOwnerId({ via: 'telegram' }, '4242'), '4242')
  assert.equal(generationOwnerId({ via: 'telegram' }, null), null)
})

test('an agent key cannot silently become a Mini App billing identity', () => {
  assert.equal(
    generationOwnerId({ via: 'agent-key', telegramId: '4242' }, null),
    null
  )
})

test('only a verified server API key may bypass resource-layer billing', () => {
  assert.equal(mayBypassGenerationBilling({ via: 'api-key' }), true)
  assert.equal(mayBypassGenerationBilling({ via: 'session' }), false)
  assert.equal(mayBypassGenerationBilling({ via: 'telegram' }), false)
  assert.equal(mayBypassGenerationBilling({ via: 'agent-key' }), false)
})

test('all billed AI handlers pass the verified auth result into billing', () => {
  const source = readFileSync(
    new URL('../../apps/vibee-editor/render/render-server.ts', import.meta.url),
    'utf8'
  )
  assert.equal(
    source.match(/chargeMiniAppUser\(req, '[^']+', auth\)/g)?.length,
    4
  )
  assert.match(source, /startJob\('video', billedTid \?\? '', prompt\)/)
})

test('unpriced lipsync fails before reading a body or contacting the provider', () => {
  const source = readFileSync(
    new URL('../../apps/vibee-editor/render/render-server.ts', import.meta.url),
    'utf8'
  )
  const start = source.indexOf("req.url === '/api/generate/lipsync'")
  const end = source.indexOf('req.url === ', start + 40)
  const handler = source.slice(start, end === -1 ? start + 9000 : end)
  const priceGate = handler.indexOf('TOKEN_PRICES.lipsync_generate')
  const bodyRead = handler.indexOf("req.on('data'")
  const provider = handler.indexOf("fetch(\n          'https://queue.fal.run")
  assert.ok(priceGate >= 0 && priceGate < bodyRead)
  assert.ok(priceGate < provider)
  assert.match(handler, /chargeMiniAppUser\(req, 'lipsync_generate', auth\)/)
  assert.match(handler, /refundMiniAppUser\(billedTid, 'lipsync_generate'\)/)
})

test('script provider spending is an explicit disabled capability, not a price-table switch', () => {
  const source = readFileSync(
    new URL('../../apps/vibee-editor/render/render-server.ts', import.meta.url),
    'utf8'
  )
  const start = source.indexOf("req.url === '/api/ai/generate-script'")
  const end = source.indexOf('req.url === ', start + 40)
  const handler = source.slice(start, end === -1 ? start + 12000 : end)
  const capabilityGate = handler.indexOf('SCRIPT_GENERATION_ENABLED')
  const bodyRead = handler.indexOf("req.on('data'")
  assert.ok(capabilityGate >= 0 && capabilityGate < bodyRead)
  assert.match(source, /const SCRIPT_GENERATION_ENABLED = false/)
  assert.doesNotMatch(
    handler.slice(0, bodyRead),
    /TOKEN_PRICES\.script_generate/
  )
})

test('voice UI and audio route never promise a voice that a fallback ignores', () => {
  const voices = readFileSync(
    new URL(
      '../../apps/vibee-editor/player/src/atoms/voices.ts',
      import.meta.url
    ),
    'utf8'
  )
  const server = readFileSync(
    new URL('../../apps/vibee-editor/render/render-server.ts', import.meta.url),
    'utf8'
  )
  const panel = readFileSync(
    new URL(
      '../../apps/vibee-editor/player/src/components/Panels/GeneratePanel.tsx',
      import.meta.url
    ),
    'utf8'
  )
  const start = server.indexOf("req.url === '/api/generate/audio'")
  const end = server.indexOf('req.url === ', start + 40)
  const handler = server.slice(start, end)
  assert.doesNotMatch(voices, /FALLBACK_VOICES|Sarah|Rachel|Josh/)
  assert.doesNotMatch(handler, /generateAudioViaReplicate/)
  assert.match(panel, /if \(!hasValidAudioVoice\) return/)
  assert.match(
    panel,
    /disabled=\{[\s\S]*?isGenerating \|\|[\s\S]*?isLoadingVoices \|\|[\s\S]*?!audioText\.trim\(\) \|\|[\s\S]*?!hasValidAudioVoice[\s\S]*?\}/
  )
  const loadingAt = voices.indexOf('set(voicesLoadingAtom, true)')
  const clearRegistryAt = voices.indexOf('set(voicesAtom, [])', loadingAt)
  const clearSelectionAt = voices.indexOf(
    "set(selectedVoiceAtom, '')",
    loadingAt
  )
  const fetchAt = voices.indexOf('await fetch(', loadingAt)
  assert.ok(loadingAt >= 0)
  assert.ok(clearRegistryAt > loadingAt && clearRegistryAt < fetchAt)
  assert.ok(clearSelectionAt > loadingAt && clearSelectionAt < fetchAt)
})

test('persisted fake or removed voice ids reconcile to the live registry', () => {
  const live = [{ id: 'real-a' }, { id: 'real-b' }]
  assert.equal(reconcileVoiceSelection('real-b', live), 'real-b')
  assert.equal(reconcileVoiceSelection('sarah', live), 'real-a')
  assert.equal(reconcileVoiceSelection('', live), 'real-a')
  assert.equal(reconcileVoiceSelection('sarah', []), '')
})

test('voice errors never reveal credential-derived prefixes or provider bodies', () => {
  const server = readFileSync(
    new URL('../../apps/vibee-editor/render/render-server.ts', import.meta.url),
    'utf8'
  )
  assert.doesNotMatch(server, /key\.slice\(0,\s*3\)/)
  assert.match(server, /error: 'voice provider unavailable'/)
})
