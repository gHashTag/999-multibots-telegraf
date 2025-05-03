import {
  describe,
  it,
  expect,
  beforeEach,
  mock,
  afterEach,
  spyOn,
} from 'bun:test'
import {
  generateTextToImage,
  GenerateTextToImageDependencies,
} from '@/modules/generateTextToImage'
import { GenerationResult } from '@/interfaces'
import { logger as LoggerMock } from '@/utils/logger'
import type { SupabaseClient } from '@supabase/supabase-js'
import type Replicate from 'replicate'
import type { Telegraf } from 'telegraf'
import type { MyContext } from '@/interfaces'
import { IMAGES_MODELS } from '@/price/models/IMAGES_MODELS'
import fs from 'fs'
import path from 'path'
import { Message, Update } from 'telegraf/types'
import { User } from '@/interfaces/user.interface'
import * as replicateModule from '@/core/replicate'
import * as helpersErrorModule from '@/helpers/error'
import * as saveFileLocallyModule from '@/helpers/saveFileLocally'
import * as supabaseModuleForSpy from '@/core/supabase'

// --- Мокирование зависимостей --- //

// Mocking the entire dependencies object required by the new function signature
const createMockDependencies = (): GenerateTextToImageDependencies => ({
  logger: {
    info: mock(() => {}),
    error: mock(() => {}),
  },
  supabase: {
    from: mock(() => ({
      select: mock(() => ({
        eq: mock(() => ({
          single: mock(() =>
            Promise.resolve({
              data: { level: 1, aspect_ratio: '1:1' },
              error: null,
            })
          ),
        })),
      })),
    })),
    rpc: mock((fnName: string, args: any) => {
      if (fnName === 'increment_user_level') {
        return Promise.resolve({ error: null })
      }
      return Promise.resolve({
        error: { message: `Mock RPC ${fnName} not implemented` },
      })
    }), // CORRECTED: Added closing parenthesis
  } as unknown as SupabaseClient, // Keep outer cast
  replicate: {
    run: mock(
      (): Promise<string[]> =>
        Promise.resolve(['http://example.com/mock-replicate-image.jpeg'])
    ), // CORRECTED: Added closing parenthesis
  } as unknown as Replicate, // CORRECTED: Cast to unknown first
  telegram: {
    sendMessage: mock(() => Promise.resolve({})),
    sendPhoto: mock(() => Promise.resolve({})),
    // Add other telegram methods used by the module if necessary
  } as unknown as Telegraf<MyContext>['telegram'], // CORRECTED: Cast to unknown first
  fsCreateReadStream: mock(fs.createReadStream),
  pathBasename: mock(path.basename),
  processBalance: mock(
    // Adjust mock signature to match ProcessBalanceFunction in types.ts
    (_ctx: MyContext, _modelKey: string, _isRu: boolean) =>
      Promise.resolve({ success: true, newBalance: 90, paymentAmount: 10 })
  ),
  processImageApiResponse: mock(
    async (output: string[] | string): Promise<string> => {
      if (Array.isArray(output) && output.length > 0) return output[0]
      if (typeof output === 'string') return output
      throw new Error('Mock processImageApiResponse received invalid input')
    }
  ),
  saveImagePrompt: mock(
    // Adjust mock signature to match SaveImagePromptFunction
    (
      _prompt: string,
      _modelKey: string,
      _localUrl: string,
      _tgId: number
    ): Promise<number> => Promise.resolve(999)
  ),
  saveImageLocally: mock(
    // Adjust mock signature to match SaveImageLocallyFunction
    (
      _tgId: string,
      _imageUrl: string,
      _subfolder: string,
      _ext: string
    ): Promise<string> => Promise.resolve('/mock/path/image.jpeg')
  ),
  getAspectRatio: mock(
    // This dependency might be removed if aspect ratio comes from supabase.from().select()
    (_telegramId: number): Promise<string> => Promise.resolve('1:1')
  ),
  sendErrorToUser: mock(() => Promise.resolve()),
  sendErrorToAdmin: mock(() => Promise.resolve()),
  imageModelsConfig: IMAGES_MODELS, // Use real config or a simplified mock version
})

// --- Тесты --- //

