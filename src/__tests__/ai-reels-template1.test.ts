/**
 * Тесты для AI Reels Шаблон 1 (WAN25)
 * Проверяем каждый шаг процесса генерации
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  spyOn,
  mock,
} from 'bun:test'
import axios from 'axios'
import { KieVeedFabricProvider } from '@/core/lipsync/providers/kie-veed-fabric-provider'
import { lipSyncProviderFactory } from '@/core/lipsync/providers/provider-factory'
import type { ILipSyncProvider } from '@/core/lipsync/interfaces/lipsync-provider.interface'
import { lipSyncOrchestrator } from '@/core/lipsync/lipsync-orchestrator'
import { LipSyncInputBuilder } from '@/core/lipsync/schemas/lipsync-schemas'

// Мокаем переменные окружения
const originalEnv = process.env

describe('AI Reels Шаблон 1 - Полный тест', () => {
  beforeEach(() => {
    // Устанавливаем тестовые переменные окружения
    process.env = {
      ...originalEnv,
      KIE_AI_API_KEY: 'test-kie-key',
      ELEVENLABS_API_KEY: 'test-elevenlabs-key',
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  /*
   * "Step 1: Обработка изображения" stood here and has been removed.
   *
   * Both of its tests wrote a literal URL and then asserted things about that
   * literal -- that 'https://example.com/test-image.jpg' matches /^https?:/
   * and is under 1000 characters. No project code was called, so nothing could
   * make them fail. Worse, they read as proof that we validate an image URL
   * and its size: we do not. LipSyncInputBuilder.forVeedFabric copies imageUrl
   * through untouched, so 'invalid-url' reaches Kie and we pay for the refusal.
   * That gap is real and now unclaimed, which is the honest state.
   */

  describe('Step 2: Генерация lip-sync видео', () => {
    it('должен создавать правильный input для Kie.ai', () => {
      const input = LipSyncInputBuilder.forVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789',
        {
          botName: 'test-bot',
          resolution: '720p',
          isAudioUrl: true,
        }
      )

      expect(input.provider).toBe('kie')
      expect(input.modelId).toBe('veed-fabric')
      expect(input.imageUrl).toBe('https://example.com/image.jpg')
      expect(input.audioUrl).toBe('https://example.com/audio.mp3')
      expect(input.telegramId).toBe('123456789')
      expect(input.resolution).toBe('720p')
    })

    it('должен обрабатывать текст вместо аудио', () => {
      const input = LipSyncInputBuilder.forVeedFabric(
        'https://example.com/image.jpg',
        'Тестовый текст для генерации',
        '123456789',
        {
          botName: 'test-bot',
          resolution: '720p',
          isAudioUrl: false,
        }
      )

      expect(input.text).toBe('Тестовый текст для генерации')
      expect(input.audioUrl).toBeUndefined()
    })
  })

  /**
   * Step 3: the fallback poll, against a stubbed Kie.ai.
   *
   * These two tests used to call the real endpoint with the fake key set in
   * `beforeEach` and then assert the SHAPE OF THE REFUSAL ("has an `error`
   * property"). That asserted nothing about our code: it passed while Kie
   * answered 401 quickly, and went red the moment the refusal changed shape --
   * which is exactly how it was found, failing on a clean tree.
   *
   * What matters here is the translation of `data.state` into our own result,
   * because getting that wrong is what let a finished job run to the 10-minute
   * timeout and be refunded. So the transport is stubbed and every state the
   * unified job-status query can return is asserted, including the network
   * failure the old tests were accidentally exercising.
   */
  describe('Step 3: Polling статуса', () => {
    /*
     * The constructor is deliberately stepped around, and that is the point.
     *
     * It throws without KIE_AI_API_KEY, and that key is read from process.env
     * ONCE, at import time in @/config -- long before `beforeEach` can set it.
     * So these tests only ever passed on a machine that had a real Kie key in
     * its environment, and on that machine they reached the live API. That is
     * what made them red here on a clean checkout.
     *
     * `getStatus` reads no instance state: the endpoint comes from KIE_JOBS and
     * the key from the module constant. The prototype IS the unit under test.
     */
    const provider = (): KieVeedFabricProvider =>
      Object.create(KieVeedFabricProvider.prototype)
    let getSpy: ReturnType<typeof spyOn>

    const replyWith = (data: unknown) => {
      getSpy = spyOn(axios, 'get').mockResolvedValue({
        status: 200,
        statusText: 'OK',
        data,
      } as never)
    }

    afterEach(() => getSpy?.mockRestore())

    it('returns the finished video when the job succeeded', async () => {
      // The URL arrives inside resultJson as a STRING, not as a field.
      replyWith({
        data: {
          state: 'success',
          resultJson: JSON.stringify({
            resultUrls: ['https://kie.test/out.mp4'],
          }),
        },
      })

      const result = await provider().getStatus('task-1')

      expect(result).toMatchObject({
        status: 'completed',
        output: 'https://kie.test/out.mp4',
        taskId: 'task-1',
      })
      expect(result).not.toHaveProperty('error')
    })

    it('reports the failure Kie gave, not a generic one', async () => {
      replyWith({ data: { state: 'fail', failMsg: 'face not detected' } })

      const result = await provider().getStatus('task-2')

      expect(result).toMatchObject({
        code: 'TASK_FAILED',
        error: 'face not detected',
      })
    })

    it('keeps polling while the job is still in flight', async () => {
      // waiting / queuing / generating must NOT read as a failure: treating an
      // unfinished job as failed is what refunds work that is still running.
      for (const state of ['waiting', 'queuing', 'generating']) {
        replyWith({ data: { state } })

        const result = await provider().getStatus('task-3')

        expect(result).toMatchObject({ status: 'processing', output: '' })
        expect(result).not.toHaveProperty('error')
        getSpy.mockRestore()
      }
    })

    it('does not call a succeeded job failed when the URL is unreadable', async () => {
      // A broken resultJson is our parsing problem, not Kie's verdict.
      replyWith({ data: { state: 'success', resultJson: '{not json' } })

      const result = await provider().getStatus('task-4')

      expect(result).toMatchObject({ status: 'processing' })
    })

    it('answers with an error when the poll itself cannot be made', async () => {
      getSpy = spyOn(axios, 'get').mockRejectedValue(
        new Error('socket hang up')
      )

      const result = await provider().getStatus('task-5')

      expect(result).toHaveProperty('error')
      expect(result).toHaveProperty('message')
    })
  })

  /**
   * The orchestrator, against a stub provider.
   *
   * The same disease as Step 3: these two asked the real orchestrator to
   * generate and then asserted it had failed. Both were green here only
   * because the Kie constructor throws without an API key -- on a machine that
   * HAS the key they would have posted a live generation job. Neither said
   * anything about the orchestrator.
   *
   * What the orchestrator actually owes its callers: refuse a model the
   * provider does not support WITHOUT calling it, hand a provider's own error
   * back unchanged rather than flattening it, pass a success through, and turn
   * a thrown provider into an error result instead of a rejected promise.
   */
  describe('Интеграционные тесты', () => {
    const input = () =>
      LipSyncInputBuilder.forVeedFabric(
        'https://example.com/image.jpg',
        'Тестовый текст',
        '123456789',
        { botName: 'test-bot', resolution: '720p', isAudioUrl: false }
      )

    let factorySpy: ReturnType<typeof spyOn>

    const useProvider = (stub: Partial<ILipSyncProvider>) => {
      factorySpy = spyOn(
        lipSyncProviderFactory,
        'createProvider'
      ).mockReturnValue({
        providerId: 'kie',
        providerName: 'stub',
        supportedModels: ['veed-fabric'],
        ...stub,
      } as ILipSyncProvider)
    }

    afterEach(() => factorySpy?.mockRestore())

    it('returns the provider output untouched on success', async () => {
      const generate = mock(async () => ({
        id: 'job-1',
        output: 'https://kie.test/done.mp4',
        status: 'completed',
      }))
      useProvider({ generate })

      const result = await lipSyncOrchestrator.generate(input())

      expect(result).toMatchObject({ output: 'https://kie.test/done.mp4' })
      expect(generate).toHaveBeenCalledTimes(1)
    })

    it("hands back the provider's own error, not a generic one", async () => {
      // Flattening this into "generation failed" is how a refund loses the
      // reason it happened.
      useProvider({
        generate: mock(async () => ({
          message: 'Veed rejected the image',
          error: 'no face detected',
          code: 'TASK_FAILED',
        })),
      })

      const result = await lipSyncOrchestrator.generate(input())

      expect(result).toMatchObject({
        code: 'TASK_FAILED',
        error: 'no face detected',
      })
    })

    it('refuses an unsupported model without calling the provider', async () => {
      // The charge happens inside the provider, so reaching it at all with a
      // model it cannot run is a way to pay for nothing.
      const generate = mock(async () => ({ output: 'should never happen' }))
      useProvider({ supportedModels: ['something-else'], generate })

      const result = await lipSyncOrchestrator.generate(input())

      expect(result).toMatchObject({ code: 'UNSUPPORTED_MODEL' })
      expect(generate).not.toHaveBeenCalled()
    })

    it('turns a thrown provider into an error result, not a rejection', async () => {
      // A rejected promise here would propagate out of the wizard and leave
      // the person with no message at all.
      useProvider({
        generate: mock(async () => {
          throw new Error('socket hang up')
        }),
      })

      const result = await lipSyncOrchestrator.generate(input())

      expect(result).toMatchObject({
        code: 'ORCHESTRATOR_ERROR',
        error: 'socket hang up',
      })
    })
  })

  /**
   * What the builder actually decides, since it is the only thing between the
   * wizard and the provider.
   *
   * This replaces "Валидация параметров", whose three tests asserted
   * `501 > 500`, `['480p','720p','1080p']` contains `'720p'`, and `35 > 30` --
   * arithmetic on literals, no project code involved. They also recorded two
   * numbers the product does not have: the real caps are 5000 characters and
   * 30 seconds, both enforced in ai-reels-wizard.ts, and 1080p is not a
   * resolution this model accepts at all.
   *
   * "Обработка ошибок" is gone for the same reason: it built a literal object
   * and asserted the literal had the keys it had just been given.
   */
  describe('Валидация параметров', () => {
    it('falls back to 480p, the cheaper render, when none is asked for', () => {
      const input = LipSyncInputBuilder.forVeedFabric(
        'https://example.com/image.jpg',
        'Тестовый текст',
        '123456789',
        { botName: 'test-bot', isAudioUrl: false }
      )

      expect(input.resolution).toBe('480p')
    })

    it('never sets both text and audioUrl, whichever way it is called', () => {
      // The provider branches on audioUrl first: if both were set, a voice
      // message would silently be re-voiced by ElevenLabs and charged twice.
      const fromText = LipSyncInputBuilder.forVeedFabric(
        'https://example.com/image.jpg',
        'Тестовый текст',
        '123456789',
        { isAudioUrl: false }
      )
      const fromAudio = LipSyncInputBuilder.forVeedFabric(
        'https://example.com/image.jpg',
        'https://example.com/audio.mp3',
        '123456789',
        { isAudioUrl: true }
      )

      expect(fromText.audioUrl).toBeUndefined()
      expect(fromAudio.text).toBeUndefined()
    })
  })
})
