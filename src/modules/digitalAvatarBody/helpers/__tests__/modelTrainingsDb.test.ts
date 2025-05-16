import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock Supabase client interactions if not already globally mocked in setup.ts
// For now, we assume global mocks from setup.ts are active.
// If specific mock behaviors are needed, they can be set here or in beforeEach.

// Мокируем глобальный путь, который теперь используется в modelTrainingsDb.ts
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}))

// Импортируем logger из глобального пути, который мокируется
import { logger } from '@/utils/logger'

import {
  createDigitalAvatarTraining,
  updateDigitalAvatarTraining,
  setDigitalAvatarTrainingError,
  getDigitalAvatarTrainingById,
  getDigitalAvatarTrainingByReplicateIdWithUserDetails,
  ModelTraining,
  ModelTrainingArgs,
} from '../modelTrainingsDb'
import { supabase } from '@/core/supabase/client' // To potentially spy on or check mock calls
import type { DigitalAvatarUserProfile } from '../userProfileDb'

// Мокируем зависимости
vi.mock('@/core/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
  },
}))

describe('modelTrainingsDb helpers', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Explicitly reset mocks for Supabase operations if the global mock doesn't reset call history
    // This depends on how the global mock in setup.ts is configured.
    // For safety, let's assume we need to mock return values per test or describe block.
  })

  describe('createDigitalAvatarTraining', () => {
    it('should call supabase.insert with correct data (excluding telegram_id) and return the result', async () => {
      const args: ModelTrainingArgs = {
        user_id: 'user-123',
        telegram_id: 'tg-123',
        model_name: 'test-model',
        status: 'PENDING',
        trigger_word: 'test',
        cost_in_stars: 0,
        steps_amount: 0,
        bot_name: 'TestBot',
        api: 'replicate',
        gender: 'female',
      }
      const expectedInsertData = {
        ...args,
        error_message: undefined,
        model_url: undefined,
        replicate_model_version: undefined,
        replicate_training_id: undefined,
      }
      const mockReturnedData = {
        id: 'new-training-id',
        ...expectedInsertData,
        created_at: expect.any(String),
        updated_at: expect.any(String),
        public_url: null,
        photo_urls: null,
        message_id: null,
        cache_id: null,
        replicate_model_name: null,
        replicate_model_id: null,
      } as unknown as ModelTraining

      const mockSingle = vi
        .fn()
        .mockResolvedValue({ data: mockReturnedData, error: null })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any)

      const result = await createDigitalAvatarTraining(args)

      expect(supabase.from).toHaveBeenCalledWith('model_trainings')
      expect(mockInsert).toHaveBeenCalledWith([expectedInsertData])
      expect(result).toEqual(mockReturnedData)
    })

    it('should return null and log error if supabase.insert fails', async () => {
      const args: ModelTrainingArgs = {
        user_id: 'user-123',
        telegram_id: 'tg-123',
        model_name: 'test-model',
        status: 'PENDING',
        trigger_word: 'test',
        cost_in_stars: 0,
        steps_amount: 0,
        bot_name: 'TestBot',
        api: 'replicate',
        gender: 'female',
      }
      const expectedInsertData = {
        ...args,
        error_message: undefined,
        model_url: undefined,
        replicate_model_version: undefined,
        replicate_training_id: undefined,
      }

      const mockErrorFromSupabase = {
        message: 'Insert failed',
        details: 'DB constraint',
        hint: '',
        code: '',
      }

      const mockSingle = vi
        .fn()
        .mockResolvedValue({ data: null, error: mockErrorFromSupabase })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any)

      const result = await createDigitalAvatarTraining(args)

      expect(supabase.from).toHaveBeenCalledWith('model_trainings')
      expect(mockInsert).toHaveBeenCalledWith([expectedInsertData])
      expect(result).toBeNull()
      // Проверяем вызов глобально мокированного logger.error
      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        expect.stringContaining(
          '[DB Error] Failed to create digital avatar training record'
        ),
        expect.objectContaining({
          supabaseErrorMessage: mockErrorFromSupabase.message,
          originalArgs: args,
        })
      )
    })
  })

  describe('updateDigitalAvatarTraining', () => {
    it('should call supabase.update with correct data and return the result', async () => {
      const trainingId = 'train-id-123'
      const updates: Partial<
        Omit<ModelTraining, 'id' | 'created_at' | 'user_id' | 'telegram_id'>
      > = {
        status: 'PROCESSING',
        replicate_training_id: 'replicate-id-456',
      }
      const mockApiResponse = {
        id: trainingId,
        user_id: 'user-123',
        model_name: 'test-model',
        created_at: new Date().toISOString(),
        zip_url: 'http://example.com/file.zip',
        ...updates,
      } as ModelTraining

      const mockSupabaseFrom = supabase.from as any
      const mockUpdate = vi.fn()
      const mockEq = vi.fn()
      const mockSelect = vi.fn()
      const mockSingle = vi
        .fn()
        .mockResolvedValue({ data: mockApiResponse, error: null })

      mockSupabaseFrom.mockReturnValue({
        update: mockUpdate.mockReturnValue({
          eq: mockEq.mockReturnValue({
            select: mockSelect.mockReturnValue({
              single: mockSingle,
            }),
          }),
        }),
      })

      const result = await updateDigitalAvatarTraining(trainingId, updates)

      expect(supabase.from).toHaveBeenCalledWith('model_trainings')
      expect(mockUpdate).toHaveBeenCalledWith(updates)
      expect(mockEq).toHaveBeenCalledWith('id', trainingId)
      expect(result).toEqual(mockApiResponse)
    })

    it('should return null and log error if supabase.update fails', async () => {
      const trainingId = 'train-id-123'
      const updates: Partial<
        Omit<ModelTraining, 'id' | 'created_at' | 'user_id' | 'telegram_id'>
      > = {
        status: 'PROCESSING',
      }
      const mockError = {
        message: 'Update failed',
        details: 'DB error',
        hint: '',
        code: '',
      }

      const mockSupabaseFrom = supabase.from as any
      const mockUpdate = vi.fn()
      const mockEq = vi.fn()
      const mockSelect = vi.fn()
      const mockSingle = vi
        .fn()
        .mockResolvedValue({ data: null, error: mockError })

      mockSupabaseFrom.mockReturnValue({
        update: mockUpdate.mockReturnValue({
          eq: mockEq.mockReturnValue({
            select: mockSelect.mockReturnValue({
              single: mockSingle,
            }),
          }),
        }),
      })

      const result = await updateDigitalAvatarTraining(trainingId, updates)
      expect(result).toBeNull()
    })
  })

  describe('setDigitalAvatarTrainingError', () => {
    it('should call supabase.update with status FAILED and error message', async () => {
      const trainingId = 'training-id-error-123'
      const errorMessage = 'Something went terribly wrong'
      const mockApiResponse = {
        id: trainingId,
        status: 'FAILED',
        error: errorMessage,
        user_id: 'mock-user-id-for-error-test',
        model_name: 'mock-model-for-error-test',
        zip_url: 'http://example.com/error-zip.zip',
        cost_in_stars: 0,
        steps_amount: 0,
        created_at: new Date().toISOString(),
      } as ModelTraining

      const mockSupabaseFrom = supabase.from as any
      const mockUpdate = vi.fn()
      const mockEq = vi.fn()
      const mockSelect = vi.fn()
      const mockSingle = vi
        .fn()
        .mockResolvedValue({ data: mockApiResponse, error: null })

      mockSupabaseFrom.mockReturnValue({
        update: mockUpdate.mockReturnValue({
          eq: mockEq.mockReturnValue({
            select: mockSelect.mockReturnValue({
              single: mockSingle,
            }),
          }),
        }),
      })

      const result = await setDigitalAvatarTrainingError(
        trainingId,
        errorMessage
      )
      const expectedUpdatePayload = {
        status: 'FAILED',
        error_message: errorMessage,
      }
      expect(mockUpdate).toHaveBeenCalledWith(expectedUpdatePayload)
      expect(mockEq).toHaveBeenCalledWith('id', trainingId)
      expect(result).toEqual(mockApiResponse)
    })

    it('should return null and log error if supabase.update (for error) fails', async () => {
      const trainingId = 'train-id-789'
      const errorMessage = 'Something went terribly wrong'
      const mockDbError = {
        message: 'Update failed for error status',
        details: 'DB error',
        hint: '',
        code: '',
      }

      const mockSupabaseFrom = supabase.from as any
      const mockUpdate = vi.fn()
      const mockEq = vi.fn()
      const mockSelect = vi.fn()
      const mockSingle = vi
        .fn()
        .mockResolvedValue({ data: null, error: mockDbError })

      mockSupabaseFrom.mockReturnValue({
        update: mockUpdate.mockReturnValue({
          eq: mockEq.mockReturnValue({
            select: mockSelect.mockReturnValue({
              single: mockSingle,
            }),
          }),
        }),
      })

      const result = await setDigitalAvatarTrainingError(
        trainingId,
        errorMessage
      )
      expect(result).toBeNull()
    })
  })
})
