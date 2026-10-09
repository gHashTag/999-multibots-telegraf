import { afterEach, describe, expect, it, vi } from 'vitest'
import * as SPEC from './agent-provider-chain.gen'
import {
  RESERVE_MAX_TOKENS_DEFAULT,
  allProviders,
  demoteHead,
  demotedIndex,
  diagnose,
  headNote,
  kieModel,
  providerChain,
  providerOrder,
  reserveEnv,
  reserveMaxTokens,
} from '../agent/provider'
import {
  KNOWN_PROVIDERS,
  chooseProvider,
  forgetProviderChoiceForTests,
} from '../agent/provider-choice'
import { providerStatus } from '../agent/provider-status'

/**
 * THE PROVIDER CHAIN IS WRITTEN IN t27 FIRST (skill t27-spec-first).
 *
 * gHashTag/t27 specs/automation/agent-provider-chain.t27 is the spec of
 * record; the vendored copy and its generated module agree with it by
 * scripts/check-t27-specs.mjs. Here each `test` of the spec runs against the
 * HOST: src/agent/provider.ts (providerOrder, providerChain, diagnose) and
 * provider-status.ts, with the environment stubbed -- no network.
 *
 * v2 (#3659): a head without tools that the bot button did not choose moves
 * behind the first provider that calls tools; the bot pick still wins and is
 * flagged; a chain where nobody calls tools keeps its order and is flagged.
 *
 * v3 (2026-10-09): a Kie route right after zai -- Gemini over Kie's
 * OpenAI-compatible chat, key KIE_AI_API_KEY, a bounded max_tokens.
 *
 * Refresh: node scripts/sync-t27-spec.mjs <t27 checkout> automation/agent-provider-chain
 */

afterEach(() => {
  vi.unstubAllEnvs()
  forgetProviderChoiceForTests()
})

const three = () => {
  vi.stubEnv('RESERVE_BASE_URL', 'https://vendor.example/v1')
  vi.stubEnv('RESERVE_API_KEY', 'r')
  vi.stubEnv('RESERVE_MODEL', 'some/model')
}
const ids = () => allProviders().map(p => p.id)

