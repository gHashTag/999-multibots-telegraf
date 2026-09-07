import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Provider, createStore } from 'jotai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GeneratePanel } from './GeneratePanel'
import { generateAudio } from '@/lib/generateApi'
import { selectedVoiceAtom, voicesAtom, voicesErrorAtom } from '@/atoms/voices'
import { languageAtom } from '@/atoms/language'

vi.mock('@/lib/generateApi', () => ({
  generateAudio: vi.fn(async () => ({
    success: false,
    error: 'Mock provider unavailable',
  })),
  generateImage: vi.fn(),
  generateImageViaReplicate: vi.fn(),
  generateVideo: vi.fn(),
  generateLipsync: vi.fn(),
  isMockMode: () => true,
}))
vi.mock('@/lib/balance', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/balance')>()),
  загрузитьБаланс: vi.fn(async () => null), // cyrillic-ok: existing API or fixture identifier
}))
vi.mock('@/store/editorStore', () => ({
  useEditorStore: (select: (state: unknown) => unknown) =>
    select({ addItem: vi.fn() }),
}))
vi.mock('../Modals/PublishModal', () => ({ PublishModal: () => null }))
vi.mock('@/hooks/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    isRecording: false,
    audioBlob: null,
    duration: 0,
    error: null,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    clearRecording: vi.fn(),
  }),
}))

const primaryModel = 'kie/elevenlabs/text-to-speech-multilingual-v2'
let root: Root
let host: HTMLDivElement
let store: ReturnType<typeof createStore>

const button = (text: string) => {
  const found = [...host.querySelectorAll('button')].find(b =>
    b.textContent?.includes(text)
  )
  if (!found) throw new Error(`Missing button: ${text}`)
  return found
}
const click = async (text: string) => {
  await act(async () => button(text).click())
}

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  vi.clearAllMocks()
  // All external reads are explicitly failed: Kie must not depend on Direct.
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: false,
            error: 'Direct credential unavailable',
          }),
          { status: 503 }
        )
    )
  )
  store = createStore()
  store.set(languageAtom, 'en')
  store.set(voicesAtom, [
    {
      id: 'Russian_ReliableMan',
      name: 'Old provider voice',
      category: 'premade',
    },
  ])
  store.set(selectedVoiceAtom, 'Russian_ReliableMan')
  store.set(voicesErrorAtom, 'Stale direct credential error')
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function mount() {
  await act(async () =>
    root.render(
      <Provider store={store}>
        <GeneratePanel activeTab="audio" />
      </Provider>
    )
  )
}
async function enterText() {
  await act(async () => {
    const input = host.querySelector('textarea')!
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value'
    )!.set!.call(input, 'Hello from the test')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('primary speech provider', () => {
  it('selects and orders Kie first without requesting the direct voice catalog', async () => {
    await mount()
    const models = [
      ...host.querySelectorAll('.model-buttons'),
    ][0].querySelectorAll('button')
    expect(models[0].textContent).toContain('Kie')
    expect(models[0].getAttribute('aria-pressed')).toBe('true')
    expect(host.textContent).not.toContain('Stale direct credential error')
    expect(host.textContent).not.toContain('Old provider voice')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('submits Kie with its stock voice, never the persisted MiniMax voice', async () => {
    await mount()
    await enterText()
    await click('Generate Audio')
    expect(generateAudio).toHaveBeenCalledTimes(1)
    expect(generateAudio).toHaveBeenCalledWith({
      model: primaryModel,
      text: 'Hello from the test',
      voiceId: 'Rachel',
      voiceName: 'Rachel',
      speed: 1,
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('loads Direct only on explicit selection, then hides its failure on return to Kie', async () => {
    await mount()
    await click('ElevenLabs')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('Direct credential unavailable')
    await click('Kie ·')
    expect(host.textContent).not.toContain('Direct credential unavailable')
    await enterText()
    await click('Generate Audio')
    expect(vi.mocked(generateAudio).mock.calls[0][0].model).toBe(primaryModel)
    expect(vi.mocked(generateAudio).mock.calls[0][0].voiceId).toBe('Rachel')
  })

  it('clears a prior generation error when switching providers', async () => {
    await mount()
    await enterText()
    await click('Generate Audio')
    expect(host.textContent).toContain('Mock provider unavailable')
    await click('ElevenLabs')
    expect(host.textContent).not.toContain('Mock provider unavailable')
  })

  it('does not offer MiniMax voices as usable Direct voices', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          provider: 'replicate/minimax-speech-02-turbo',
          voices: [
            {
              id: 'Russian_ReliableMan',
              name: 'MiniMax stock',
              category: 'premade',
            },
          ],
        })
      )
    )
    await mount()
    await click('ElevenLabs')
    await enterText()
    expect(host.textContent).not.toContain('MiniMax stock')
    expect(button('Generate Audio').disabled).toBe(true)
    await click('Kie ·')
    expect(button('Generate Audio').disabled).toBe(false)
  })
})
