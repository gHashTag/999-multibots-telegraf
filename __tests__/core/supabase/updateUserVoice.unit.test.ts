import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Мокаем цепочку
const mockEq = jest.fn<() => Promise<{ data: any; error: any }>>()
const mockUpdate = jest.fn(() => ({ eq: mockEq }))
jest.mock('@/core/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({ update: mockUpdate })),
  },
}))

import { supabase } from '@/core/supabase'
import { updateUserVoice } from '@/core/supabase/updateUserVoice'

describe('updateUserVoice', () => {
  const telegram_id = 'user789'
  const voice_id_elevenlabs = 'voice123'

  beforeEach(() => {
    mockEq.mockReset()
    mockUpdate.mockClear()
    ;(supabase.from as jest.Mock).mockClear()
  })

  it('resolves when update succeeds', async () => {
    // Мокаем успех
    mockEq.mockResolvedValue({ data: {}, error: null })
    await expect(
      updateUserVoice(telegram_id, voice_id_elevenlabs)
    ).resolves.toBeUndefined()
    expect(supabase.from).toHaveBeenCalledWith('users')
    expect(mockUpdate).toHaveBeenCalledWith({ voice_id_elevenlabs })
    expect(mockEq).toHaveBeenCalledWith('telegram_id', telegram_id)
  })

  it('throws error when update returns error', async () => {
    const errorObj = { message: 'failVoice' }
    // Мокаем ошибку
    mockEq.mockResolvedValue({ data: null, error: errorObj })
    await expect(
      updateUserVoice(telegram_id, voice_id_elevenlabs)
    ).rejects.toThrow(`Ошибка при обновлении пользователя: ${errorObj.message}`)
    expect(supabase.from).toHaveBeenCalledWith('users')
    expect(mockUpdate).toHaveBeenCalledWith({ voice_id_elevenlabs })
    expect(mockEq).toHaveBeenCalledWith('telegram_id', telegram_id)
  })
})