describe('Module: generateTextToImage', () => {
  let mockDependencies: GenerateTextToImageDependencies

  beforeEach(() => {
    mockDependencies = createMockDependencies()
    // Reset mocks - iterate through the created mock object
    Object.values(mockDependencies.logger).forEach(fn =>
      (fn as any).mockClear()
    )
    ;(mockDependencies.supabase.from as any).mockClear()
    ;(mockDependencies.supabase.rpc as any).mockClear()
    ;(mockDependencies.replicate.run as any).mockClear()
    ;(mockDependencies.telegram.sendMessage as any).mockClear()
    ;(mockDependencies.telegram.sendPhoto as any).mockClear()
    ;(mockDependencies.fsCreateReadStream as any).mockClear()
    ;(mockDependencies.pathBasename as any).mockClear()
    ;(mockDependencies.processBalance as any).mockClear()
    ;(mockDependencies.processImageApiResponse as any).mockClear()
    ;(mockDependencies.saveImagePrompt as any).mockClear()
    ;(mockDependencies.saveImageLocally as any).mockClear()
    ;(mockDependencies.getAspectRatio as any).mockClear()
    ;(mockDependencies.sendErrorToUser as any).mockClear()
    ;(mockDependencies.sendErrorToAdmin as any).mockClear()
  })

  afterEach(() => {
    // Bun's mock.restore() might not be needed if we manually clear
    // mock.restore();
  })

  it('should successfully generate an image with valid inputs', async () => {
    // Arrange
    const requestData = {
      prompt: 'a test prompt',
      model_type: 'stability-ai/stable-diffusion-3',
      num_images: 1,
      telegram_id: '12345',
      username: 'testuser',
      is_ru: true,
    }

    // Act
    const results = await generateTextToImage(requestData, mockDependencies)

    // Assert
    expect(results).toBeInstanceOf(Array)
    expect(results.length).toBe(1)
    expect(results[0]).toHaveProperty('image')
    expect(results[0]).toHaveProperty('prompt_id')
    expect(results[0].image).toBe('/uploads/12345/text-to-image/image.jpeg') // Based on saveImageLocally mock
    expect(results[0].prompt_id).toBe(999) // Based on saveImagePrompt mock

    // Verify dependency calls
    expect(mockDependencies.logger.info).toHaveBeenCalled()
    expect(mockDependencies.supabase.from).toHaveBeenCalledWith('users')
    // Check if rpc was called for level up (depends on mock user level)
    // expect(mockDependencies.supabase.rpc).toHaveBeenCalledWith('increment_user_level', { user_tid: '12345' });
    expect(mockDependencies.processBalance).toHaveBeenCalledWith(
      expect.anything(), // tempCtx
      requestData.model_type.toLowerCase(),
      requestData.is_ru
    )
    expect(mockDependencies.replicate.run).toHaveBeenCalledTimes(1)
    expect(mockDependencies.processImageApiResponse).toHaveBeenCalledTimes(1)
    expect(mockDependencies.saveImageLocally).toHaveBeenCalledTimes(1)
    expect(mockDependencies.saveImagePrompt).toHaveBeenCalledTimes(1)
    expect(mockDependencies.telegram.sendPhoto).toHaveBeenCalledTimes(1)
    expect(mockDependencies.telegram.sendMessage).toHaveBeenCalled() // Called for progress and final message
  })

  it('should handle insufficient balance', async () => {
    // Arrange
    const requestData = {
      prompt: 'expensive art',
      model_type: 'stability-ai/stable-diffusion-3',
      num_images: 1,
      telegram_id: '54321',
      username: 'pooruser',
      is_ru: false,
    }
    // Override processBalance mock for this test
    mockDependencies.processBalance = mock(() =>
      Promise.resolve({
        success: false,
        paymentAmount: 10,
        error: 'Insufficient funds',
      })
    )

    // Act
    let errorThrown: Error | null = null
    try {
      await generateTextToImage(requestData, mockDependencies)
    } catch (error) {
      errorThrown = error as Error
    }

    // Assert
    expect(errorThrown).not.toBeNull() // Check that an error was actually thrown
    expect(errorThrown?.message).toBe('Insufficient stars') // Check the error message

    // Verify that generation steps were not called
    expect(mockDependencies.replicate.run).not.toHaveBeenCalled()
    expect(mockDependencies.telegram.sendPhoto).not.toHaveBeenCalled()
    expect(mockDependencies.saveImagePrompt).not.toHaveBeenCalled()
  })

  it('should handle Replicate API errors gracefully', async () => {
    // Arrange
    const requestData = {
      prompt: 'error case',
      model_type: 'stability-ai/stable-diffusion-3',
      num_images: 1,
      telegram_id: '11111',
      username: 'erroruser',
      is_ru: true,
    }
    // Override replicate.run mock
    mockDependencies.replicate.run = mock(() =>
      Promise.reject(new Error('Replicate failed'))
    )

    // Act
    const results = await generateTextToImage(requestData, mockDependencies)

    // Assert
    expect(results).toEqual([]) // Expect empty results on error
    expect(mockDependencies.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error generating image 1'),
      expect.anything()
    )
    // Check if final error message was sent
    expect(mockDependencies.telegram.sendMessage).toHaveBeenCalledWith(
      requestData.telegram_id,
      expect.stringContaining('Не удалось сгенерировать') // Check for Russian error message
    )
  })

  it('should handle multiple images generation', async () => {
    // Arrange
    const requestData = {
      prompt: 'multiple images',
      model_type: 'stability-ai/stable-diffusion-3',
      num_images: 3,
      telegram_id: '22222',
      username: 'multiuser',
      is_ru: false,
    }

    // Act
    const results = await generateTextToImage(requestData, mockDependencies)

    // Assert
    expect(results.length).toBe(3) // Should generate 3 images
    expect(mockDependencies.replicate.run).toHaveBeenCalledTimes(3)
    expect(mockDependencies.processImageApiResponse).toHaveBeenCalledTimes(3)
    expect(mockDependencies.saveImageLocally).toHaveBeenCalledTimes(3)
    expect(mockDependencies.saveImagePrompt).toHaveBeenCalledTimes(3)
    expect(mockDependencies.telegram.sendPhoto).toHaveBeenCalledTimes(3)
    // Check progress messages
    expect(mockDependencies.telegram.sendMessage).toHaveBeenCalledWith(
      requestData.telegram_id,
      expect.stringContaining('Generating image 1 of 3')
    )
    expect(mockDependencies.telegram.sendMessage).toHaveBeenCalledWith(
      requestData.telegram_id,
      expect.stringContaining('Generating image 2 of 3')
    )
    expect(mockDependencies.telegram.sendMessage).toHaveBeenCalledWith(
      requestData.telegram_id,
      expect.stringContaining('Generating image 3 of 3')
    )
    // Check final message
    expect(mockDependencies.telegram.sendMessage).toHaveBeenCalledWith(
      requestData.telegram_id,
      expect.stringContaining('Your images (3/3) have been generated!'),
      expect.anything() // For reply_markup
    )
  })

  // Add more tests: invalid model, API returning non-URL, user not found, etc.
})
