import { describe, it, expect, beforeEach, vi } from 'vitest'
import { upscaleImage } from '../src/services/imageUpscaler'
import { replicate } from '../src/core/replicate'
import { getUserByTelegramIdString } from '../src/core/supabase'
import { processBalanceOperation } from '../src/price/helpers'
import { MyContext } from '../src/interfaces'

vi.mock('../src/core/replicate')
vi.mock('../src/core/supabase')
vi.mock('../src/price/helpers')
vi.mock('../src/helpers/saveFileLocally')
vi.mock('../src/helpers/pulse')
vi.mock('../src/utils/logger')

describe('imageUpscaler', () => {
  let mockCtx: MyContext

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockCtx = {
      from: { id: 123456789, username: 'testuser' },
      botInfo: { username: 'test_bot' },
      telegram: {
        sendMessage: vi.fn(),
        sendPhoto: vi.fn().mockResolvedValue({
          message_id: 1,
          chat: { id: 123456789 }
        })
      }
    } as any
  })

  describe('upscaleImage', () => {
    it('должен проверить существование пользователя', async () => {
      vi.mocked(getUserByTelegramIdString).mockResolvedValue(null)
      
      await expect(upscaleImage({
        imageUrl: 'https://example.com/image.jpg',
        telegram_id: '123456789',
        username: 'testuser',
        is_ru: true,
        ctx: mockCtx,
        originalPrompt: 'test prompt'
      })).rejects.toThrow('User with ID 123456789 does not exist')
      
      expect(getUserByTelegramIdString).toHaveBeenCalledWith('123456789')
    })

    it('должен проверить баланс пользователя', async () => {
      vi.mocked(getUserByTelegramIdString).mockResolvedValue({ id: '123456789' } as any)
      vi.mocked(processBalanceOperation).mockResolvedValue({ success: false })
      
      await expect(upscaleImage({
        imageUrl: 'https://example.com/image.jpg',
        telegram_id: '123456789',
        username: 'testuser',
        is_ru: true,
        ctx: mockCtx,
        originalPrompt: 'test prompt'
      })).rejects.toThrow('Not enough stars')
      
      expect(processBalanceOperation).toHaveBeenCalled()
    })

    it('должен вызвать Replicate API с правильными параметрами', async () => {
      vi.mocked(getUserByTelegramIdString).mockResolvedValue({ id: '123456789' } as any)
      vi.mocked(processBalanceOperation).mockResolvedValue({ success: true })
      vi.mocked(replicate.run).mockResolvedValue(['https://result.com/upscaled.jpg'])
      
      const params = {
        imageUrl: 'https://example.com/image.jpg',
        telegram_id: '123456789',
        username: 'testuser',
        is_ru: true,
        ctx: mockCtx,
        originalPrompt: 'test prompt'
      }
      
      try {
        await upscaleImage(params)
      } catch (e) {
        // Ожидаем ошибку из-за отсутствия мока для saveFileLocally
      }
      
      expect(replicate.run).toHaveBeenCalledWith(
        'philz1337x/clarity-upscaler:dfad41707589d68ecdccd1dfa600d55a208f9310748e44bfe35b4a6291453d5e',
        {
          input: {
            image: 'https://example.com/image.jpg',
            creativity: 0.1
          }
        }
      )
    })
  })
})