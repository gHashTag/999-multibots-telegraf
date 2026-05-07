/**
 * Tests for voiceValidation.ts
 *
 * Voice avatar validation and error messages
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'

// Mock dependencies before imports
vi.mock('@/core/elevenlabs', () => ({
  checkVoiceExists: vi.fn(),
}))

const mockUpdate = vi.fn().mockReturnThis()
const mockEq = vi.fn().mockResolvedValue({ data: null, error: null })
vi.mock('@/core/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: mockUpdate.mockReturnValue({ eq: mockEq }),
    })),
  },
}))

import {
  validateAndCleanVoiceId,
  getVoiceAvatarErrorMessage,
  getCreateVoiceAvatarMessage,
} from '@/helpers/voiceValidation'
import { checkVoiceExists } from '@/core/elevenlabs'
import { supabase } from '@/core/supabase'

describe('voiceValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Suppress console.log/error during tests
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  describe('validateAndCleanVoiceId', () => {
    const voiceId = 'voice-123'
    const telegramId = '123456789'

    describe('voice exists', () => {
      it('should return true when voice exists', async () => {
        ;(checkVoiceExists as Mock).mockResolvedValue(true)

        const result = await validateAndCleanVoiceId(voiceId, telegramId)

        expect(result).toBe(true)
        expect(checkVoiceExists).toHaveBeenCalledWith(voiceId)
      })

      it('should not update database when voice exists', async () => {
        ;(checkVoiceExists as Mock).mockResolvedValue(true)

        await validateAndCleanVoiceId(voiceId, telegramId)

        expect(supabase.from).not.toHaveBeenCalled()
      })
    })

    describe('voice does not exist', () => {
      it('should return false when voice does not exist', async () => {
        ;(checkVoiceExists as Mock).mockResolvedValue(false)

        const result = await validateAndCleanVoiceId(voiceId, telegramId)

        expect(result).toBe(false)
      })

      it('should clear voice ID from database when voice does not exist', async () => {
        ;(checkVoiceExists as Mock).mockResolvedValue(false)

        await validateAndCleanVoiceId(voiceId, telegramId)

        expect(supabase.from).toHaveBeenCalledWith('users')
        expect(mockUpdate).toHaveBeenCalledWith({ voice_id_elevenlabs: null })
        expect(mockEq).toHaveBeenCalledWith('telegram_id', telegramId)
      })

      it('should handle database error gracefully', async () => {
        ;(checkVoiceExists as Mock).mockResolvedValue(false)
        mockEq.mockRejectedValueOnce(new Error('Database error'))

        const result = await validateAndCleanVoiceId(voiceId, telegramId)

        // Should still return false
        expect(result).toBe(false)
        expect(console.error).toHaveBeenCalled()
      })
    })

    describe('error handling', () => {
      it('should return false on checkVoiceExists error', async () => {
        ;(checkVoiceExists as Mock).mockRejectedValue(new Error('API error'))

        const result = await validateAndCleanVoiceId(voiceId, telegramId)

        expect(result).toBe(false)
      })

      it('should log error on exception', async () => {
        ;(checkVoiceExists as Mock).mockRejectedValue(new Error('API error'))

        await validateAndCleanVoiceId(voiceId, telegramId)

        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Error validating voice ID'),
          expect.any(Error)
        )
      })
    })

    describe('logging', () => {
      it('should log validation start', async () => {
        ;(checkVoiceExists as Mock).mockResolvedValue(true)

        await validateAndCleanVoiceId(voiceId, telegramId)

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Starting validation'),
          voiceId
        )
      })

      it('should log validation success', async () => {
        ;(checkVoiceExists as Mock).mockResolvedValue(true)

        await validateAndCleanVoiceId(voiceId, telegramId)

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Voice validation successful'),
          voiceId
        )
      })

      it('should log when voice does not exist', async () => {
        ;(checkVoiceExists as Mock).mockResolvedValue(false)

        await validateAndCleanVoiceId(voiceId, telegramId)

        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('no longer exists')
        )
      })
    })
  })

  describe('getVoiceAvatarErrorMessage', () => {
    it('should return Russian error message', () => {
      const result = getVoiceAvatarErrorMessage(true)

      expect(result).toContain('❌')
      expect(result).toContain('больше не доступен')
      expect(result).toContain('Голос для аватара')
    })

    it('should return English error message', () => {
      const result = getVoiceAvatarErrorMessage(false)

      expect(result).toContain('❌')
      expect(result).toContain('no longer available')
      expect(result).toContain('Voice for avatar')
    })
  })

  describe('getCreateVoiceAvatarMessage', () => {
    it('should return Russian create message', () => {
      const result = getCreateVoiceAvatarMessage(true)

      expect(result).toContain('🎯')
      expect(result).toContain('обучите аватар')
      expect(result).toContain('Голос для аватара')
    })

    it('should return English create message', () => {
      const result = getCreateVoiceAvatarMessage(false)

      expect(result).toContain('🎯')
      expect(result).toContain('train the avatar')
      expect(result).toContain('Voice for avatar')
    })
  })
})
