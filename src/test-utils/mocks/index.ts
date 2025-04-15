import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import mock from '@/test-utils/core/mock'
import { Context } from 'telegraf'
import { mockFn } from '../core/mockFunction'
import { IMockFunction } from '../types/MockFunction'
import { mockBot, getMockBot } from './bot'
import { mockSupabase } from './supabase'

/**
 * Mock implementations for external services and dependencies
 */

// Bot-related mocks
export { mockBot, getMockBot }

// Database mocks
export { mockSupabase }

// Service mocks
export * from './elevenlabs.mock'
export * from './inngestMock'

// Context mocks
export * from './context'

// Types
export * from './types'

/**
 * Mock function for getting bot instance by name
 */
export const getBotByName = mockFn<(name: string) => any>()
  .mockImplementation((name: string) => {
    if (name === 'nonexistent_bot') {
      return { bot: null }
    }
    return { bot: mockBot }
  })

/**
 * Mock function for getting user balance
 */
export const getUserBalance = mockFn<(userId: number) => Promise<number>>()
  .mockImplementation(async (userId: number) => {
    if (userId === 123456) {
      return 1000 // Достаточный баланс для обычных операций
    }
    return 10 // Недостаточный баланс
  })

/**
 * Mock function for updating user balance
 */
export const updateUserBalance = mockFn<(userId: number, amount: number) => Promise<void>>()
  .mockImplementation(async () => {})

/**
 * Mock configuration for video models
 */
export const videoModels = {
  model1: { id: 'model1', name: 'Model 1', description: 'Test model 1' },
  model2: { id: 'model2', name: 'Model 2', description: 'Test model 2' },
}

/**
 * Mock axios request implementation
 */
export const mockAxiosRequest = mockFn<(config: any) => Promise<any>>()
  .mockImplementation(async (config: any) => {
    if (config.url.includes('error')) {
      throw new Error('Mock API error')
    }
    return { data: { success: true } }
  })

// Mock для конфигурации видео моделей
mock.object({
  VIDEO_MODELS_CONFIG: {
    test_model: {
      id: 'test_model',
      basePrice: 100,
      api: {
        model: 'test_model_v1',
        input: {}
      }
    },
    expensive_model: {
      id: 'expensive_model',
      basePrice: 2000,
      api: {
        model: 'expensive_model_v1',
        input: {}
      }
    },
    multi_output_model: {
      id: 'multi_output_model',
      basePrice: 150,
      api: {
        model: 'multi_output_model_v1',
        input: {}
      }
    }
  }
})

// Mock для axios
mock.object({
  post: async (url: string, data: any, config: any) => {
    if (data._test?.api_error) {
      throw new Error('API error (test)')
    }
    if (data._test?.timeout) {
      throw new Error('Video generation timed out')
    }
    if (data.videoModel === 'multi_output_model') {
      return {
        data: {
          id: 'test_prediction',
          output: ['video1.mp4', 'video2.mp4']
        }
      }
    }
    return {
      data: {
        id: 'test_prediction',
        output: 'video.mp4'
      }
    }
  },
  get: async (url: string, config: any) => {
    return {
      data: {
        status: 'succeeded',
        output: 'video.mp4'
      }
    }
  }
})