describe('agent-provider-chain.t27 against the host', () => {
  it('the reserve route needs all three variables and sits after nemotron', () => {
    expect(SPEC.RESERVE_NEEDS_ALL_THREE).toBe(true)
    vi.stubEnv('RESERVE_BASE_URL', 'https://vendor.example/v1')
    vi.stubEnv('RESERVE_API_KEY', 'r')
    expect(reserveEnv()).toBeNull()
    vi.stubEnv('RESERVE_MODEL', 'some/model')
    expect(reserveEnv()).not.toBeNull()
    vi.stubEnv('RESERVE_BASE_URL', '')
    expect(reserveEnv()).toBeNull()
    const order = providerOrder()
    expect(order.join(',')).toBe(SPEC.ORDER_DEFAULT)
    expect(order).toHaveLength(SPEC.PROVIDERS)
    expect(order.indexOf(SPEC.RESERVE_ID)).toBe(
      order.indexOf(SPEC.RESERVE_AFTER) + 1
    )
    expect(order.indexOf(SPEC.RESERVE_BEFORE)).toBe(
      order.indexOf(SPEC.RESERVE_ID) + 1
    )
  })

  it("capabilities of the reserve model are the owner's declaration", async () => {
    three()
    const r = () => allProviders().find(p => p.id === 'reserve')!
    expect(r().thinking).toBe(SPEC.RESERVE_THINKING)
    expect(r().tools).toBe(true)
    vi.stubEnv(SPEC.RESERVE_ENV_TOOLS, '0')
    expect(r().tools).toBe(false)
    expect(r().vision).toBe(false)
    vi.stubEnv(SPEC.RESERVE_ENV_VISION, '1')
    expect(r().vision).toBe(true)
    expect(KNOWN_PROVIDERS).toContain(SPEC.RESERVE_ID)
    // OWNER_PICK_GOES_FIRST: the bot button moves one id to the front, the
    // rest keep their order.
    await chooseProvider(null, 'nemotron')
    expect(providerOrder()).toEqual([
      'nemotron',
      'zai',
      'kie',
      'zai-lite',
      'reserve',
      'ollama',
    ])
    // EVERY_CONFIGURED_PROVIDER_IS_TRIED and SKIPPED_PROVIDER_IS_LOGGED run
    // through the stream in a-skipped-provider-says-why.test.ts.
    expect(SPEC.EVERY_CONFIGURED_PROVIDER_IS_TRIED).toBe(true)
  })

  it('kie stands right after the free zai and before the routes that timed out', async () => {
    const order = providerOrder()
    expect(order.indexOf(SPEC.KIE_AFTER)).toBe(0)
    expect(order.indexOf(SPEC.KIE_ID)).toBe(order.indexOf(SPEC.KIE_AFTER) + 1)
    expect(order.indexOf(SPEC.KIE_BEFORE)).toBe(order.indexOf(SPEC.KIE_ID) + 1)
    expect(order.indexOf('nemotron')).toBeGreaterThan(order.indexOf('kie'))
    expect(order.indexOf('reserve')).toBeGreaterThan(order.indexOf('kie'))
    // kie_available(key): no key, no route; the key alone makes it.
    vi.stubEnv('GLM_API_KEY', 'g')
    vi.stubEnv('NVIDIA_API_KEY', 'n')
    vi.stubEnv(SPEC.KIE_ENV_KEY, '')
    expect(ids()).not.toContain('kie')
    vi.stubEnv(SPEC.KIE_ENV_KEY, 'k')
    expect(ids()).toEqual(['zai', 'kie', 'zai-lite', 'nemotron'])
    // KIE_IN_BOT_PICKER: the owner can put it first from the bot.
    expect(KNOWN_PROVIDERS).toContain(SPEC.KIE_ID)
    await chooseProvider(null, 'kie')
    expect(ids()[0]).toBe('kie')
  })

  it('kie calls tools by declaration, looks at nothing, and answers within a bound', () => {
    expect(SPEC.KIE_CAPABILITIES_DECLARED_NOT_MEASURED).toBe(true)
    expect(SPEC.KIE_ANSWERED_LIVE).toBe(false)
    vi.stubEnv('GLM_API_KEY', 'g')
    vi.stubEnv('NVIDIA_API_KEY', 'n')
    vi.stubEnv(SPEC.KIE_ENV_KEY, 'k')
    three()
    const by = (id: string) => allProviders().find(p => p.id === id)!
    const kie = by('kie')
    expect(kie.base).toBe(`${SPEC.KIE_BASE_ROOT}/${SPEC.KIE_MODEL_DEFAULT}/v1`)
    expect(kie.model).toBe('gemini-2.5-flash')
    expect(kie.tools).toBe(true)
    expect(kie.vision).toBe(false)
    expect(kie.audio).toBe(false)
    expect(kie.thinking).toBe(false)
    // Images still go to the provider that was measured to see them.
    expect(allProviders().find(p => p.vision)?.id).toBe('nemotron')
    // ceiling_for: kie 8192, reserve 1024, the rest send no max_tokens.
    expect(kie.maxTokens).toBe(8192)
    expect(by('reserve').maxTokens).toBe(1024)
    for (const id of ['zai', 'zai-lite', 'nemotron'])
      expect(by(id).maxTokens).toBeUndefined()
    // AGENT_MODEL names a GLM model; it never renames the Kie path.
    vi.stubEnv('AGENT_PROVIDER', 'kie')
    vi.stubEnv('AGENT_MODEL', 'glm-5.3')
    expect(by('kie').model).toBe(SPEC.KIE_MODEL_DEFAULT)
    // KIE_CHAT_MODEL switches the model and the path with it.
    vi.stubEnv(SPEC.KIE_ENV_MODEL, ' gemini-3-flash ')
    expect(kieModel()).toBe('gemini-3-flash')
    expect(by('kie').base).toBe('https://api.kie.ai/gemini-3-flash/v1')
    vi.stubEnv(SPEC.KIE_ENV_MODEL, '  ')
    expect(kieModel()).toBe(SPEC.KIE_MODEL_DEFAULT)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(3)
  })

  it('the reserve route is configured live; an answer from it is not claimed', () => {
    // Live observations, not host behaviour: the evidence lines of the spec.
    expect(SPEC.RESERVE_CONFIGURED_LIVE).toBe(true)
    expect(SPEC.RESERVE_ANSWERED_LIVE).toBe(false)
    expect(SPEC.RESERVE_PROBE_4_MAX_TOKENS_SENT).toBe(
      RESERVE_MAX_TOKENS_DEFAULT
    )
    expect(SPEC.RESERVE_BLOCKER_IS_KEY_BALANCE).toBe(true)
  })

  it('the reserve sends a bounded max_tokens and 402 is named', () => {
    expect(RESERVE_MAX_TOKENS_DEFAULT).toBe(SPEC.RESERVE_MAX_TOKENS_DEFAULT)
    for (const raw of [undefined, '', '0', '-5', 'abc'])
      expect(reserveMaxTokens(raw)).toBe(SPEC.RESERVE_MAX_TOKENS_DEFAULT)
    expect(reserveMaxTokens('2000')).toBe(2000)
    three()
    expect(reserveEnv()!.maxTokens).toBe(SPEC.RESERVE_MAX_TOKENS_DEFAULT)
    const funds = diagnose('reserve', SPEC.RESERVE_PROBE_4_STATUS, '{}')
    expect(diagnose('reserve', 200, 'requires more credits')).toBe(funds)
    expect(funds).not.toContain(String(SPEC.RESERVE_PROBE_4_STATUS))
  })

  it('a deploy-time head without tools moves behind the first one with tools', () => {
    expect(SPEC.DEPLOY_HEAD_NEEDS_TOOLS).toBe(true)
    expect(demoteHead(false, false, true)).toBe(true)
    expect(headNote(false, false, true)).toBe(SPEC.NOTE_DEMOTED)
    expect(demotedIndex(0)).toBe(1)
    expect(demotedIndex(2)).toBe(3)
    expect(demoteHead(false, true, true)).toBe(false)
    expect(headNote(false, true, true)).toBe(SPEC.NOTE_NONE)

    // 2026-10-05 on the host: AGENT_PROVIDER=ollama with z.ai keyed.
    vi.stubEnv('OLLAMA_ENABLED', '1')
    vi.stubEnv('GLM_API_KEY', 'g')
    vi.stubEnv('AGENT_PROVIDER', 'ollama')
    expect(ids()).toEqual(['zai', 'ollama', 'zai-lite'])
    expect(providerChain().note).toBe(SPEC.NOTE_DEMOTED)
    expect(providerStatus().head_note).toBe(SPEC.NOTE_DEMOTED)
    expect(providerStatus().current?.id).toBe('zai')

    // The first tools-capable provider further down: a reserve declared
    // without tools sits between, and the head lands behind nemotron.
    vi.stubEnv('GLM_API_KEY', '')
    vi.stubEnv('NVIDIA_API_KEY', 'n')
    three()
    vi.stubEnv(SPEC.RESERVE_ENV_TOOLS, '0')
    vi.stubEnv('AGENT_PROVIDER', 'reserve')
    expect(ids()).toEqual(['nemotron', 'reserve', 'ollama'])

    // A head that calls tools is left alone and says nothing.
    vi.stubEnv('AGENT_PROVIDER', 'nemotron')
    expect(ids()[0]).toBe('nemotron')
    expect(providerStatus().head_note).toBeNull()
  })

  it('the bot pick keeps the head without tools and is flagged', async () => {
    expect(SPEC.BOT_PICK_KEEPS_HEAD_WITHOUT_TOOLS).toBe(true)
    expect(SPEC.OWNER_PICK_GOES_FIRST).toBe(true)
    expect(demoteHead(true, false, true)).toBe(false)
    expect(headNote(true, false, true)).toBe(SPEC.NOTE_BOT_PICK)
    expect(headNote(true, true, true)).toBe(SPEC.NOTE_NONE)

    vi.stubEnv('OLLAMA_ENABLED', '1')
    vi.stubEnv('GLM_API_KEY', 'g')
    await chooseProvider(null, 'ollama')
    expect(ids()).toEqual(['ollama', 'zai', 'zai-lite'])
    expect(providerStatus().head_note).toBe(SPEC.NOTE_BOT_PICK)
    // The bot picked zai, the variable says ollama: zai heads, no note.
    await chooseProvider(null, 'zai')
    vi.stubEnv('AGENT_PROVIDER', 'ollama')
    expect(ids()[0]).toBe('zai')
    expect(providerStatus().head_note).toBeNull()
  })

  it('a chain where nobody calls tools keeps its order and is flagged', async () => {
    expect(SPEC.NO_TOOLS_CHAIN_KEEPS_ORDER).toBe(true)
    expect(demoteHead(false, false, false)).toBe(false)
    expect(headNote(false, false, false)).toBe(SPEC.NOTE_NO_TOOLS)
    expect(headNote(true, false, false)).toBe(SPEC.NOTE_BOT_PICK)

    vi.stubEnv('OLLAMA_ENABLED', '1')
    three()
    vi.stubEnv(SPEC.RESERVE_ENV_TOOLS, '0')
    vi.stubEnv('AGENT_PROVIDER', 'ollama')
    expect(ids()).toEqual(['ollama', 'reserve'])
    expect(providerStatus().head_note).toBe(SPEC.NOTE_NO_TOOLS)
    await chooseProvider(null, 'reserve')
    expect(ids()).toEqual(['reserve', 'ollama'])
    expect(providerStatus().head_note).toBe(SPEC.NOTE_BOT_PICK)
  })
})
