import {
  validateVideoInput,
  validateAudioInput,
  validateSession,
  validateTelegramFile,
  isValidAdmin,
  LIPSYNC_CONSTANTS,
  LipsyncRequestSchema,
  MediaInputSchema,
  LipsyncSessionSchema,
  TelegramFileSchema,
  AdminValidationSchema
} from '../../interfaces/zod/lipsync.zod'
import { z } from 'zod'

describe('LipSync Zod Validation', () => {
  describe('URL Validation', () => {
    it('should validate correct video URL', () => {
      const videoInput = {
        type: 'url' as const,
        url: 'https://example.com/video.mp4'
      }
      
      expect(() => validateVideoInput(videoInput)).not.toThrow()
    })
    
    it('should reject invalid URL', () => {
      const videoInput = {
        type: 'url' as const,
        url: 'invalid-url'
      }
      
      expect(() => validateVideoInput(videoInput)).toThrow(z.ZodError)
    })
    
    it('should reject empty URL', () => {
      const videoInput = {
        type: 'url' as const,
        url: ''
      }
      
      expect(() => validateVideoInput(videoInput)).toThrow(z.ZodError)
    })
  })
  
  describe('Telegram File Validation', () => {
    it('should validate correct Telegram file', () => {
      const telegramFile = {
        file_id: 'BAADBAADrwADBREAAUmcOUPKjjQ-Ag',
        file_size: 1024 * 1024,
        file_path: 'photos/file_1.jpg'
      }
      
      expect(() => validateTelegramFile(telegramFile)).not.toThrow()
    })
    
    it('should reject file that is too large', () => {
      const telegramFile = {
        file_id: 'BAADBAADrwADBREAAUmcOUPKjjQ-Ag',
        file_size: LIPSYNC_CONSTANTS.MAX_FILE_SIZE + 1,
        file_path: 'photos/file_1.jpg'
      }
      
      expect(() => validateTelegramFile(telegramFile)).toThrow(z.ZodError)
    })
    
    it('should reject empty file_id', () => {
      const telegramFile = {
        file_id: '',
        file_size: 1024,
        file_path: 'photos/file_1.jpg'
      }
      
      expect(() => validateTelegramFile(telegramFile)).toThrow(z.ZodError)
    })
  })
  
  describe('Media Input Validation', () => {
    it('should validate URL media input', () => {
      const mediaInput = {
        type: 'url' as const,
        url: 'https://example.com/audio.mp3'
      }
      
      const result = MediaInputSchema.parse(mediaInput)
      expect(result.type).toBe('url')
      expect(result.url).toBe('https://example.com/audio.mp3')
    })
    
    it('should validate Telegram file media input', () => {
      const mediaInput = {
        type: 'telegram_file' as const,
        file: {
          file_id: 'BAADBAADrwADBREAAUmcOUPKjjQ-Ag',
          file_size: 1024
        },
        bot_token: 'test_token_mock_123456789'
      }
      
      const result = MediaInputSchema.parse(mediaInput)
      expect(result.type).toBe('telegram_file')
      expect(result.bot_token).toBe('test_token_mock_123456789')
    })
  })
  
  describe('Session Validation', () => {
    it('should validate correct session', () => {
      const session = {
        videoUrl: 'https://example.com/video.mp4',
        audioUrl: 'https://example.com/audio.mp3',
        step: 'processing' as const,
        startTime: Date.now()
      }
      
      expect(() => validateSession(session)).not.toThrow()
    })
    
    it('should validate session with default values', () => {
      const session = {}
      
      const result = LipsyncSessionSchema.parse(session)
      expect(result.step).toBe('video')
    })
    
    it('should reject invalid step', () => {
      const session = {
        step: 'invalid_step'
      }
      
      expect(() => LipsyncSessionSchema.parse(session)).toThrow(z.ZodError)
    })
  })
  
  describe('LipSync Request Validation', () => {
    it('should validate complete LipSync request', () => {
      const request = {
        video_input: {
          type: 'url' as const,
          url: 'https://example.com/video.mp4'
        },
        audio_input: {
          type: 'url' as const,
          url: 'https://example.com/audio.mp3'
        },
        user_id: '12345',
        bot_name: 'test_bot',
        config: {
          model: 'kling-lipsync' as const,
          quality: 'high' as const
        }
      }
      
      const result = LipsyncRequestSchema.parse(request)
      expect(result.user_id).toBe('12345')
      expect(result.bot_name).toBe('test_bot')
      expect(result.config?.model).toBe('kling-lipsync')
    })
    
    it('should use default config values', () => {
      const request = {
        video_input: {
          type: 'url' as const,
          url: 'https://example.com/video.mp4'
        },
        audio_input: {
          type: 'url' as const,
          url: 'https://example.com/audio.mp3'
        },
        user_id: '12345',
        bot_name: 'test_bot'
      }
      
      const result = LipsyncRequestSchema.parse(request)
      expect(result.config?.model).toBe('kling-lipsync')
      expect(result.config?.quality).toBe('medium')
      expect(result.metadata).toEqual({})
    })
    
    it('should reject request with missing required fields', () => {
      const request = {
        video_input: {
          type: 'url' as const,
          url: 'https://example.com/video.mp4'
        }
      }
      
      expect(() => LipsyncRequestSchema.parse(request)).toThrow(z.ZodError)
    })
  })
  
  describe('Admin Validation', () => {
    it('should validate admin correctly', () => {
      const adminIds = ['123', '456', '789']
      
      expect(isValidAdmin('123', adminIds)).toBe(true)
      expect(isValidAdmin('456', adminIds)).toBe(true)
      expect(isValidAdmin('999', adminIds)).toBe(false)
    })
    
    it('should handle empty admin list', () => {
      const adminIds: string[] = []
      
      expect(isValidAdmin('123', adminIds)).toBe(false)
    })
    
    it('should handle invalid input gracefully', () => {
      expect(isValidAdmin('', ['123'])).toBe(false)
    })
  })
  
  describe('Constants Validation', () => {
    it('should have correct constants', () => {
      expect(LIPSYNC_CONSTANTS.MAX_FILE_SIZE).toBe(50 * 1024 * 1024)
      expect(LIPSYNC_CONSTANTS.MAX_DURATION).toBe(300)
      expect(LIPSYNC_CONSTANTS.DEFAULT_MODEL).toBe('kling-lipsync')
      expect(LIPSYNC_CONSTANTS.DEFAULT_QUALITY).toBe('medium')
      
      expect(LIPSYNC_CONSTANTS.SUPPORTED_VIDEO_FORMATS).toContain('mp4')
      expect(LIPSYNC_CONSTANTS.SUPPORTED_AUDIO_FORMATS).toContain('mp3')
    })
  })
  
  describe('Error Handling', () => {
    it('should provide detailed error messages', () => {
      try {
        MediaInputSchema.parse({
          type: 'url',
          url: 'invalid-url'
        })
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError)
        const zodError = error as z.ZodError
        expect(zodError.errors[0].message).toContain('Неверный формат URL')
      }
    })
    
    it('should handle nested validation errors', () => {
      try {
        LipsyncRequestSchema.parse({
          video_input: {
            type: 'url',
            url: ''
          },
          audio_input: {
            type: 'url',
            url: 'https://example.com/audio.mp3'
          },
          user_id: '',
          bot_name: ''
        })
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError)
        const zodError = error as z.ZodError
        expect(zodError.errors.length).toBeGreaterThan(1)
      }
    })
  })
  
  describe('Real-world Scenarios', () => {
    it('should validate typical Telegram video upload', () => {
      const videoInput = {
        type: 'telegram_file' as const,
        file: {
          file_id: 'BAADBAADrwADBREAAUmcOUPKjjQ-Ag',
          file_size: 5 * 1024 * 1024,
          file_path: 'videos/video_123.mp4'
        },
        bot_token: 'test_token_mock_123456789'
      }
      
      expect(() => validateVideoInput(videoInput)).not.toThrow()
    })
    
    it('should validate typical voice message', () => {
      const audioInput = {
        type: 'telegram_file' as const,
        file: {
          file_id: 'AwADBAADrwADBREAAUmcOUPKjjQ-Ag',
          file_size: 256 * 1024
        },
        bot_token: 'test_token_mock_123456789'
      }
      
      expect(() => validateAudioInput(audioInput)).not.toThrow()
    })
    
    it('should validate complete user workflow', () => {
      const session1 = { step: 'video' as const, startTime: Date.now() }
      const validSession1 = validateSession(session1)
      expect(validSession1.step).toBe('video')
      
      const session2 = {
        ...validSession1,
        videoUrl: 'https://example.com/video.mp4',
        step: 'audio' as const
      }
      const validSession2 = validateSession(session2)
      expect(validSession2.step).toBe('audio')
      
      const session3 = {
        ...validSession2,
        audioUrl: 'https://example.com/audio.mp3',
        step: 'processing' as const
      }
      const validSession3 = validateSession(session3)
      expect(validSession3.step).toBe('processing')
      expect(validSession3.videoUrl).toBe('https://example.com/video.mp4')
      expect(validSession3.audioUrl).toBe('https://example.com/audio.mp3')
    })
  })
})