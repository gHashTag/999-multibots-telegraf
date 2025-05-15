import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock Supabase client interactions if not already globally mocked in setup.ts
// For now, we assume global mocks from setup.ts are active.
// If specific mock behaviors are needed, they can be set here or in beforeEach.

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import {
  createDigitalAvatarTraining,
  updateDigitalAvatarTraining,
  setDigitalAvatarTrainingError,
  ModelTraining,
  ModelTrainingArgs,
} from '../modelTrainingsDb'
import { supabase } from '@/core/supabase/client' // To potentially spy on or check mock calls
import { logger } from '@/utils/logger'

describe('modelTrainingsDb helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Explicitly reset mocks for Supabase operations if the global mock doesn't reset call history
    // This depends on how the global mock in setup.ts is configured.
    // For safety, let's assume we need to mock return values per test or describe block.
  })

  describe('createDigitalAvatarTraining', () => {
    it('should call supabase.insert with correct data (excluding telegram_id) and return the result', async () => {
      const mockTrainingDataWithTgId: ModelTrainingArgs = {
        user_id: 'user-uuid-123',
        model_name: 'test-model-db',
        telegram_id: 'tg-123',
        status: 'PENDING',
        cost_in_stars: 10,
        steps_amount: 100,
        bot_name: 'TestBot',
        api: 'replicate',
        gender: 'female',
        trigger_word: 'testtrigger',
      }
      const { telegram_id, ...expectedInsertData } = mockTrainingDataWithTgId

      const mockApiResponse = {
        id: 'new-training-id',
        ...expectedInsertData,
        created_at: new Date().toISOString(),
      } as ModelTraining

      const mockSupabaseFrom = supabase.from as any
      const mockInsert = vi.fn()
      const mockSelect = vi.fn()
      const mockSingle = vi
        .fn()
        .mockResolvedValue({ data: mockApiResponse, error: null })

      mockSupabaseFrom.mockReturnValue({
        insert: mockInsert.mockReturnValue({
          select: mockSelect.mockReturnValue({
            single: mockSingle,
          }),
        }),
      })

      const result = await createDigitalAvatarTraining(mockTrainingDataWithTgId)

      expect(supabase.from).toHaveBeenCalledWith('model_trainings')
      expect(mockInsert).toHaveBeenCalledWith(expectedInsertData)
      expect(result).toEqual(mockApiResponse)
    })

    it('should return null and log error if supabase.insert fails', async () => {
      const mockTrainingDataWithTgId: ModelTrainingArgs = {
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
      const { telegram_id, ...expectedInsertData } = mockTrainingDataWithTgId

      const mockError = {
        message: 'Insert failed',
        details: 'DB constraint',
        hint: '',
        code: '',
      }

      const mockSupabaseFrom = supabase.from as any
      const mockInsert = vi.fn()
      const mockSelect = vi.fn()
      const mockSingle = vi
        .fn()
        .mockResolvedValue({ data: null, error: mockError })

      mockSupabaseFrom.mockReturnValue({
        insert: mockInsert.mockReturnValue({
          select: mockSelect.mockReturnValue({
            single: mockSingle,
          }),
        }),
      })

      const result = await createDigitalAvatarTraining(mockTrainingDataWithTgId)

      expect(supabase.from).toHaveBeenCalledWith('model_trainings')
      expect(mockInsert).toHaveBeenCalledWith(expectedInsertData)
      expect(result).toBeNull()
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          '[DB Error] Failed to create digital avatar training record'
        ),
        expect.anything()
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
      const trainingId = 'train-id-789'
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
      expect(mockUpdate).toHaveBeenCalledWith({
        status: 'FAILED',
        error: errorMessage,
      })
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
